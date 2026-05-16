 /**
 * ============================================================
 *  CHESS PIECE MOVEMENT RULES
 *  chess-pieces.js
 *
 *  Pure JavaScript, zero dependencies.
 *  Covers how every chess piece moves and captures.
 *
 *  Exposed globals (browser):
 *    ChessPieces.getMoves(board, square, enPassant)
 *    ChessPieces.PIECES
 *    ChessPieces.COLORS
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  CONSTANTS
  // ──────────────────────────────────────────────

  const PIECES = {
    KING:   "K",
    QUEEN:  "Q",
    ROOK:   "R",
    BISHOP: "B",
    KNIGHT: "N",
    PAWN:   "P",
  };

  const COLORS = {
    WHITE: "white",
    BLACK: "black",
  };

  // ──────────────────────────────────────────────
  //  COORDINATE HELPERS
  // ──────────────────────────────────────────────

  /**
   * Convert algebraic square to row/col.
   * "a8" → { row:0, col:0 }
   * "h1" → { row:7, col:7 }
   */
  function squareToCoords(sq) {
    const col = sq.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
    const row = 8 - parseInt(sq[1], 10); // '8'=0 … '1'=7
    return { row, col };
  }

  /**
   * Convert row/col back to algebraic square.
   * { row:0, col:0 } → "a8"
   */
  function coordsToSquare(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  /** Is a row/col coordinate on the board? */
  function inBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  // ──────────────────────────────────────────────
  //  BOARD FORMAT
  // ──────────────────────────────────────────────
  //
  //  `board` is an 8×8 array (row 0 = rank 8, row 7 = rank 1).
  //  Each cell is either null (empty) or:
  //    { type: "P"|"N"|"B"|"R"|"Q"|"K",  color: "white"|"black" }
  //
  //  Example — starting position white pawn on e2:
  //    board[6][4] = { type: "P", color: "white" }

  // ──────────────────────────────────────────────
  //  SLIDING PIECE HELPER
  // ──────────────────────────────────────────────

  /**
   * Collect all squares reachable by sliding in direction (dr, dc).
   * Stops at the board edge, a friendly piece (not added),
   * or an enemy piece (added as capture, then stops).
   */
  function slide(board, row, col, color, dr, dc, results) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const target = board[r][c];
      if (!target) {
        // Empty square — can move here
        results.push({ square: coordsToSquare(r, c), capture: false });
      } else if (target.color !== color) {
        // Enemy piece — can capture, then must stop
        results.push({ square: coordsToSquare(r, c), capture: true });
        break;
      } else {
        // Friendly piece — blocked, stop
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // ──────────────────────────────────────────────
  //  INDIVIDUAL PIECE MOVE FUNCTIONS
  // ──────────────────────────────────────────────

  /**
   * PAWN moves.
   * Handles: single push, double push from start rank,
   *          diagonal captures, en-passant, promotion flag.
   *
   * @param {Array}  board      - 8×8 board
   * @param {number} row        - pawn's current row
   * @param {number} col        - pawn's current col
   * @param {string} color      - "white" | "black"
   * @param {string|null} enPassant - target square for en-passant (e.g. "e6") or null
   * @returns {Array} list of move objects
   */
  function pawnMoves(board, row, col, color, enPassant) {
    const moves = [];
    const dir      = color === COLORS.WHITE ? -1 : 1;  // white moves up (row-1), black down
    const startRow = color === COLORS.WHITE ? 6 : 1;   // rank 2 for white, rank 7 for black
    const promoRow = color === COLORS.WHITE ? 0 : 7;   // rank 8 for white, rank 1 for black

    // ── Single step forward ──
    const r1 = row + dir;
    if (inBounds(r1, col) && !board[r1][col]) {
      moves.push({
        square:    coordsToSquare(r1, col),
        capture:   false,
        doublePush: false,
        enPassant:  false,
        promotion:  r1 === promoRow,  // true if pawn reaches back rank
      });

      // ── Double step from starting rank ──
      const r2 = row + 2 * dir;
      if (row === startRow && !board[r2][col]) {
        moves.push({
          square:    coordsToSquare(r2, col),
          capture:   false,
          doublePush: true,   // engine uses this to set the en-passant square
          enPassant:  false,
          promotion:  false,
        });
      }
    }

    // ── Diagonal captures ──
    for (const dc of [-1, 1]) {
      const nr = row + dir;
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;

      const target = board[nr][nc];

      // Normal diagonal capture
      if (target && target.color !== color) {
        moves.push({
          square:    coordsToSquare(nr, nc),
          capture:   true,
          doublePush: false,
          enPassant:  false,
          promotion:  nr === promoRow,
        });
      }

      // En-passant capture
      if (enPassant) {
        const ep = squareToCoords(enPassant);
        if (ep.row === nr && ep.col === nc) {
          moves.push({
            square:    coordsToSquare(nr, nc),
            capture:   true,
            doublePush: false,
            enPassant:  true,  // the captured pawn is on a different square
            promotion:  false,
          });
        }
      }
    }

    return moves;
  }

  /**
   * KNIGHT moves.
   * Jumps in an L-shape: 2 squares one way, 1 the other.
   * Can leap over other pieces.
   */
  function knightMoves(board, row, col, color) {
    const moves = [];
    const jumps = [
      [-2, -1], [-2, +1],
      [-1, -2], [-1, +2],
      [+1, -2], [+1, +2],
      [+2, -1], [+2, +1],
    ];
    for (const [dr, dc] of jumps) {
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target) {
        moves.push({ square: coordsToSquare(nr, nc), capture: false });
      } else if (target.color !== color) {
        moves.push({ square: coordsToSquare(nr, nc), capture: true });
      }
      // friendly piece → skip
    }
    return moves;
  }

  /**
   * BISHOP moves.
   * Slides diagonally in all four diagonal directions.
   * Blocked by any piece; captures enemy pieces.
   */
  function bishopMoves(board, row, col, color) {
    const moves = [];
    for (const [dr, dc] of [[-1,-1], [-1,+1], [+1,-1], [+1,+1]]) {
      slide(board, row, col, color, dr, dc, moves);
    }
    return moves;
  }

  /**
   * ROOK moves.
   * Slides horizontally and vertically.
   * Blocked by any piece; captures enemy pieces.
   */
  function rookMoves(board, row, col, color) {
    const moves = [];
    for (const [dr, dc] of [[-1,0], [+1,0], [0,-1], [0,+1]]) {
      slide(board, row, col, color, dr, dc, moves);
    }
    return moves;
  }

  /**
   * QUEEN moves.
   * Combines rook + bishop: slides in all 8 directions.
   */
  function queenMoves(board, row, col, color) {
    const moves = [];
    for (const [dr, dc] of [
      [-1,-1], [-1,0], [-1,+1],
      [ 0,-1],          [ 0,+1],
      [+1,-1], [+1,0], [+1,+1],
    ]) {
      slide(board, row, col, color, dr, dc, moves);
    }
    return moves;
  }

  /**
   * KING moves.
   * One square in any direction.
   * Also handles castling — pass castling rights object:
   *   { K: bool, Q: bool, k: bool, q: bool }
   * (The caller is responsible for ensuring the king and
   *  rook haven't moved; this function trusts those flags.)
   *
   * NOTE: This does NOT check if the destination is attacked.
   *       That check-safety filter is the engine's responsibility.
   */
  function kingMoves(board, row, col, color, castling = {}) {
    const moves = [];
    for (const [dr, dc] of [
      [-1,-1], [-1,0], [-1,+1],
      [ 0,-1],          [ 0,+1],
      [+1,-1], [+1,0], [+1,+1],
    ]) {
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target) {
        moves.push({ square: coordsToSquare(nr, nc), capture: false, castle: null });
      } else if (target.color !== color) {
        moves.push({ square: coordsToSquare(nr, nc), capture: true,  castle: null });
      }
    }

    // ── Castling ──
    // King must be on its home square (e1 for white, e8 for black)
    const backRank = color === COLORS.WHITE ? 7 : 0;
    if (row === backRank && col === 4) {

      // King-side castling (O-O): squares f and g must be empty
      const ksKey = color === COLORS.WHITE ? "K" : "k";
      if (castling[ksKey] && !board[backRank][5] && !board[backRank][6]) {
        moves.push({
          square:  coordsToSquare(backRank, 6),
          capture: false,
          castle:  "kingside",
        });
      }

      // Queen-side castling (O-O-O): squares b, c, d must be empty
      const qsKey = color === COLORS.WHITE ? "Q" : "q";
      if (
        castling[qsKey] &&
        !board[backRank][3] &&
        !board[backRank][2] &&
        !board[backRank][1]
      ) {
        moves.push({
          square:  coordsToSquare(backRank, 2),
          capture: false,
          castle:  "queenside",
        });
      }
    }

    return moves;
  }

  // ──────────────────────────────────────────────
  //  MAIN EXPORT FUNCTION
  // ──────────────────────────────────────────────

  /**
   * Get all pseudo-legal moves for the piece on `square`.
   * "Pseudo-legal" means the moves follow piece movement rules
   * but do NOT filter for leaving your own king in check —
   * that is the chess engine's job.
   *
   * @param {Array}       board      - 8×8 board array
   * @param {string}      square     - algebraic square, e.g. "e2"
   * @param {string|null} enPassant  - en-passant target square or null
   * @param {Object}      castling   - { K, Q, k, q } booleans (optional)
   *
   * @returns {Array} Array of move objects:
   *   {
   *     square:    string,   // destination square e.g. "e4"
   *     capture:   boolean,  // true if this move captures a piece
   *     // pawn-only extras:
   *     doublePush: boolean,
   *     enPassant:  boolean,
   *     promotion:  boolean,
   *     // king-only extra:
   *     castle:    "kingside" | "queenside" | null,
   *   }
   *
   * Returns [] if the square is empty.
   *
   * Example:
   *   const moves = ChessPieces.getMoves(board, "e2");
   *   // → [{ square:"e3", capture:false, ... }, { square:"e4", doublePush:true, ... }]
   */
  function getMoves(board, square, enPassant = null, castling = {}) {
    const { row, col } = squareToCoords(square);
    const piece = board[row][col];
    if (!piece) return [];

    const { type, color } = piece;

    switch (type) {
      case PIECES.PAWN:   return pawnMoves(board, row, col, color, enPassant);
      case PIECES.KNIGHT: return knightMoves(board, row, col, color);
      case PIECES.BISHOP: return bishopMoves(board, row, col, color);
      case PIECES.ROOK:   return rookMoves(board, row, col, color);
      case PIECES.QUEEN:  return queenMoves(board, row, col, color);
      case PIECES.KING:   return kingMoves(board, row, col, color, castling);
      default:            return [];
    }
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  const ChessPieces = { getMoves, PIECES, COLORS };

  if (typeof window !== "undefined") {
    window.ChessPieces = ChessPieces;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ChessPieces;
  }

})(typeof window !== "undefined" ? window : global);