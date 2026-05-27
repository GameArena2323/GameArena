/**
 * ============================================================
 *  BATTLESHIP AI — BEGINNER
 *  battleship-ai-beginner.js
 *
 *  Depends on: battleship-engine.js
 *
 *  Behaviour:
 *    - Random shots when no active hits
 *    - When a hit is found, shoots the 4 adjacent cells next
 *    - No directional memory — re-shoots nearby cells randomly
 *    - 20% chance of ignoring a hit and shooting randomly anyway
 *    - Average game length: ~65 shots
 *
 *  Exposed global:
 *    window.BattleshipAI_Beginner.getShot(shotGrid) → { r, c }
 * ============================================================
 */

(function (root) {
  "use strict";

  if (typeof BattleshipEngineInternals === "undefined") {
    throw new Error("battleship-ai-beginner.js requires battleship-engine.js to be loaded first.");
  }

  const { getUnshot, getActiveHits, CELL, GRID_SIZE } = BattleshipEngineInternals;

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getAdjacent(r, c, shotGrid) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    return dirs
      .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
      .filter(({ r, c }) =>
        r >= 0 && r < GRID_SIZE &&
        c >= 0 && c < GRID_SIZE &&
        shotGrid[r][c] === CELL.EMPTY
      );
  }

  function getShot(shotGrid) {
    const unshot = getUnshot(shotGrid);
    if (!unshot.length) return null;

    // 20% random even if hits exist
    if (Math.random() < 0.20) return randomChoice(unshot);

    const hits = getActiveHits(shotGrid);
    if (hits.length === 0) return randomChoice(unshot);

    // Pick a random hit cell, try adjacent
    const hit = randomChoice(hits);
    const adjacent = getAdjacent(hit.r, hit.c, shotGrid);

    if (adjacent.length > 0) return randomChoice(adjacent);

    // All adjacent already shot — fall back to random
    return randomChoice(unshot);
  }

  const BattleshipAI_Beginner = { getShot, name: "Beginner", difficulty: "beginner" };

  if (typeof window !== "undefined") window.BattleshipAI_Beginner = BattleshipAI_Beginner;
  if (typeof module !== "undefined" && module.exports) module.exports = BattleshipAI_Beginner;

})(typeof window !== "undefined" ? window : global);
