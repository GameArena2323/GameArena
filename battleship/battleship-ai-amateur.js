/**
 * ============================================================
 *  BATTLESHIP AI — AMATEUR
 *  battleship-ai-amateur.js
 *
 *  Depends on: battleship-engine.js
 *
 *  Behaviour:
 *    - Hunt mode: shoots random cells on a parity-2 checkerboard
 *      (skips every other cell — avoids wasting shots on size-2+ ships)
 *    - Target mode: once a hit is found, locks onto a direction
 *      and follows the ship along that axis
 *    - Backtracks when direction runs out
 *    - 10% random blunder chance
 *    - Average game length: ~45 shots
 *
 *  Exposed global:
 *    window.BattleshipAI_Amateur.getShot(shotGrid) → { r, c }
 * ============================================================
 */

(function (root) {
  "use strict";

  if (typeof BattleshipEngineInternals === "undefined") {
    throw new Error("battleship-ai-amateur.js requires battleship-engine.js to be loaded first.");
  }

  const { getUnshot, getActiveHits, CELL, GRID_SIZE } = BattleshipEngineInternals;

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function inBounds(r, c) {
    return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  }

  /**
   * Checkerboard parity hunt — only shoot cells where (r+c) % 2 === 0.
   * This guarantees we'll always intersect any ship of size ≥ 2.
   */
  function getParityCell(shotGrid) {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if ((r + c) % 2 === 0 && shotGrid[r][c] === CELL.EMPTY) {
          cells.push({ r, c });
        }
      }
    }
    return cells.length ? randomChoice(cells) : randomChoice(getUnshot(shotGrid));
  }

  /**
   * Given a set of collinear hits, find the next logical shot in that direction.
   */
  function getDirectionalShot(hits, shotGrid) {
    if (hits.length === 0) return null;

    // Sort hits
    const sorted = [...hits].sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);
    const first  = sorted[0];
    const last   = sorted[sorted.length - 1];

    const isHorizontal = first.r === last.r;

    const directions = isHorizontal
      ? [[0, -1], [0, 1]]   // left, right
      : [[-1, 0], [1, 0]];  // up, down

    // Try extending beyond the ends
    for (const [dr, dc] of directions) {
      const nr = (dr < 0 || dc < 0) ? first.r + dr : last.r + dr;
      const nc = (dr < 0 || dc < 0) ? first.c + dc : last.c + dc;
      if (inBounds(nr, nc) && shotGrid[nr][nc] === CELL.EMPTY) {
        return { r: nr, c: nc };
      }
    }

    return null;
  }

  function getShot(shotGrid) {
    // 10% blunder
    if (Math.random() < 0.10) {
      const unshot = getUnshot(shotGrid);
      return randomChoice(unshot);
    }

    const hits = getActiveHits(shotGrid);

    if (hits.length === 0) {
      return getParityCell(shotGrid);
    }

    if (hits.length === 1) {
      // Try all 4 adjacent cells
      const { r, c } = hits[0];
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      const options = dirs
        .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
        .filter(pos => inBounds(pos.r, pos.c) && shotGrid[pos.r][pos.c] === CELL.EMPTY);
      return options.length ? randomChoice(options) : getParityCell(shotGrid);
    }

    // Multiple hits — determine axis and extend
    const directional = getDirectionalShot(hits, shotGrid);
    if (directional) return directional;

    // Fallback: adjacent to any hit
    for (const { r, c } of hits) {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      const options = dirs
        .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
        .filter(pos => inBounds(pos.r, pos.c) && shotGrid[pos.r][pos.c] === CELL.EMPTY);
      if (options.length) return randomChoice(options);
    }

    return getParityCell(shotGrid);
  }

  const BattleshipAI_Amateur = { getShot, name: "Amateur", difficulty: "amateur" };

  if (typeof window !== "undefined") window.BattleshipAI_Amateur = BattleshipAI_Amateur;
  if (typeof module !== "undefined" && module.exports) module.exports = BattleshipAI_Amateur;

})(typeof window !== "undefined" ? window : global);
