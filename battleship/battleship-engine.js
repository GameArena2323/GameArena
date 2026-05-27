/**
 * ============================================================
 *  BATTLESHIP ENGINE
 *  battleship-engine.js
 *
 *  Pure game logic — no UI, no AI, no Firebase.
 *
 *  Exposed global:
 *    window.BattleshipEngine
 *    window.BattleshipEngineInternals  (for AI files)
 * ============================================================
 */

(function (root) {
  "use strict";

  // ──────────────────────────────────────────────
  //  CONSTANTS
  // ──────────────────────────────────────────────

  const GRID_SIZE = 10;

  const SHIPS = [
    { id: "carrier",    name: "Carrier",    size: 5 },
    { id: "battleship", name: "Battleship", size: 4 },
    { id: "cruiser",    name: "Cruiser",    size: 3 },
    { id: "submarine",  name: "Submarine",  size: 3 },
    { id: "destroyer",  name: "Destroyer",  size: 2 },
  ];

  const CELL = {
    EMPTY:  "empty",
    SHIP:   "ship",
    HIT:    "hit",
    MISS:   "miss",
    SUNK:   "sunk",
  };

  const ORIENTATION = {
    HORIZONTAL: "horizontal",
    VERTICAL:   "vertical",
  };

  // ──────────────────────────────────────────────
  //  GRID HELPERS
  // ──────────────────────────────────────────────

  function createGrid() {
    return Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(CELL.EMPTY)
    );
  }

  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  /**
   * Create a fresh ship tracking object.
   * placed: [{ id, name, size, row, col, orientation, hits: Set }]
   */
  function createShipTracker() {
    return [];
  }

  // ──────────────────────────────────────────────
  //  PLACEMENT
  // ──────────────────────────────────────────────

  /**
   * Get all cells a ship would occupy given placement params.
   * Returns null if out of bounds.
   */
  function getShipCells(row, col, size, orientation) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const r = orientation === ORIENTATION.VERTICAL   ? row + i : row;
      const c = orientation === ORIENTATION.HORIZONTAL ? col + i : col;
      if (r >= GRID_SIZE || c >= GRID_SIZE) return null;
      cells.push({ r, c });
    }
    return cells;
  }

  /**
   * Check if a placement is valid (in bounds, no overlap).
   */
  function canPlace(grid, row, col, size, orientation) {
    const cells = getShipCells(row, col, size, orientation);
    if (!cells) return false;
    return cells.every(({ r, c }) => grid[r][c] === CELL.EMPTY);
  }

  /**
   * Place a ship on the grid. Returns updated grid & tracker, or null if invalid.
   */
  function placeShip(grid, tracker, ship, row, col, orientation) {
    if (!canPlace(grid, row, col, ship.size, orientation)) return null;

    const cells   = getShipCells(row, col, ship.size, orientation);
    const newGrid = cloneGrid(grid);
    cells.forEach(({ r, c }) => { newGrid[r][c] = CELL.SHIP; });

    const newTracker = [
      ...tracker,
      { ...ship, row, col, orientation, cells, hits: new Set(), sunk: false },
    ];

    return { grid: newGrid, tracker: newTracker };
  }

  /**
   * Randomly place all ships on an empty grid.
   * Returns { grid, tracker }.
   */
  function randomPlacement() {
    let grid    = createGrid();
    let tracker = createShipTracker();

    for (const ship of SHIPS) {
      let placed = false;
      let attempts = 0;

      while (!placed && attempts < 1000) {
        attempts++;
        const orientation = Math.random() < 0.5 ? ORIENTATION.HORIZONTAL : ORIENTATION.VERTICAL;
        const maxRow = orientation === ORIENTATION.VERTICAL   ? GRID_SIZE - ship.size : GRID_SIZE - 1;
        const maxCol = orientation === ORIENTATION.HORIZONTAL ? GRID_SIZE - ship.size : GRID_SIZE - 1;
        const row    = Math.floor(Math.random() * (maxRow + 1));
        const col    = Math.floor(Math.random() * (maxCol + 1));

        const result = placeShip(grid, tracker, ship, row, col, orientation);
        if (result) {
          grid    = result.grid;
          tracker = result.tracker;
          placed  = true;
        }
      }

      if (!placed) {
        // Safety reset and retry the whole thing
        return randomPlacement();
      }
    }

    return { grid, tracker };
  }

  // ──────────────────────────────────────────────
  //  SHOOTING
  // ──────────────────────────────────────────────

  /**
   * Fire a shot at (row, col).
   *
   * @param {Array}  grid     — 10x10 grid with SHIP/EMPTY cells
   * @param {Array}  tracker  — ship tracker array
   * @param {Array}  shotGrid — 10x10 grid of HIT/MISS/SUNK/EMPTY (opponent's view)
   * @param {number} row
   * @param {number} col
   *
   * @returns {Object} {
   *   result:  "hit" | "miss" | "sunk" | "already_shot",
   *   sunkShip: ship object (if sunk) | null,
   *   shotGrid: updated shot grid,
   *   tracker:  updated tracker,
   *   gameOver: boolean,
   * }
   */
  function shoot(grid, tracker, shotGrid, row, col) {
    // Already shot here
    if (shotGrid[row][col] !== CELL.EMPTY) {
      return {
        result: "already_shot",
        sunkShip: null,
        shotGrid,
        tracker,
        gameOver: false,
      };
    }

    const newShotGrid = cloneGrid(shotGrid);
    const newTracker  = tracker.map(s => ({
      ...s,
      hits: new Set(s.hits),
    }));

    const isHit = grid[row][col] === CELL.SHIP;

    if (!isHit) {
      newShotGrid[row][col] = CELL.MISS;
      return {
        result: "miss",
        sunkShip: null,
        shotGrid: newShotGrid,
        tracker: newTracker,
        gameOver: false,
      };
    }

    // Hit — find which ship
    newShotGrid[row][col] = CELL.HIT;

    const shipIdx = newTracker.findIndex(s =>
      s.cells.some(cell => cell.r === row && cell.c === col)
    );

    if (shipIdx === -1) {
      // Shouldn't happen
      return { result: "hit", sunkShip: null, shotGrid: newShotGrid, tracker: newTracker, gameOver: false };
    }

    newTracker[shipIdx].hits.add(`${row},${col}`);

    let result   = "hit";
    let sunkShip = null;

    // Check if sunk
    if (newTracker[shipIdx].hits.size === newTracker[shipIdx].size) {
      newTracker[shipIdx].sunk = true;
      sunkShip = newTracker[shipIdx];
      result   = "sunk";

      // Mark all its cells as SUNK on shot grid
      newTracker[shipIdx].cells.forEach(({ r, c }) => {
        newShotGrid[r][c] = CELL.SUNK;
      });
    }

    const gameOver = newTracker.every(s => s.sunk);

    return {
      result,
      sunkShip,
      shotGrid: newShotGrid,
      tracker:  newTracker,
      gameOver,
    };
  }

  // ──────────────────────────────────────────────
  //  GAME STATE
  // ──────────────────────────────────────────────

  /**
   * Create a full game state for one player's side.
   */
  function createPlayerState(useRandomPlacement = false) {
    const placement = useRandomPlacement ? randomPlacement() : { grid: createGrid(), tracker: createShipTracker() };
    return {
      grid:     placement.grid,     // actual ship positions
      tracker:  placement.tracker,  // ship objects
      shotGrid: createGrid(),       // what opponent sees (hits/misses)
      shotsReceived: 0,
      shotsFired:    0,
      hits:          0,
      misses:        0,
    };
  }

  /**
   * Is placement complete? (all 5 ships placed)
   */
  function isPlacementComplete(tracker) {
    return tracker.length === SHIPS.length;
  }

  /**
   * Get remaining (un-sunk) ship sizes from a tracker.
   * Useful for AI probability calculations.
   */
  function getRemainingShips(tracker) {
    return tracker.filter(s => !s.sunk).map(s => s.size);
  }

  /**
   * Get all cells not yet shot on a shotGrid.
   */
  function getUnshot(shotGrid) {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (shotGrid[r][c] === CELL.EMPTY) cells.push({ r, c });
      }
    }
    return cells;
  }

  /**
   * Get all HIT (not yet SUNK) cells from a shotGrid.
   */
  function getActiveHits(shotGrid) {
    const cells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (shotGrid[r][c] === CELL.HIT) cells.push({ r, c });
      }
    }
    return cells;
  }

  // ──────────────────────────────────────────────
  //  SERIALISATION (for Firebase / pass&play)
  // ──────────────────────────────────────────────

  /**
   * Convert a tracker (which contains Sets) to a plain JSON-safe object.
   */
  function serializeTracker(tracker) {
    return tracker.map(s => ({
      ...s,
      hits: [...s.hits],
    }));
  }

  /**
   * Restore a tracker from serialised form.
   */
  function deserializeTracker(data) {
    return data.map(s => ({
      ...s,
      hits: new Set(s.hits),
    }));
  }

  // ──────────────────────────────────────────────
  //  INTERNALS EXPORT  (for AI files)
  // ──────────────────────────────────────────────

  const BattleshipEngineInternals = {
    GRID_SIZE,
    SHIPS,
    CELL,
    ORIENTATION,
    createGrid,
    cloneGrid,
    createShipTracker,
    getShipCells,
    canPlace,
    placeShip,
    randomPlacement,
    shoot,
    createPlayerState,
    isPlacementComplete,
    getRemainingShips,
    getUnshot,
    getActiveHits,
    serializeTracker,
    deserializeTracker,
  };

  if (typeof window !== "undefined") {
    window.BattleshipEngineInternals = BattleshipEngineInternals;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = BattleshipEngineInternals;
  }

})(typeof window !== "undefined" ? window : global);
