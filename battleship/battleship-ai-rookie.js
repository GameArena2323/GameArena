/**
 * ============================================================
 *  BATTLESHIP AI — ROOKIE
 *  battleship-ai-rookie.js
 *
 *  Depends on: battleship-engine.js
 *
 *  Behaviour:
 *    - Shoots completely at random
 *    - Never follows up on hits
 *    - Will repeat adjacent shots by chance only
 *    - Average game length: ~96 shots to win
 *
 *  Exposed global:
 *    window.BattleshipAI_Rookie.getShot(shotGrid) → { r, c }
 * ============================================================
 */

(function (root) {
  "use strict";

  if (typeof BattleshipEngineInternals === "undefined") {
    throw new Error("battleship-ai-rookie.js requires battleship-engine.js to be loaded first.");
  }

  const { getUnshot } = BattleshipEngineInternals;

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * @param {Array} shotGrid — 10x10 grid of the opponent's board (from AI's perspective)
   * @returns {{ r, c }}
   */
  function getShot(shotGrid) {
    const unshot = getUnshot(shotGrid);
    if (!unshot.length) return null;
    return randomChoice(unshot);
  }

  const BattleshipAI_Rookie = { getShot, name: "Rookie", difficulty: "rookie" };

  if (typeof window !== "undefined") window.BattleshipAI_Rookie = BattleshipAI_Rookie;
  if (typeof module !== "undefined" && module.exports) module.exports = BattleshipAI_Rookie;

})(typeof window !== "undefined" ? window : global);
