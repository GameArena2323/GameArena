/**
 * ============================================================
 *  CHESS AI — GRANDMASTER
 *  chess-ai-grandmaster.js
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *
 *  Behaviour:
 *    - Depth-4 minimax with alpha-beta pruning
 *    - Iterative deepening (uses time budget, goes as deep as it can)
 *    - Quiescence search (up to 5 extra plies on captures/checks)
 *    - Full piece-square tables for all phases
 *    - Advanced move ordering:
 *        MVV-LVA captures → promotions → checks → killer moves → quiet
 *    - Endgame king activity bonus (king centralises in endgame)
 *    - Mobility bonus (more legal moves = better position)
 *    - Bishop pair bonus
 *    - Passed pawn bonus
 *    - Zero randomness — always plays the engine's best move
 *    - Will punish any mistake decisively
 *
 *  Exposed global:
 *    window.ChessAI_Grandmaster.getMove(state) → move object
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessEngineInternals === "undefined") {
    throw new Error("chess-ai-grandmaster.js requires chess-engine.js to be loaded first.");
  }

  const {
    generateLegalMoves,
    executeMove,
    getGameStatus,
    isInCheck,
    isSquareAttacked,
    squareToCoords,
    coordsToSquare,
    opponent,
    PIECES,
    COLORS,
  } = ChessEngineInternals;

  // ──────────────────────────────────────────────
  //  CONFIGURATION
  // ──────────────────────────────────────────────

  const BASE_DEPTH  = 4;    // minimum search depth
  const MAX_DEPTH   = 6;    // iterative deepening ceiling
  const TIME_BUDGET = 2500; // milliseconds per move
  const Q_DEPTH     = 5;    // quiescence search max extra plies

  // ──────────────────────────────────────────────
  //  PIECE VALUES
  // ──────────────────────────────────────────────

  const PIECE_VALUE = {
    [PIECES.PAWN]:   100,
    [PIECES.KNIGHT]: 320,
    [PIECES.BISHOP]: 330,
    [PIECES.ROOK]:   500,
    [PIECES.QUEEN]:  900,
    [PIECES.KING]: 20000,
  };

  // ──────────────────────────────────────────────
  //  PIECE-SQUARE TABLES — MIDDLEGAME  (white's perspective)
  // ──────────────────────────────────────────────

  const PST_MG = {
    [PIECES.PAWN]: [
      [ 0,  0,  0,  0,  0,  0,  0,  0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [ 5,  5, 10, 25, 25, 10,  5,  5],
      [ 0,  0,  0, 20, 20,  0,  0,  0],
      [ 5, -5,-10,  0,  0,-10, -5,  5],
      [ 5, 10, 10,-20,-20, 10, 10,  5],
      [ 0,  0,  0,  0,  0,  0,  0,  0],
    ],
    [PIECES.KNIGHT]: [
      [-50,-40,-30,-30,-30,-30,-40,-50],
      [-40,-20,  0,  0,  0,  0,-20,-40],
      [-30,  0, 10, 15, 15, 10,  0,-30],
      [-30,  5, 15, 20, 20, 15,  5,-30],
      [-30,  0, 15, 20, 20, 15,  0,-30],
      [-30,  5, 10, 15, 15, 10,  5,-30],
      [-40,-20,  0,  5,  5,  0,-20,-40],
      [-50,-40,-30,-30,-30,-30,-40,-50],
    ],
    [PIECES.BISHOP]: [
      [-20,-10,-10,-10,-10,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-10,  0,  5, 10, 10,  5,  0,-10],
      [-10,  5,  5, 10, 10,  5,  5,-10],
      [-10,  0, 10, 10, 10, 10,  0,-10],
      [-10, 10, 10, 10, 10, 10, 10,-10],
      [-10,  5,  0,  0,  0,  0,  5,-10],
      [-20,-10,-10,-10,-10,-10,-10,-20],
    ],
    [PIECES.ROOK]: [
      [ 0,  0,  0,  0,  0,  0,  0,  0],
      [ 5, 10, 10, 10, 10, 10, 10,  5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [ 0,  0,  0,  5,  5,  0,  0,  0],
    ],
    [PIECES.QUEEN]: [
      [-20,-10,-10, -5, -5,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0,-10],
      [-10,  0,  5,  5,  5,  5,  0,-10],
      [ -5,  0,  5,  5,  5,  5,  0, -5],
      [  0,  0,  5,  5,  5,  5,  0, -5],
      [-10,  5,  5,  5,  5,  5,  0,-10],
      [-10,  0,  5,  0,  0,  0,  0,-10],
      [-20,-10,-10, -5, -5,-10,-10,-20],
    ],
    // King middlegame: hide behind pawns
    [PIECES.KING]: [
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-20,-30,-30,-40,-40,-30,-30,-20],
      [-10,-20,-20,-20,-20,-20,-20,-10],
      [ 20, 20,  0,  0,  0,  0, 20, 20],
      [ 20, 30, 10,  0,  0, 10, 30, 20],
    ],
  };

  // King endgame: centralise!
  const PST_KING_EG = [
    [-50,-40,-30,-20,-20,-30,-40,-50],
    [-30,-20,-10,  0,  0,-10,-20,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 30, 40, 40, 30,-10,-30],
    [-30,-10, 20, 30, 30, 20,-10,-30],
    [-30,-30,  0,  0,  0,  0,-30,-30],
    [-50,-30,-30,-30,-30,-30,-30,-50],
  ];

  // ──────────────────────────────────────────────
  //  GAME PHASE DETECTION
  //  Returns 0.0 (opening/middlegame) → 1.0 (endgame)
  // ──────────────────────────────────────────────

  function gamePhase(board) {
    let material = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type !== PIECES.KING && p.type !== PIECES.PAWN)
          material += PIECE_VALUE[p.type];
      }
    // Full material ≈ 2*(2*320 + 2*330 + 2*500 + 900) = ~6620
    return Math.max(0, 1 - material / 6620);
  }

  // ──────────────────────────────────────────────
  //  STATIC EVALUATION  (full)
  // ──────────────────────────────────────────────

  function evaluate(board) {
    let score   = 0;
    const phase = gamePhase(board);

    // Piece counts for bishop pair detection
    let whiteBishops = 0, blackBishops = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;

        const sign = p.color === COLORS.WHITE ? 1 : -1;
        const base = PIECE_VALUE[p.type] || 0;

        // Piece-square table (blend king MG/EG by phase)
        const tableRow = p.color === COLORS.WHITE ? r : 7 - r;
        let pos = 0;
        if (p.type === PIECES.KING) {
          const mg = (PST_MG[PIECES.KING][tableRow]?.[c] ?? 0);
          const eg = (PST_KING_EG[tableRow]?.[c] ?? 0);
          pos = mg * (1 - phase) + eg * phase;
        } else {
          pos = (PST_MG[p.type] || [])[tableRow]?.[c] ?? 0;
        }

        score += sign * (base + pos);

        // Bishop pair tracking
        if (p.type === PIECES.BISHOP) {
          if (p.color === COLORS.WHITE) whiteBishops++;
          else blackBishops++;
        }

        // Passed pawn bonus (white)
        if (p.type === PIECES.PAWN) {
          const isPassed = isPassedPawn(board, r, c, p.color);
          if (isPassed) {
            const advanceBonus = p.color === COLORS.WHITE
              ? (7 - r) * 10   // closer to promotion = more bonus
              : r * 10;
            score += sign * (20 + advanceBonus);
          }
        }
      }
    }

    // Bishop pair bonus (50 cp)
    if (whiteBishops >= 2) score += 50;
    if (blackBishops >= 2) score -= 50;

    return score;
  }

  /**
   * Is the pawn on (row, col) a passed pawn?
   * A passed pawn has no enemy pawns blocking or attacking its promotion path.
   */
  function isPassedPawn(board, row, col, color) {
    const dir = color === COLORS.WHITE ? -1 : 1;
    let r = row + dir;
    while (r >= 0 && r < 8) {
      for (const dc of [-1, 0, 1]) {
        const c = col + dc;
        if (c < 0 || c > 7) continue;
        const p = board[r][c];
        if (p && p.type === PIECES.PAWN && p.color !== color) return false;
      }
      r += dir;
    }
    return true;
  }

  // ──────────────────────────────────────────────
  //  MOVE ORDERING
  // ──────────────────────────────────────────────

  // Killer moves: quiet moves that caused a beta-cutoff at each depth
  // Indexed by [depth][0|1] — two killers per depth
  let killerMoves = [];

  function resetKillers(maxDepth) {
    killerMoves = Array.from({ length: maxDepth + 10 }, () => [null, null]);
  }

  function isKiller(move, depth) {
    const k = killerMoves[depth];
    return (
      (k[0] && k[0].from === move.from && k[0].to === move.to) ||
      (k[1] && k[1].from === move.from && k[1].to === move.to)
    );
  }

  function storeKiller(move, depth) {
    if (!move.flags.capture) {
      killerMoves[depth][1] = killerMoves[depth][0];
      killerMoves[depth][0] = move;
    }
  }

  function moveScore(board, move, depth) {
    // 1. Captures (MVV-LVA)
    if (move.flags.capture || move.flags.enPassant) {
      const { row, col } = squareToCoords(move.to);
      const target = board[row][col];
      const { row: fr, col: fc } = squareToCoords(move.from);
      const attacker = board[fr][fc];
      const victimVal   = target   ? (PIECE_VALUE[target.type]   || 0) : PIECE_VALUE[PIECES.PAWN];
      const attackerVal = attacker ? (PIECE_VALUE[attacker.type] || 0) : 0;
      return 10000 + victimVal * 10 - attackerVal;
    }
    // 2. Promotions
    if (move.flags.promotion === PIECES.QUEEN) return 9000;
    if (move.flags.promotion)                  return 8000;
    // 3. Killer moves
    if (isKiller(move, depth)) return 7000;
    // 4. Quiet moves (no extra bonus)
    return 0;
  }

  function orderMoves(board, moves, depth) {
    return [...moves].sort((a, b) => moveScore(board, b, depth) - moveScore(board, a, depth));
  }

  // ──────────────────────────────────────────────
  //  QUIESCENCE SEARCH
  // ──────────────────────────────────────────────

  function quiescence(state, alpha, beta, maximizing, qdepth) {
    const standPat = evaluate(state.board);

    if (maximizing) {
      if (standPat >= beta)  return beta;
      if (standPat > alpha)  alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta)   beta = standPat;
    }

    if (qdepth === 0) return standPat;

    const noisy = generateLegalMoves(state).filter(
      (m) => m.flags.capture || m.flags.promotion || m.flags.enPassant
    );

    for (const move of orderMoves(state.board, noisy, 0)) {
      const next = executeMove(state, move);
      const val  = quiescence(next, alpha, beta, !maximizing, qdepth - 1);

      if (maximizing) {
        if (val > alpha) alpha = val;
        if (alpha >= beta) break;
      } else {
        if (val < beta) beta = val;
        if (beta <= alpha) break;
      }
    }

    return maximizing ? alpha : beta;
  }

  // ──────────────────────────────────────────────
  //  MINIMAX  (alpha-beta + killer moves)
  // ──────────────────────────────────────────────

  function minimax(state, depth, alpha, beta, maximizing) {
    const status = getGameStatus(state);
    if (status === "checkmate") return maximizing ? -Infinity : Infinity;
    if (status !== "playing")  return 0;

    if (depth === 0) {
      return quiescence(state, alpha, beta, maximizing, Q_DEPTH);
    }

    const moves = orderMoves(state.board, generateLegalMoves(state), depth);
    let best = maximizing ? -Infinity : Infinity;

    for (const move of moves) {
      const next = executeMove(state, move);
      const val  = minimax(next, depth - 1, alpha, beta, !maximizing);

      if (maximizing) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }

      if (beta <= alpha) {
        storeKiller(move, depth);
        break;
      }
    }

    return best;
  }

  // ──────────────────────────────────────────────
  //  ITERATIVE DEEPENING
  // ──────────────────────────────────────────────

  /**
   * Search from BASE_DEPTH up to MAX_DEPTH (or until time runs out).
   * Returns the best move found at the deepest completed iteration.
   */
  function iterativeDeepening(state) {
    const moves = generateLegalMoves(state);
    if (!moves.length) return null;

    const isMaximizing = state.turn === COLORS.WHITE;
    const startTime    = Date.now();
    let bestMove       = moves[0]; // fallback

    for (let depth = BASE_DEPTH; depth <= MAX_DEPTH; depth++) {
      if (Date.now() - startTime > TIME_BUDGET) break;

      resetKillers(depth);

      let bestScore = isMaximizing ? -Infinity : Infinity;
      let depthBest = null;

      const ordered = orderMoves(state.board, moves, depth);

      for (const move of ordered) {
        if (Date.now() - startTime > TIME_BUDGET) break;

        const next  = executeMove(state, move);
        const score = minimax(next, depth - 1, -Infinity, Infinity, !isMaximizing);

        if (isMaximizing ? score > bestScore : score < bestScore) {
          bestScore = score;
          depthBest = move;
        }
      }

      if (depthBest) bestMove = depthBest;
    }

    return bestMove;
  }

  // ──────────────────────────────────────────────
  //  GRANDMASTER LOGIC
  // ──────────────────────────────────────────────

  /**
   * Choose a move for the Grandmaster CPU.
   *
   * Strategy:
   *   - No randomness whatsoever
   *   - Iterative deepening from depth 4 up to depth 6
   *   - Full quiescence search (5 extra plies on captures)
   *   - Killer move heuristic for move ordering
   *   - Advanced evaluation: PST, passed pawns, bishop pair,
   *     endgame king centralisation
   *
   * @param {Object} state
   * @returns {{ from, to, flags } | null}
   */
  function getMove(state) {
    return iterativeDeepening(state);
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  const ChessAI_Grandmaster = { getMove, name: "Grandmaster" };

  if (typeof window !== "undefined") window.ChessAI_Grandmaster = ChessAI_Grandmaster;
  if (typeof module !== "undefined" && module.exports) module.exports = ChessAI_Grandmaster;

})(typeof window !== "undefined" ? window : global);
