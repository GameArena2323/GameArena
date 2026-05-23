/**
 * ============================================================
 *  FIREBASE ONLINE MULTIPLAYER
 *  firebase-multiplayer.js
 *
 *  Handles online multiplayer via Firebase Realtime Database:
 *    - Create room (with 6-char code)
 *    - Join room by code
 *    - Real-time move sync
 *    - Clock sync (server timestamps)
 *    - Resign / Draw offer / Rematch
 *    - Disconnect detection
 *
 *  Depends on: firebase-config.js
 *  For matchmaking (auto-match), see: firebase-matchmaking.js
 * ============================================================
 */

import { db, rtdb }                            from "./firebase-config.js";
import {
  ref,
  set,
  get,
  push,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp as rtServerTimestamp,
  off,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  doc,
  setDoc,
  serverTimestamp,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────
//  CONSTANTS
// ──────────────────────────────────────────────

const TIME_CONTROLS_ONLINE = {
  unlimited:  { label: "Unlimited",  seconds: null },
  bullet1:    { label: "Bullet 1m",  seconds: 60   },
  blitz3:     { label: "Blitz 3m",   seconds: 180  },
  blitz5:     { label: "Blitz 5m",   seconds: 300  },
  rapid10:    { label: "Rapid 10m",  seconds: 600  },
  rapid15:    { label: "Rapid 15m",  seconds: 900  },
  classical:  { label: "Classical",  seconds: 1800 },
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ──────────────────────────────────────────────
//  ROOM CODE GENERATOR
// ──────────────────────────────────────────────

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// ──────────────────────────────────────────────
//  CREATE ROOM
// ──────────────────────────────────────────────

/**
 * Create a new game room. Creator plays WHITE.
 *
 * @param {{ uid, username }} user
 * @param {string} timeControlKey  — key from TIME_CONTROLS_ONLINE
 * @returns {Promise<{ roomCode, error }>}
 */
async function createRoom(user, timeControlKey = "unlimited") {
  try {
    const roomCode  = generateRoomCode();
    const tc        = TIME_CONTROLS_ONLINE[timeControlKey] || TIME_CONTROLS_ONLINE.unlimited;
    const roomRef   = ref(rtdb, `rooms/${roomCode}`);

    await set(roomRef, {
      code:        roomCode,
      status:      "waiting",       // waiting | active | finished
      timeControl: { key: timeControlKey, label: tc.label, seconds: tc.seconds },
      white: {
        uid:      user.uid,
        username: user.username,
        online:   true,
        clock:    tc.seconds,       // seconds remaining
      },
      black:       null,
      fen:         START_FEN,
      moves:       [],
      turn:        "white",
      result:      null,            // null | "white" | "black" | "draw"
      reason:      null,
      draw:        { white: false, black: false },
      rematch:     { white: false, black: false },
      lastMoveAt:  null,
      createdAt:   rtServerTimestamp(),
    });

    // On disconnect: mark white as offline
    onDisconnect(ref(rtdb, `rooms/${roomCode}/white/online`)).set(false);

    return { roomCode, error: null };
  } catch (err) {
    return { roomCode: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  JOIN ROOM
// ──────────────────────────────────────────────

/**
 * Join an existing room by code. Joiner plays BLACK.
 *
 * @param {string} roomCode
 * @param {{ uid, username }} user
 * @returns {Promise<{ room, color, error }>}
 */
async function joinRoom(roomCode, user) {
  try {
    const roomRef  = ref(rtdb, `rooms/${roomCode.toUpperCase()}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists())
      return { room: null, color: null, error: "Room not found. Check the code and try again." };

    const room = snapshot.val();

    if (room.status === "finished")
      return { room: null, color: null, error: "This game has already ended." };

    if (room.status === "active")
      return { room: null, color: null, error: "Game already in progress." };

    if (room.white?.uid === user.uid)
      return { room: null, color: null, error: "You created this room — share the code with a friend!" };

    const tc = room.timeControl || { seconds: null };

    await update(roomRef, {
      status: "active",
      black: {
        uid:      user.uid,
        username: user.username,
        online:   true,
        clock:    tc.seconds,
      },
    });

    onDisconnect(ref(rtdb, `rooms/${roomCode}/black/online`)).set(false);

    return { room, color: "black", error: null };
  } catch (err) {
    return { room: null, color: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  SEND MOVE
// ──────────────────────────────────────────────

/**
 * Broadcast a move to both players via Realtime Database.
 *
 * @param {string} roomCode
 * @param {string} fen            — new board FEN after the move
 * @param {{ from, to, flags }} move
 * @param {string} nextTurn       — "white" | "black"
 * @param {{ white, black }} clocks  — remaining seconds for each player
 */
async function sendMove(roomCode, fen, move, nextTurn, clocks = {}) {
  try {
    // Append to moves list
    await push(ref(rtdb, `rooms/${roomCode}/moves`), {
      from:       move.from,
      to:         move.to,
      promotion:  move.flags?.promotion || null,
      at:         rtServerTimestamp(),
    });

    // Update board state + clocks
    const updates = {
      fen,
      turn:       nextTurn,
      lastMoveAt: rtServerTimestamp(),
    };

    if (clocks.white !== undefined) updates["white/clock"] = clocks.white;
    if (clocks.black !== undefined) updates["black/clock"] = clocks.black;

    await update(ref(rtdb, `rooms/${roomCode}`), updates);
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  LISTEN TO ROOM
// ──────────────────────────────────────────────

/**
 * Subscribe to all real-time room changes.
 * Calls `callback(roomData)` on every update.
 *
 * @param {string} roomCode
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
function listenToRoom(roomCode, callback) {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  onValue(roomRef, (snap) => callback(snap.val()));
  return () => off(roomRef);
}

// ──────────────────────────────────────────────
//  END GAME
// ──────────────────────────────────────────────

/**
 * Mark the game as finished.
 * firebase-db.js then saves the result and updates Elo.
 *
 * @param {string} roomCode
 * @param {string} result   — "white" | "black" | "draw"
 * @param {string} reason   — "checkmate"|"stalemate"|"resignation"|"timeout"|"draw-50"|"draw-material"|"agreement"
 */
async function endGame(roomCode, result, reason) {
  try {
    await update(ref(rtdb, `rooms/${roomCode}`), {
      status: "finished",
      result,
      reason,
    });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  RESIGN
// ──────────────────────────────────────────────

/**
 * @param {string} roomCode
 * @param {string} color  — resigning player's color
 */
async function resign(roomCode, color) {
  const winner = color === "white" ? "black" : "white";
  return endGame(roomCode, winner, "resignation");
}

// ──────────────────────────────────────────────
//  DRAW OFFER
// ──────────────────────────────────────────────

/**
 * Offer a draw. If both players have offered, game ends as draw.
 * @param {string} roomCode
 * @param {string} color
 */
async function offerDraw(roomCode, color) {
  try {
    await update(ref(rtdb, `rooms/${roomCode}/draw`), { [color]: true });

    const snap = await get(ref(rtdb, `rooms/${roomCode}/draw`));
    const draw = snap.val() || {};

    if (draw.white && draw.black) {
      return endGame(roomCode, "draw", "agreement");
    }

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Decline the draw offer.
 * @param {string} roomCode
 * @param {string} color — color of the player DECLINING
 */
async function declineDraw(roomCode, color) {
  try {
    // Reset both draw flags
    await update(ref(rtdb, `rooms/${roomCode}/draw`), { white: false, black: false });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  REMATCH
// ──────────────────────────────────────────────

/**
 * Request a rematch. If both agree, the room resets with swapped colours.
 * @param {string} roomCode
 * @param {string} color
 */
async function requestRematch(roomCode, color) {
  try {
    await update(ref(rtdb, `rooms/${roomCode}/rematch`), { [color]: true });

    const snap    = await get(ref(rtdb, `rooms/${roomCode}/rematch`));
    const rematch = snap.val() || {};

    if (rematch.white && rematch.black) {
      const roomSnap = await get(ref(rtdb, `rooms/${roomCode}`));
      const room     = roomSnap.val();
      const tc       = room.timeControl || { seconds: null };

      // Swap colours
      await update(ref(rtdb, `rooms/${roomCode}`), {
        status:   "active",
        fen:      START_FEN,
        moves:    [],
        turn:     "white",
        result:   null,
        reason:   null,
        white: { ...room.black, clock: tc.seconds, online: true },
        black: { ...room.white, clock: tc.seconds, online: true },
        rematch:  { white: false, black: false },
        draw:     { white: false, black: false },
        lastMoveAt: null,
      });
    }

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  PRESENCE  (online/offline indicator)
// ──────────────────────────────────────────────

/**
 * Mark player as online and set auto-disconnect handler.
 * @param {string} roomCode
 * @param {string} color
 */
async function setOnline(roomCode, color) {
  const presenceRef = ref(rtdb, `rooms/${roomCode}/${color}/online`);
  await set(presenceRef, true);
  onDisconnect(presenceRef).set(false);
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export {
  TIME_CONTROLS_ONLINE,
  createRoom,
  joinRoom,
  sendMove,
  listenToRoom,
  endGame,
  resign,
  offerDraw,
  declineDraw,
  requestRematch,
  setOnline,
};
