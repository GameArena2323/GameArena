/**
 * ============================================================
 *  CHESS ENGINE — Game State, Legal Moves & Check Detection
 *  chess-engine.js
 *
 *  Depends on: chess-pieces.js  (must be loaded first)
 *
 *  Pure JavaScript, zero dependencies beyond chess-pieces.js.
 *  No AI here — that lives in chess-ai.js.
 *
 *  Exposed global (browser):
 *    window.ChessEngine          — the main class
 *    window.ChessEngineInternals — low-level helpers (for chess-ai.js)
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessPieces === "undefined") {
    throw new Error("chess-engine.js requires chess-pieces.js to be loaded first.");
  }

  const { getMoves, PIECES, COLORS } = ChessPieces;

  // ──────────────────────────────────────────────
  //  COORDINATE HELPERS
  // ──────────────────────────────────────────────

  /** "e4" → { row: 4, col: 4 } */
  function squareToCoords(sq) {
    return {
      col: sq.charCodeAt(0) - 97,
      row: 8 - parseInt(sq[1], 10),
    };
  }

  /** { row, col } → "e4" */
  function coordsToSquare(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  /** Deep-clone an 8×8 board */
  function cloneBoard(board) {
    return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  }

  /** Opposite colour */
  function opponent(color) {
    return color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
  }

  // ──────────────────────────────────────────────
  //  FEN PARSER & SERIALISER
  // ──────────────────────────────────────────────

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  /**
   * Parse a FEN string into a game state object:
   * {
   *   board,      — 8x8 array of { type, color } | null
   *   turn,       — "white" | "black"
   *   castling,   — { K, Q, k, q } booleans
   *   enPassant,  — square string | null
   *   halfMove,   — integer (50-move counter)
   *   fullMove,   — integer
   * }
   */
  function parseFEN(fen) {
    const [placement, turn, castStr, ep, half, full] = fen.split(" ");

    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    let row = 0, col = 0;

    for (const ch of placement) {
      if (ch === "/") {
        row++; col = 0;
      } else if (/\d/.test(ch)) {
        col += parseInt(ch, 10);
      } else {
        const color = ch === ch.toUpperCase() ? COLORS.WHITE : COLORS.BLACK;
        board[row][col] = { type: ch.toUpperCase(), color };
        col++;
      }
    }

    return {
      board,
      turn:      turn === "w" ? COLORS.WHITE : COLORS.BLACK,
      castling: {
        K: castStr.includes("K"),
        Q: castStr.includes("Q"),
        k: castStr.includes("k"),
        q: castStr.includes("q"),
      },
      enPassant: ep === "-" ? null : ep,
      halfMove:  parseInt(half, 10),
      fullMove:  parseInt(full, 10),
    };
  }

  /** Serialize a game state back to a FEN string */
  function toFEN(state) {
    const { board, turn, castling, enPassant, halfMove, fullMove } = state;

    let placement = "";
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) {
          empty++;
        } else {
          if (empty) { placement += empty; empty = 0; }
          placement += p.color === COLORS.WHITE
            ? p.type.toUpperCase()
            : p.type.toLowerCase();
        }
      }
      if (empty) placement += empty;
      if (r < 7) placement += "/";
    }

    const castStr =
      (castling.K ? "K" : "") +
      (castling.Q ? "Q" : "") +
      (castling.k ? "k" : "") +
      (castling.q ? "q" : "") || "-";

    return [
      placement,
      turn === COLORS.WHITE ? "w" : "b",
      castStr,
      enPassant || "-",
      halfMove,
      fullMove,
    ].join(" ");
  }

  // ──────────────────────────────────────────────
  //  ATTACK DETECTION
  // ──────────────────────────────────────────────

  /**
   * Is square (kr, kc) attacked by any piece of `attackerColor`?
   * Used for check detection and castling path validation.
   */
  function isSquareAttacked(board, kr, kc, attackerColor) {
    const targetSq = coordsToSquare(kr, kc);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== attackerColor) continue;

        // Raw moves — no en-passant/castling needed purely for attack detection
        const moves = getMoves(board, coordsToSquare(r, c), null, {});
        if (moves.some((m) => m.square === targetSq)) return true;
      }
    }
    return false;
  }

  /**
   * Is `color`'s king currently in check?
   */
  function isInCheck(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === PIECES.KING && p.color === color) {
          return isSquareAttacked(board, r, c, opponent(color));
        }
      }
    }
    return false;
  }

  // ──────────────────────────────────────────────
  //  MOVE APPLICATION
  // ──────────────────────────────────────────────

  /**
   * Apply a move to a cloned board and return the new board.
   * Does NOT validate legality — caller is responsible.
   *
   * @param {Array}  board
   * @param {string} from        — "e2"
   * @param {string} to          — "e4"
   * @param {Object} flags       — from getMoves() output
   * @param {string} [promotion] — "Q"|"R"|"B"|"N"
   * @returns {Array} new 8x8 board
   */
  function applyMove(board, from, to, flags, promotion = PIECES.QUEEN) {
    const newBoard = cloneBoard(board);
    const { row: fr, col: fc } = squareToCoords(from);
    const { row: tr, col: tc } = squareToCoords(to);
    const piece = newBoard[fr][fc];

    // En-passant: remove the captured pawn (not on `to` square)
    if (flags.enPassant) {
      const capturedRow = piece.color === COLORS.WHITE ? tr + 1 : tr - 1;
      newBoard[capturedRow][tc] = null;
    }

    // Castling: move the rook alongside the king
    if (flags.castle) {
      const rank = fr;
      if (flags.castle === "kingside") {
        newBoard[rank][5] = newBoard[rank][7]; // rook h-file → f-file
        newBoard[rank][7] = null;
      } else {
        newBoard[rank][3] = newBoard[rank][0]; // rook a-file → d-file
        newBoard[rank][0] = null;
      }
    }

    // Place the piece (handle promotion)
    newBoard[tr][tc] = flags.promotion && promotion
      ? { type: promotion, color: piece.color }
      : { ...piece };

    newBoard[fr][fc] = null;
    return newBoard;
  }

  // ──────────────────────────────────────────────
  //  LEGAL MOVE GENERATION
  // ──────────────────────────────────────────────

  /**
   * Return every fully legal move for the side to move.
   *
   * A pseudo-legal move is legal only if:
   *   1. It follows piece movement rules (chess-pieces.js)
   *   2. It does not leave the own king in check
   *   3. Castling does not pass through an attacked square
   *
   * Promotion moves are expanded into 4 entries (Q, R, B, N).
   *
   * Each move:
   * {
   *   from: string,
   *   to:   string,
   *   flags: {
   *     capture:    boolean,
   *     doublePush: boolean,
   *     enPassant:  boolean,
   *     promotion:  string | null,   — piece type if this is a promo move
   *     castle:     "kingside" | "queenside" | null,
   *   }
   * }
   */
  function generateLegalMoves(state) {
    const { board, turn, enPassant, castling } = state;
    const legal = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== turn) continue;

        const from = coordsToSquare(r, c);
        const candidates = getMoves(board, from, enPassant, castling);

        for (const cand of candidates) {
          const to = cand.square;

          // ── Castling: extra legality checks ──
          if (cand.castle) {
            // King must not currently be in check
            if (isSquareAttacked(board, r, c, opponent(turn))) continue;
            // King must not pass through an attacked square
            const passThroughCol = cand.castle === "kingside" ? 5 : 3;
            if (isSquareAttacked(board, r, passThroughCol, opponent(turn))) continue;
          }

          // ── Expand promotions into 4 choices ──
          const promoChoices = cand.promotion
            ? [PIECES.QUEEN, PIECES.ROOK, PIECES.BISHOP, PIECES.KNIGHT]
            : [null];

          for (const promo of promoChoices) {
            const flags = { ...cand, promotion: promo };
            const newBoard = applyMove(board, from, to, flags, promo);

            // Legal only if own king is not in check after the move
            if (!isInCheck(newBoard, turn)) {
              legal.push({ from, to, flags });
            }
          }
        }
      }
    }

    return legal;
  }

  // ──────────────────────────────────────────────
  //  CASTLING RIGHTS UPDATE
  // ──────────────────────────────────────────────

  /**
   * Return updated castling rights after executing a move.
   * Rights are lost when a king or rook moves, or a rook is captured.
   */
  function updateCastling(castling, piece, from, to) {
    const c = { ...castling };

    if (piece.type === PIECES.KING) {
      if (piece.color === COLORS.WHITE) { c.K = false; c.Q = false; }
      else                              { c.k = false; c.q = false; }
    }

    if (piece.type === PIECES.ROOK) {
      if (from === "h1") c.K = false;
      if (from === "a1") c.Q = false;
      if (from === "h8") c.k = false;
      if (from === "a8") c.q = false;
    }

    // Rook captured on its home square
    if (to === "h1") c.K = false;
    if (to === "a1") c.Q = false;
    if (to === "h8") c.k = false;
    if (to === "a8") c.q = false;

    return c;
  }

  // ──────────────────────────────────────────────
  //  GAME STATUS
  // ──────────────────────────────────────────────

  /**
   * Evaluate the current game status.
   *
   * Returns one of:
   *   "playing"       — game is ongoing
   *   "checkmate"     — current side has no legal moves and is in check
   *   "stalemate"     — current side has no legal moves, not in check
   *   "draw-50"       — fifty-move rule (halfMove >= 100 half-moves)
   *   "draw-material" — insufficient mating material
   */
  function getGameStatus(state) {
    // Fifty-move rule
    if (state.halfMove >= 100) return "draw-50";

    // Insufficient material
    const pieces = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (state.board[r][c]) pieces.push(state.board[r][c]);

    const nonKings = pieces.filter((p) => p.type !== PIECES.KING);
    if (nonKings.length === 0) return "draw-material";   // K vs K
    if (
      nonKings.length === 1 &&
      (nonKings[0].type === PIECES.BISHOP || nonKings[0].type === PIECES.KNIGHT)
    ) return "draw-material";                             // K+B or K+N vs K

    // Legal moves decide checkmate vs stalemate
    const moves = generateLegalMoves(state);
    if (moves.length > 0) return "playing";

    return isInCheck(state.board, state.turn) ? "checkmate" : "stalemate";
  }

  // ──────────────────────────────────────────────
  //  STATE TRANSITION
  // ──────────────────────────────────────────────

  /**
   * Apply a legal move and return the resulting game state (immutable).
   * Throws an Error if the move is not legal.
   *
   * @param {Object} state
   * @param {Object} move  — { from, to, flags? }
   *                         flags.promotion defaults to "Q"
   * @returns {Object} next state
   */
  function executeMove(state, move) {
    const { board, turn, castling, halfMove, fullMove } = state;
    const promo = move.flags?.promotion || move.promotion || PIECES.QUEEN;

    // Find the matching legal move (validates the move)
    const legalList = generateLegalMoves(state);
    const matched = legalList.find(
      (m) =>
        m.from === move.from &&
        m.to   === move.to &&
        (!m.flags.promotion || m.flags.promotion === promo)
    );

    if (!matched) {
      throw new Error(`Illegal move: ${move.from} → ${move.to}`);
    }

    const { row: fr, col: fc } = squareToCoords(matched.from);
    const piece = board[fr][fc];

    const newBoard    = applyMove(board, matched.from, matched.to, matched.flags, promo);
    const newCastling = updateCastling(castling, piece, matched.from, matched.to);

    // En-passant square: only set after a double pawn push
    const newEP = matched.flags.doublePush
      ? coordsToSquare(
          turn === COLORS.WHITE
            ? squareToCoords(matched.from).row - 1
            : squareToCoords(matched.from).row + 1,
          squareToCoords(matched.from).col
        )
      : null;

    const isCapture  = !!matched.flags.capture;
    const isPawnMove = piece.type === PIECES.PAWN;

    return {
      board:     newBoard,
      turn:      opponent(turn),
      castling:  newCastling,
      enPassant: newEP,
      halfMove:  isCapture || isPawnMove ? 0 : halfMove + 1,
      fullMove:  turn === COLORS.BLACK ? fullMove + 1 : fullMove,
    };
  }

  // ──────────────────────────────────────────────
  //  ChessEngine  CLASS
  // ──────────────────────────────────────────────

  /**
   * Main chess engine class.
   *
   * Usage:
   *   const game = new ChessEngine();
   *
   *   game.getLegalMoves()       // all legal moves for current side
   *   game.getMovesFrom("e2")    // destination squares for one piece
   *   game.isLegalMove("e2","e4") // quick legality check
   *
   *   game.move("e2", "e4")      // execute a move
   *   game.undo()                // undo last move
   *   game.reset()               // back to start position
   *
   *   game.turn                  // "white" | "black"
   *   game.board                 // 8x8 array
   *   game.isInCheck()           // boolean
   *   game.status()              // "playing"|"checkmate"|"stalemate"|...
   *
   *   game.toFEN()               // export position
   *   game.loadFEN(fen)          // import position
   */
  class ChessEngine {
    constructor(fen = START_FEN) {
      this._state    = parseFEN(fen);
      this._history  = []; // [{ fen, move }]
      this._moveList = []; // display strings
    }

    // ── Accessors ──────────────────────────────

    /** Current side to move: "white" | "black" */
    get turn() { return this._state.turn; }

    /** The 8×8 board. Do not mutate directly. */
    get board() { return this._state.board; }

    /** Current en-passant target square, or null */
    get enPassant() { return this._state.enPassant; }

    /** Castling rights { K, Q, k, q } */
    get castling() { return this._state.castling; }

    /** Half-move clock (for 50-move rule) */
    get halfMove() { return this._state.halfMove; }

    /** Full-move number */
    get fullMove() { return this._state.fullMove; }

    /** Move history as display strings e.g. ["e2-e4", "e7-e5"] */
    get moveList() { return [...this._moveList]; }

    /** Number of half-moves played */
    get plyCount() { return this._history.length; }

    // ── Move Queries ───────────────────────────

    /**
     * All legal moves for the current side.
     * @returns {{ from, to, flags }[]}
     */
    getLegalMoves() {
      return generateLegalMoves(this._state);
    }

    /**
     * Legal destination squares for the piece on `square`.
     * Useful for highlighting valid move targets in the UI.
     * @param {string} square  e.g. "e2"
     * @returns {string[]}     e.g. ["e3", "e4"]
     */
    getMovesFrom(square) {
      return [
        ...new Set(
          generateLegalMoves(this._state)
            .filter((m) => m.from === square)
            .map((m) => m.to)
        ),
      ];
    }

    /**
     * Is a given move legal?
     * @param {string} from
     * @param {string} to
     * @param {string} [promotion]
     * @returns {boolean}
     */
    isLegalMove(from, to, promotion = PIECES.QUEEN) {
      return generateLegalMoves(this._state).some(
        (m) =>
          m.from === from &&
          m.to   === to &&
          (!m.flags.promotion || m.flags.promotion === promotion)
      );
    }

    /**
     * Get the piece sitting on a square.
     * @param {string} square  e.g. "e1"
     * @returns {{ type: string, color: string } | null}
     */
    getPiece(square) {
      const { row, col } = squareToCoords(square);
      return this._state.board[row][col];
    }

    // ── Move Execution ─────────────────────────

    /**
     * Execute a legal move. Throws if illegal.
     * @param {string} from
     * @param {string} to
     * @param {string} [promotion]  "Q"|"R"|"B"|"N"  (default "Q")
     * @returns {{ move: Object, state: Object }}
     */
    move(from, to, promotion = PIECES.QUEEN) {
      const promo = promotion.toUpperCase();

      // Save snapshot before applying
      this._history.push({ fen: toFEN(this._state), move: { from, to, promo } });

      this._state = executeMove(this._state, { from, to, promotion: promo });

      // Determine if this move was a promotion for the display string
      const wasPromo = this._history.length > 0 &&
        generateLegalMoves(parseFEN(this._history.at(-1).fen))
          .find((m) => m.from === from && m.to === to && m.flags.promotion === promo)
          ?.flags.promotion;

      this._moveList.push(`${from}-${to}${wasPromo ? "=" + promo : ""}`);

      return { move: { from, to, promotion: promo }, state: this._state };
    }

    // ── Game Status ────────────────────────────

    /**
     * Is the current side's king in check?
     * @returns {boolean}
     */
    isInCheck() {
      return isInCheck(this._state.board, this._state.turn);
    }

    /**
     * Current game result.
     * @returns {"playing"|"checkmate"|"stalemate"|"draw-50"|"draw-material"}
     */
    status() {
      return getGameStatus(this._state);
    }

    // ── History / Undo ─────────────────────────

    /**
     * Undo the last half-move.
     * @returns {boolean} false if no moves to undo
     */
    undo() {
      if (!this._history.length) return false;
      const snap = this._history.pop();
      this._state = parseFEN(snap.fen);
      this._moveList.pop();
      return true;
    }

    // ── FEN ────────────────────────────────────

    /** Export position as FEN string. */
    toFEN() { return toFEN(this._state); }

    /**
     * Load a FEN string. Clears move history.
     * @param {string} fen
     */
    loadFEN(fen) {
      this._state    = parseFEN(fen);
      this._history  = [];
      this._moveList = [];
    }

    /** Reset to the standard starting position. */
    reset() { this.loadFEN(START_FEN); }

    // ── Internal (used by chess-ai.js) ─────────

    /** Return the raw state object. Used by chess-ai.js. */
    getState() { return this._state; }
  }

  // ──────────────────────────────────────────────
  //  EXPOSE INTERNALS  (for chess-ai.js)
  // ──────────────────────────────────────────────

  const ChessEngineInternals = {
    parseFEN,
    toFEN,
    generateLegalMoves,
    executeMove,
    isInCheck,
    isSquareAttacked,
    getGameStatus,
    applyMove,
    cloneBoard,
    opponent,
    squareToCoords,
    coordsToSquare,
    PIECES,
    COLORS,
    START_FEN,
  };

  // ──────────────────────────────────────────────
  //  GLOBAL EXPORT
  // ──────────────────────────────────────────────

  if (typeof window !== "undefined") {
    window.ChessEngine          = ChessEngine;
    window.ChessEngineInternals = ChessEngineInternals;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ChessEngine, ChessEngineInternals };
  }

})(typeof window !== "undefined" ? window : global);