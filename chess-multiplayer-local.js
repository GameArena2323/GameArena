/**
 * ============================================================
 *  LOCAL MULTIPLAYER
 *  chess-multiplayer-local.js
 *
 *  Handles all local (same-device) multiplayer modes:
 *    - Pass & Play   (one board, hand device between players)
 *    - Split Screen  (two boards, mirrored)
 *    - Dual Keyboard (Player 1: WASD+Space, Player 2: Arrows+Enter)
 *
 *  Also handles:
 *    - Chess clock (Bullet / Blitz / Rapid / Classical / Unlimited)
 *    - Turn management
 *    - Resign & Draw by agreement
 *    - Game result callbacks
 *
 *  Depends on: chess-pieces.js, chess-engine.js
 *  No Firebase needed — fully offline.
 *
 *  Exposed globals:
 *    window.LocalGame        — the class
 *    window.LOCAL_MODES      — mode constants
 *    window.TIME_CONTROLS    — time control options
 * ============================================================
 */

(function (root) {
  "use strict";

  if (typeof ChessEngine === "undefined") {
    throw new Error("chess-multiplayer-local.js requires chess-engine.js to be loaded first.");
  }

  // ──────────────────────────────────────────────
  //  TIME CONTROLS
  // ──────────────────────────────────────────────

  const TIME_CONTROLS = {
    unlimited:  { label: "Unlimited",   seconds: null },
    bullet1:    { label: "Bullet 1m",   seconds: 60   },
    blitz3:     { label: "Blitz 3m",    seconds: 180  },
    blitz5:     { label: "Blitz 5m",    seconds: 300  },
    rapid10:    { label: "Rapid 10m",   seconds: 600  },
    rapid15:    { label: "Rapid 15m",   seconds: 900  },
    classical:  { label: "Classical",   seconds: 1800 },
  };

  // ──────────────────────────────────────────────
  //  MODES
  // ──────────────────────────────────────────────

  const MODES = {
    PASS_AND_PLAY:  "pass_and_play",
    SPLIT_SCREEN:   "split_screen",
    DUAL_KEYBOARD:  "dual_keyboard",
  };

  // ──────────────────────────────────────────────
  //  LocalGame CLASS
  // ──────────────────────────────────────────────

  /**
   * Local multiplayer game manager.
   *
   * Usage:
   *   const game = new LocalGame({
   *     mode:          LOCAL_MODES.PASS_AND_PLAY,
   *     timeControl:   "blitz5",
   *     player1Name:   "Alice",
   *     player2Name:   "Bob",
   *     onStateChange: (snap) => renderBoard(snap),
   *     onGameEnd:     (result) => showResult(result),
   *     onClockTick:   (clocks) => updateClockDisplay(clocks),
   *     onTurnChange:  (info) => showHandDevicePrompt(info),
   *   });
   *
   *   game.start();
   *   game.move("e2", "e4");
   *   game.resign();
   *   game.offerDraw("white");
   *   game.acceptDraw();
   *   game.undo();
   *   game.stop();
   */
  class LocalGame {
    constructor(options = {}) {
      this.mode        = options.mode        || MODES.PASS_AND_PLAY;
      this.timeControl = TIME_CONTROLS[options.timeControl] || TIME_CONTROLS.unlimited;
      this.p1Name      = options.player1Name || "Player 1";  // white
      this.p2Name      = options.player2Name || "Player 2";  // black

      // Callbacks
      this._onStateChange = options.onStateChange || (() => {});
      this._onGameEnd     = options.onGameEnd     || (() => {});
      this._onClockTick   = options.onClockTick   || (() => {});
      this._onTurnChange  = options.onTurnChange  || (() => {});

      // Engine
      this.engine = new ChessEngine();

      // Clock
      this._clock = {
        white:    null,
        black:    null,
        interval: null,
        running:  false,
      };

      // State flags
      this.gameOver       = false;
      this.result         = null;   // "white" | "black" | "draw"
      this.reason         = null;
      this.drawOffer      = null;   // color that offered draw, or null
      this.showHandDevice = false;  // pass & play overlay

      // Dual keyboard
      this._keyHandler = this._onKeyDown.bind(this);
    }

    // ──────────────────────────────────────────────
    //  LIFECYCLE
    // ──────────────────────────────────────────────

    start() {
      this.engine.reset();
      this.gameOver       = false;
      this.result         = null;
      this.reason         = null;
      this.drawOffer      = null;
      this.showHandDevice = false;

      // Init clock
      this._clock.white   = this.timeControl.seconds;
      this._clock.black   = this.timeControl.seconds;
      this._clock.running = false;

      if (this.mode === MODES.DUAL_KEYBOARD) {
        document.addEventListener("keydown", this._keyHandler);
      }

      if (this.timeControl.seconds !== null) {
        this._startClock();
      }

      this._emit();
    }

    stop() {
      this._stopClock();
      document.removeEventListener("keydown", this._keyHandler);
    }

    // ──────────────────────────────────────────────
    //  MOVE
    // ──────────────────────────────────────────────

    /**
     * Make a move.
     * @param {string} from
     * @param {string} to
     * @param {string} [promotion] — "Q"|"R"|"B"|"N"
     * @returns {{ success: boolean, error: string|null }}
     */
    move(from, to, promotion = "Q") {
      if (this.gameOver)
        return { success: false, error: "Game is over." };

      if (!this.engine.isLegalMove(from, to, promotion))
        return { success: false, error: "Illegal move." };

      this.engine.move(from, to, promotion);
      this.drawOffer = null;

      // Check result
      const status = this.engine.status();
      if (status !== "playing") {
        this._endGame(status);
        return { success: true, error: null };
      }

      // Pass & play: show hand-device overlay before next player sees board
      if (this.mode === MODES.PASS_AND_PLAY) {
        this.showHandDevice = true;
        this._onTurnChange({
          turn:       this.engine.turn,
          playerName: this._nameForTurn(),
        });
      }

      this._emit();
      return { success: true, error: null };
    }

    /**
     * Dismiss the "hand the device" overlay (pass & play only).
     */
    confirmHandDevice() {
      this.showHandDevice = false;
      this._emit();
    }

    // ──────────────────────────────────────────────
    //  RESIGN
    // ──────────────────────────────────────────────

    /** Current player resigns. */
    resign() {
      if (this.gameOver) return;
      const winner = this.engine.turn === "white" ? "black" : "white";
      this._endGame("resignation", winner);
    }

    // ──────────────────────────────────────────────
    //  DRAW
    // ──────────────────────────────────────────────

    /** Offer a draw from `color`. */
    offerDraw(color) {
      if (this.gameOver) return;
      this.drawOffer = color;
      this._emit();
    }

    /** Opponent accepts the draw offer. */
    acceptDraw() {
      if (!this.drawOffer || this.gameOver) return;
      this._endGame("agreement", "draw");
    }

    /** Opponent declines the draw offer. */
    declineDraw() {
      this.drawOffer = null;
      this._emit();
    }

    // ──────────────────────────────────────────────
    //  UNDO  (local only — no undo in online)
    // ──────────────────────────────────────────────

    undo() {
      if (this.gameOver) return false;
      // In pass & play, undo TWO plies so same player moves again
      const plies = this.mode === MODES.PASS_AND_PLAY ? 2 : 1;
      let ok = false;
      for (let i = 0; i < plies; i++) ok = this.engine.undo() || ok;
      if (ok) {
        this.showHandDevice = false;
        this._emit();
      }
      return ok;
    }

    // ──────────────────────────────────────────────
    //  GETTERS
    // ──────────────────────────────────────────────

    get board()    { return this.engine.board; }
    get turn()     { return this.engine.turn; }
    get moveList() { return this.engine.moveList; }
    get plyCount() { return this.engine.plyCount; }
    get inCheck()  { return this.engine.isInCheck(); }

    getMovesFrom(sq)         { return this.engine.getMovesFrom(sq); }
    isLegalMove(from, to, p) { return this.engine.isLegalMove(from, to, p); }
    getPiece(sq)             { return this.engine.getPiece(sq); }

    /** Name of the player whose turn it currently is */
    _nameForTurn() {
      return this.engine.turn === "white" ? this.p1Name : this.p2Name;
    }

    /**
     * Full snapshot of all state — pass this to your UI renderer.
     */
    getSnapshot() {
      return {
        // Board
        board:       this.board,
        turn:        this.turn,
        moveList:    this.moveList,
        plyCount:    this.plyCount,
        inCheck:     this.inCheck,
        // Players
        player1Name: this.p1Name,
        player2Name: this.p2Name,
        currentPlayerName: this._nameForTurn(),
        // Game status
        gameOver:    this.gameOver,
        result:      this.result,
        reason:      this.reason,
        drawOffer:   this.drawOffer,
        // Pass & play
        showHandDevice: this.showHandDevice,
        // Clock
        clock: {
          white:     this.formatTime(this._clock.white),
          black:     this.formatTime(this._clock.black),
          whiteRaw:  this._clock.white,
          blackRaw:  this._clock.black,
          running:   this._clock.running,
          unlimited: this.timeControl.seconds === null,
        },
        // Mode
        mode:        this.mode,
        timeControl: this.timeControl.label,
      };
    }

    /** Format seconds → "MM:SS" */
    formatTime(seconds) {
      if (seconds === null) return "∞";
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    // ──────────────────────────────────────────────
    //  CHESS CLOCK
    // ──────────────────────────────────────────────

    _startClock() {
      this._clock.running = true;
      this._clock.interval = setInterval(() => {
        if (!this._clock.running || this.gameOver) return;

        const side = this.engine.turn;
        this._clock[side] = Math.max(0, this._clock[side] - 1);

        this._onClockTick({
          white:       this.formatTime(this._clock.white),
          black:       this.formatTime(this._clock.black),
          whiteRaw:    this._clock.white,
          blackRaw:    this._clock.black,
        });

        // Time out
        if (this._clock[side] === 0) {
          this._stopClock();
          const winner = side === "white" ? "black" : "white";
          this._endGame("timeout", winner);
        }
      }, 1000);
    }

    _stopClock() {
      this._clock.running = false;
      if (this._clock.interval) {
        clearInterval(this._clock.interval);
        this._clock.interval = null;
      }
    }

    // ──────────────────────────────────────────────
    //  DUAL KEYBOARD
    // ──────────────────────────────────────────────

    /**
     * Keyboard mapping:
     *   White (Player 1): W/A/S/D = move cursor, Space = select/confirm
     *   Black (Player 2): Arrow keys = move cursor, Enter = select/confirm
     *
     * Fires a "chess-keyboard" CustomEvent on document.
     * The UI layer listens to this and moves the cursor/selection.
     *
     * Event detail: { color: "white"|"black", action: "up"|"down"|"left"|"right"|"confirm" }
     */
    _onKeyDown(e) {
      if (this.gameOver) return;

      const turn = this.engine.turn;

      const WHITE_MAP = { w: "up", s: "down", a: "left", d: "right", " ": "confirm" };
      const BLACK_MAP = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        Enter: "confirm",
      };

      let action = null;
      let color  = null;

      if (turn === "white" && WHITE_MAP[e.key] !== undefined) {
        action = WHITE_MAP[e.key];
        color  = "white";
      } else if (turn === "black" && BLACK_MAP[e.key] !== undefined) {
        action = BLACK_MAP[e.key];
        color  = "black";
      }

      if (action && color) {
        e.preventDefault();
        document.dispatchEvent(
          new CustomEvent("chess-keyboard", { detail: { color, action } })
        );
      }
    }

    // ──────────────────────────────────────────────
    //  END GAME
    // ──────────────────────────────────────────────

    /**
     * @param {string} status   — engine status or custom reason
     * @param {string} [forced] — forced result ("white"|"black"|"draw")
     */
    _endGame(status, forced = null) {
      this._stopClock();
      this.gameOver = true;

      if (forced) {
        this.result = forced;
        this.reason = status;
      } else {
        switch (status) {
          case "checkmate":
            // The side that just moved wins (current turn is the loser)
            this.result = this.engine.turn === "white" ? "black" : "white";
            this.reason = "checkmate";
            break;
          case "stalemate":
            this.result = "draw";
            this.reason = "stalemate";
            break;
          case "draw-50":
            this.result = "draw";
            this.reason = "50-move rule";
            break;
          case "draw-material":
            this.result = "draw";
            this.reason = "insufficient material";
            break;
          default:
            this.result = "draw";
            this.reason = status;
        }
      }

      this._emit();
      this._onGameEnd({
        result:      this.result,
        reason:      this.reason,
        winner:      this.result === "white" ? this.p1Name
                   : this.result === "black" ? this.p2Name
                   : null,
        moveList:    this.moveList,
        plyCount:    this.plyCount,
        player1Name: this.p1Name,
        player2Name: this.p2Name,
        clock: {
          white: this.formatTime(this._clock.white),
          black: this.formatTime(this._clock.black),
        },
      });
    }

    // ──────────────────────────────────────────────
    //  EMIT
    // ──────────────────────────────────────────────

    _emit() {
      this._onStateChange(this.getSnapshot());
    }
  }

  // ──────────────────────────────────────────────
  //  EXPOSE
  // ──────────────────────────────────────────────

  if (typeof window !== "undefined") {
    window.LocalGame     = LocalGame;
    window.LOCAL_MODES   = MODES;
    window.TIME_CONTROLS = TIME_CONTROLS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { LocalGame, MODES, TIME_CONTROLS };
  }

})(typeof window !== "undefined" ? window : global);
