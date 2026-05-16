/**
 * ============================================================
 *  CHESS AI — AMATEUR
 *  chess-ai-amateur.js
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *
 *  Behaviour:
 *    - Depth-2 minimax with alpha-beta pruning
 *    - Basic piece-square tables (prefers centre control)
 *    - MVV-LVA move ordering (checks captures first)
 *    - 15% chance of a random move (occasional blunder)
 *    - Will avoid obvious one-move blunders most of the time
 *    - Still weak in complex positions
 *
 *  Exposed global:
 *    window.ChessAI_Amateur.getMove(state) → move object
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessEngineInternals === "undefined") {
    throw new Error("chess-ai-amateur.js requires chess-engine.js to be loaded first.");
  }

  const {
    generateLegalMoves,
    executeMove,
    getGameStatus,
    isInCheck,
    opponent,
    squareToCoords,
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
  //  Row 0 = rank 8, row 7 = rank 1
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

  /**
   * Evaluate the board from white's perspective.
   * Positive = good for white, negative = good for black.
   */
  function evaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const base  = PIECE_VALUE[p.type] || 0;
        const tableRow = p.color === COLORS.WHITE ? r : 7 - r;
        const pos   = (PST[p.type] || [])[tableRow]?.[c] ?? 0;
        const sign  = p.color === COLORS.WHITE ? 1 : -1;
        score += sign * (base + pos);
      }
    }
    return score;
  }

  // ──────────────────────────────────────────────
  //  MOVE ORDERING  (MVV-LVA: big victim, small attacker first)
  // ──────────────────────────────────────────────

  function orderMoves(board, moves) {
    return [...moves].sort((a, b) => {
      const captureValue = (m) => {
        const { row, col } = squareToCoords(m.to);
        const target = board[row][col];
        return target ? PIECE_VALUE[target.type] || 0 : 0;
      };
      return captureValue(b) - captureValue(a);
    });
  }

  // ──────────────────────────────────────────────
  //  MINIMAX  (depth 2, alpha-beta)
  // ──────────────────────────────────────────────

  function minimax(state, depth, alpha, beta, maximizing) {
    const status = getGameStatus(state);
    if (status === "checkmate") return maximizing ? -Infinity : Infinity;
    if (status !== "playing")  return 0;
    if (depth === 0)           return evaluate(state.board);

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
  //  AMATEUR LOGIC
  // ──────────────────────────────────────────────

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Choose a move for the Amateur CPU.
   *
   * Strategy:
   *   - 15% → random legal move (occasional blunder)
   *   - 85% → depth-2 minimax with alpha-beta and basic PST evaluation
   *
   * @param {Object} state
   * @returns {{ from, to, flags } | null}
   */
  function getMove(state) {
    const moves = generateLegalMoves(state);
    if (!moves.length) return null;

    // 15% random blunder
    if (Math.random() < 0.15) {
      return randomChoice(moves);
    }

    const isMaximizing = state.turn === COLORS.WHITE;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let bestMoves = [];

    const ordered = orderMoves(state.board, moves);

    for (const move of ordered) {
      const next  = executeMove(state, move);
      const score = minimax(next, 1, -Infinity, Infinity, !isMaximizing);

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

  const ChessAI_Amateur = { getMove, name: "Amateur" };

  if (typeof window !== "undefined") window.ChessAI_Amateur = ChessAI_Amateur;
  if (typeof module !== "undefined" && module.exports) module.exports = ChessAI_Amateur;

})(typeof window !== "undefined" ? window : global);
