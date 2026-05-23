/**
 * ============================================================
 *  CHESS AI — BEGINNER
 *  chess-ai-beginner.js
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *
 *  Behaviour:
 *    - Depth-1 search (looks one move ahead)
 *    - Always takes the highest-value free piece it can
 *    - Prefers captures over quiet moves
 *    - 40% chance to play a random move instead (feels human-ish)
 *    - No positional awareness
 *    - Will still hang pieces it didn't notice
 *
 *  Exposed global:
 *    window.ChessAI_Beginner.getMove(state) → move object
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessEngineInternals === "undefined") {
    throw new Error("chess-ai-beginner.js requires chess-engine.js to be loaded first.");
  }

  const {
    generateLegalMoves,
    executeMove,
    PIECES,
    COLORS,
  } = ChessEngineInternals;

  // ──────────────────────────────────────────────
  //  PIECE VALUES  (centipawns)
  // ──────────────────────────────────────────────

  const PIECE_VALUE = {
    [PIECES.PAWN]:   100,
    [PIECES.KNIGHT]: 300,
    [PIECES.BISHOP]: 300,
    [PIECES.ROOK]:   500,
    [PIECES.QUEEN]:  900,
    [PIECES.KING]:     0,
  };

  // ──────────────────────────────────────────────
  //  HELPERS
  // ──────────────────────────────────────────────

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Simple one-ply evaluation:
   * Score a move by the value of the piece captured (if any).
   * Higher = better capture.
   */
  function scoreMoveShallow(state, move) {
    const { row: tr, col: tc } = ChessEngineInternals.squareToCoords(move.to);
    const target = state.board[tr][tc];

    let score = 0;

    // Value of captured piece
    if (target) score += PIECE_VALUE[target.type] || 0;

    // En-passant captures a pawn
    if (move.flags.enPassant) score += PIECE_VALUE[PIECES.PAWN];

    // Promote to queen is great
    if (move.flags.promotion === PIECES.QUEEN) score += 800;

    return score;
  }

  // ──────────────────────────────────────────────
  //  BEGINNER LOGIC
  // ──────────────────────────────────────────────

  /**
   * Choose a move for the Beginner CPU.
   *
   * Strategy:
   *   - 40% → random legal move (simulate distraction / mistakes)
   *   - 60% → pick the highest-value capture available;
   *            if no captures exist, pick a random quiet move
   *
   * The beginner will reliably take free pieces but won't plan
   * ahead or avoid leaving its own pieces hanging.
   *
   * @param {Object} state
   * @returns {{ from, to, flags } | null}
   */
  function getMove(state) {
    const moves = generateLegalMoves(state);
    if (!moves.length) return null;

    // 40% random mistake
    if (Math.random() < 0.40) {
      return randomChoice(moves);
    }

    // Score every move by capture value
    const scored = moves.map((m) => ({
      move:  m,
      score: scoreMoveShallow(state, m),
    }));

    // Find max score
    const maxScore = Math.max(...scored.map((s) => s.score));

    if (maxScore > 0) {
      // At least one capture — pick the best one (random tie-break)
      const best = scored.filter((s) => s.score === maxScore);
      return randomChoice(best).move;
    }

    // No captures — random quiet move
    return randomChoice(moves);
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  const ChessAI_Beginner = { getMove, name: "Beginner" };

  if (typeof window !== "undefined") window.ChessAI_Beginner = ChessAI_Beginner;
  if (typeof module !== "undefined" && module.exports) module.exports = ChessAI_Beginner;

})(typeof window !== "undefined" ? window : global);
