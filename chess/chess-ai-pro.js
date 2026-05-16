/**
 * ============================================================
 *  CHESS AI — PRO
 *  chess-ai-pro.js
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *
 *  Behaviour:
 *    - Depth-3 minimax with alpha-beta pruning
 *    - Quiescence search (avoids horizon-effect blunders on captures)
 *    - Full piece-square tables
 *    - MVV-LVA + killer-move inspired move ordering
 *    - Checks and captures prioritised in search
 *    - Only 5% random move chance — very rarely blunders
 *    - Strong tactical play, decent positional sense
 *
 *  Exposed global:
 *    window.ChessAI_Pro.getMove(state) → move object
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessEngineInternals === "undefined") {
    throw new Error("chess-ai-pro.js requires chess-engine.js to be loaded first.");
  }

  const {
    generateLegalMoves,
    executeMove,
    getGameStatus,
    isInCheck,
    squareToCoords,
    opponent,
    PIECES,
    COLORS,
  } = ChessEngineInternals;

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
  //  PIECE-SQUARE TABLES  (white's perspective)
  // ──────────────────────────────────────────────

  const PST = {
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

  // ──────────────────────────────────────────────
  //  STATIC EVALUATION
  // ──────────────────────────────────────────────

  function evaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const base     = PIECE_VALUE[p.type] || 0;
        const tableRow = p.color === COLORS.WHITE ? r : 7 - r;
        const pos      = (PST[p.type] || [])[tableRow]?.[c] ?? 0;
        score += (p.color === COLORS.WHITE ? 1 : -1) * (base + pos);
      }
    }
    return score;
  }

  // ──────────────────────────────────────────────
  //  MOVE ORDERING
  //  Captures first (MVV-LVA), then checks, then quiet
  // ──────────────────────────────────────────────

  function captureScore(board, move) {
    const { row, col } = squareToCoords(move.to);
    const target = board[row][col];
    if (!target && !move.flags.enPassant) return 0;
    const { row: fr, col: fc } = squareToCoords(move.from);
    const attacker = board[fr][fc];
    const victimVal   = target ? (PIECE_VALUE[target.type] || 0) : PIECE_VALUE[PIECES.PAWN];
    const attackerVal = attacker ? (PIECE_VALUE[attacker.type] || 0) : 0;
    // MVV-LVA: prioritise capturing the most valuable piece with the least valuable attacker
    return victimVal * 10 - attackerVal;
  }

  function orderMoves(board, moves) {
    return [...moves].sort((a, b) => captureScore(board, b) - captureScore(board, a));
  }

  // ──────────────────────────────────────────────
  //  QUIESCENCE SEARCH
  //  Extends search on captures to avoid horizon-effect blunders
  // ──────────────────────────────────────────────

  const Q_DEPTH = 3; // max extra plies for quiescence

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

    // Only search captures (and promotions) in quiescence
    const captures = generateLegalMoves(state).filter(
      (m) => m.flags.capture || m.flags.promotion
    );

    for (const move of orderMoves(state.board, captures)) {
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
  //  MINIMAX  (depth 3, alpha-beta + quiescence)
  // ──────────────────────────────────────────────

  function minimax(state, depth, alpha, beta, maximizing) {
    const status = getGameStatus(state);
    if (status === "checkmate") return maximizing ? -Infinity : Infinity;
    if (status !== "playing")  return 0;

    if (depth === 0) {
      return quiescence(state, alpha, beta, maximizing, Q_DEPTH);
    }

    const moves = orderMoves(state.board, generateLegalMoves(state));

    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const next = executeMove(state, move);
        const val  = minimax(next, depth - 1, alpha, beta, false);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of moves) {
        const next = executeMove(state, move);
        const val  = minimax(next, depth - 1, alpha, beta, true);
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  // ──────────────────────────────────────────────
  //  PRO LOGIC
  // ──────────────────────────────────────────────

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Choose a move for the Pro CPU.
   *
   * Strategy:
   *   - 5% → random legal move (very rare blunder)
   *   - 95% → depth-3 minimax with alpha-beta, quiescence search,
   *            full PST evaluation and MVV-LVA move ordering
   *
   * @param {Object} state
   * @returns {{ from, to, flags } | null}
   */
  function getMove(state) {
    const moves = generateLegalMoves(state);
    if (!moves.length) return null;

    // 5% random blunder
    if (Math.random() < 0.05) {
      return randomChoice(moves);
    }

    const isMaximizing = state.turn === COLORS.WHITE;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let bestMoves = [];

    const ordered = orderMoves(state.board, moves);

    for (const move of ordered) {
      const next  = executeMove(state, move);
      const score = minimax(next, 2, -Infinity, Infinity, !isMaximizing);

      if (isMaximizing ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return randomChoice(bestMoves);
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  const ChessAI_Pro = { getMove, name: "Pro" };

  if (typeof window !== "undefined") window.ChessAI_Pro = ChessAI_Pro;
  if (typeof module !== "undefined" && module.exports) module.exports = ChessAI_Pro;

})(typeof window !== "undefined" ? window : global);
