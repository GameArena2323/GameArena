/**
 * ============================================================
 *  BATTLESHIP AI — PRO
 *  battleship-ai-pro.js
 *
 *  Depends on: battleship-engine.js
 *
 *  Behaviour:
 *    - Builds a probability density map: for every unsunk ship,
 *      counts how many ways it could legally fit over each cell
 *    - Always shoots the highest-probability cell
 *    - In target mode: boosts probability heavily around active hits
 *    - 5% random blunder
 *    - Average game length: ~35 shots
 *
 *  Exposed global:
 *    window.BattleshipAI_Pro.getShot(shotGrid, remainingShips) → { r, c }
 * ============================================================
 */

(function (root) {
  "use strict";

  if (typeof BattleshipEngineInternals === "undefined") {
    throw new Error("battleship-ai-pro.js requires battleship-engine.js to be loaded first.");
  }

  const { getUnshot, getActiveHits, CELL, GRID_SIZE } = BattleshipEngineInternals;

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Build a probability density grid.
   * For each remaining ship size, try every possible placement.
   * If a placement covers only EMPTY / HIT cells, increment its cells.
   *
   * @param {Array}  shotGrid       — 10x10 grid (HIT/MISS/SUNK/EMPTY)
   * @param {number[]} shipSizes    — sizes of unsunk ships
   * @returns {number[][]} 10x10 probability grid
   */
  function buildProbabilityMap(shotGrid, shipSizes) {
    const prob = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

    for (const size of shipSizes) {
      // Horizontal placements
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c <= GRID_SIZE - size; c++) {
          let valid = true;
          for (let i = 0; i < size; i++) {
            const cell = shotGrid[r][c + i];
            if (cell === CELL.MISS || cell === CELL.SUNK) { valid = false; break; }
          }
          if (valid) {
            for (let i = 0; i < size; i++) prob[r][c + i]++;
          }
        }
      }

      // Vertical placements
      for (let r = 0; r <= GRID_SIZE - size; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          let valid = true;
          for (let i = 0; i < size; i++) {
            const cell = shotGrid[r + i][c];
            if (cell === CELL.MISS || cell === CELL.SUNK) { valid = false; break; }
          }
          if (valid) {
            for (let i = 0; i < size; i++) prob[r + i][c]++;
          }
        }
      }
    }

    return prob;
  }

  function getShot(shotGrid, remainingShips) {
    const unshot = getUnshot(shotGrid);
    if (!unshot.length) return null;

    // 5% blunder
    if (Math.random() < 0.05) return randomChoice(unshot);

    const sizes = remainingShips || [5, 4, 3, 3, 2]; // fallback
    const prob  = buildProbabilityMap(shotGrid, sizes);

    // Zero out already-shot cells
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (shotGrid[r][c] !== CELL.EMPTY) prob[r][c] = 0;
      }
    }

    // Boost active hits' neighbours to drive target mode
    const hits = getActiveHits(shotGrid);
    if (hits.length > 0) {
      const BOOST = 50;
      for (const { r, c } of hits) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
            prob[nr][nc] += BOOST;
          }
        }
      }

      // If 2+ collinear hits, boost along that axis even more
      if (hits.length >= 2) {
        const sorted = [...hits].sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);
        const isHoriz = sorted[0].r === sorted[sorted.length - 1].r;

        for (const { r, c } of hits) {
          const dirs = isHoriz ? [[0,-1],[0,1]] : [[-1,0],[1,0]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
              prob[nr][nc] += BOOST * 2;
            }
          }
        }
      }
    }

    // Find max probability cell
    let best = -1;
    let bestCells = [];

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (prob[r][c] > best) {
          best = prob[r][c];
          bestCells = [{ r, c }];
        } else if (prob[r][c] === best && prob[r][c] > 0) {
          bestCells.push({ r, c });
        }
      }
    }

    return bestCells.length ? randomChoice(bestCells) : randomChoice(unshot);
  }

  const BattleshipAI_Pro = { getShot, name: "Pro", difficulty: "pro" };

  if (typeof window !== "undefined") window.BattleshipAI_Pro = BattleshipAI_Pro;
  if (typeof module !== "undefined" && module.exports) module.exports = BattleshipAI_Pro;

})(typeof window !== "undefined" ? window : global);
