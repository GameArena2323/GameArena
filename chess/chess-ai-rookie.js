/**
 * ============================================================
 *  CHESS AI — ROOKIE
 *  chess-ai-rookie.js
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *
 *  Behaviour:
 *    - 70% chance to play a completely random legal move
 *    - 30% chance to pick a random capture (if any exist)
 *    - No look-ahead whatsoever
 *    - Does not avoid hanging pieces
 *    - Does not see threats coming
 *    - Perfect for absolute beginners learning the rules
 *
 *  Exposed global:
 *    window.ChessAI_Rookie.getMove(state) → move object
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  DEPENDENCY CHECK
  // ──────────────────────────────────────────────

  if (typeof ChessEngineInternals === "undefined") {
    throw new Error("chess-ai-rookie.js requires chess-engine.js to be loaded first.");
  }

  const { generateLegalMoves } = ChessEngineInternals;

  // ──────────────────────────────────────────────
  //  HELPERS
  // ──────────────────────────────────────────────

  /** Pick a random element from an array */
  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ──────────────────────────────────────────────
  //  ROOKIE LOGIC
  // ──────────────────────────────────────────────

  /**
   * Choose a move for the Rookie CPU.
   *
   * Strategy:
   *   - 70% → pick any random legal move
   *   - 30% → if captures exist, pick a random one; else random move
   *
   * This makes the rookie feel erratic and unpredictable —
   * it will blunder pieces constantly and miss obvious threats.
   *
   * @param {Object} state  — raw game state from ChessEngineInternals
   * @returns {{ from, to, flags } | null}  null if no moves available
   */
  function getMove(state) {
    const moves = generateLegalMoves(state);
    if (!moves.length) return null;

    // 70% of the time: pure random
    if (Math.random() < 0.70) {
      return randomChoice(moves);
    }

    // 30% of the time: prefer a random capture
    const captures = moves.filter((m) => m.flags.capture);
    if (captures.length) {
      return randomChoice(captures);
    }

    // Fallback: random move
    return randomChoice(moves);
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  const ChessAI_Rookie = { getMove, name: "Rookie" };

  if (typeof window !== "undefined") window.ChessAI_Rookie = ChessAI_Rookie;
  if (typeof module !== "undefined" && module.exports) module.exports = ChessAI_Rookie;

})(typeof window !== "undefined" ? window : global);
