/**
 * ============================================================
 *  FIREBASE MATCHMAKING
 *  firebase-matchmaking.js
 *
 *  Auto-matches players looking for a game (random opponent).
 *
 *  How it works:
 *    1. Player joins the matchmaking queue (filtered by time control)
 *    2. If another player is already waiting → they are matched,
 *       a room is created, and both are redirected to it
 *    3. If nobody is waiting → player waits in queue
 *    4. Queue entry auto-removes on disconnect
 *
 *  Depends on: firebase-config.js, firebase-multiplayer.js
 * ============================================================
 */

import { rtdb }                                from "./firebase-config.js";
import { createRoom }                          from "./firebase-multiplayer.js";
import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
  query,
  orderByChild,
  equalTo,
  off,
  serverTimestamp,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ──────────────────────────────────────────────
//  JOIN MATCHMAKING QUEUE
// ──────────────────────────────────────────────

/**
 * Join the matchmaking queue. If a suitable opponent is found,
 * returns a roomCode immediately. Otherwise, waits and calls
 * `onMatched(roomCode, color)` when a match is found.
 *
 * @param {{ uid, username }} user
 * @param {string} timeControlKey    — e.g. "blitz5"
 * @param {Function} onMatched       — called with (roomCode, color) when matched
 * @param {Function} onWaiting       — called when added to queue (no opponent yet)
 * @returns {Function} cancelMatchmaking — call this to leave the queue
 */
async function joinMatchmaking(user, timeControlKey = "unlimited", onMatched, onWaiting) {
  const queueRef    = ref(rtdb, `matchmaking/${timeControlKey}`);
  const myEntryRef  = ref(rtdb, `matchmaking/${timeControlKey}/${user.uid}`);

  try {
    // Check if anyone is already waiting
    const snapshot = await get(queueRef);
    const queue    = snapshot.val() || {};

    // Find a waiting player (not ourselves)
    const opponents = Object.entries(queue).filter(
      ([uid, entry]) => uid !== user.uid && entry.status === "waiting"
    );

    if (opponents.length > 0) {
      // Match found — take the first opponent
      const [opponentUid, opponentEntry] = opponents[0];
      const opponentRef = ref(rtdb, `matchmaking/${timeControlKey}/${opponentUid}`);

      // Create the room (opponent is white, we are black)
      const { roomCode, error } = await createRoom(
        { uid: opponentUid, username: opponentEntry.username },
        timeControlKey
      );

      if (error) return () => {};

      // Update opponent's queue entry with the room code
      await update(opponentRef, { status: "matched", roomCode });

      // Remove our entry (we'll join the room directly)
      await remove(myEntryRef);

      // Tell us to join as black
      onMatched(roomCode, "black");
      return () => {};

    } else {
      // No opponent — add ourselves to the queue
      await set(myEntryRef, {
        uid:         user.uid,
        username:    user.username,
        timeControl: timeControlKey,
        status:      "waiting",
        joinedAt:    serverTimestamp(),
      });

      // Auto-remove from queue on disconnect
      onDisconnect(myEntryRef).remove();

      // Tell caller we're waiting
      if (onWaiting) onWaiting();

      // Listen for when we get matched
      let unsubscribe;
      const cancelListener = new Promise((resolve) => {
        unsubscribe = onValue(myEntryRef, async (snap) => {
          const entry = snap.val();
          if (!entry) return; // removed (shouldn't happen here)

          if (entry.status === "matched" && entry.roomCode) {
            // Clean up our queue entry
            off(myEntryRef);
            await remove(myEntryRef);

            // We are white (we created the room via the opponent's code flow)
            onMatched(entry.roomCode, "white");
            resolve();
          }
        });
      });

      // Return a cancel function
      return async () => {
        off(myEntryRef);
        await remove(myEntryRef);
      };
    }

  } catch (err) {
    console.error("Matchmaking error:", err);
    return () => {};
  }
}

// ──────────────────────────────────────────────
//  LEAVE MATCHMAKING QUEUE
// ──────────────────────────────────────────────

/**
 * Remove the player from the matchmaking queue.
 * @param {string} uid
 * @param {string} timeControlKey
 */
async function leaveMatchmaking(uid, timeControlKey) {
  try {
    await remove(ref(rtdb, `matchmaking/${timeControlKey}/${uid}`));
  } catch (err) {
    console.error("leaveMatchmaking error:", err);
  }
}

// ──────────────────────────────────────────────
//  GET QUEUE SIZE  (for "X players waiting" display)
// ──────────────────────────────────────────────

/**
 * Get how many players are currently in the queue for a time control.
 * @param {string} timeControlKey
 * @returns {Promise<number>}
 */
async function getQueueSize(timeControlKey) {
  try {
    const snap = await get(ref(rtdb, `matchmaking/${timeControlKey}`));
    if (!snap.exists()) return 0;
    const queue = snap.val() || {};
    return Object.values(queue).filter((e) => e.status === "waiting").length;
  } catch {
    return 0;
  }
}

// ──────────────────────────────────────────────
//  LISTEN TO QUEUE SIZE  (live "players waiting" count)
// ──────────────────────────────────────────────

/**
 * Subscribe to live queue size for a time control.
 * @param {string} timeControlKey
 * @param {Function} callback  — called with (count: number)
 * @returns {Function} unsubscribe
 */
function listenToQueueSize(timeControlKey, callback) {
  const queueRef = ref(rtdb, `matchmaking/${timeControlKey}`);
  onValue(queueRef, (snap) => {
    const queue = snap.val() || {};
    const count = Object.values(queue).filter((e) => e.status === "waiting").length;
    callback(count);
  });
  return () => off(queueRef);
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export {
  joinMatchmaking,
  leaveMatchmaking,
  getQueueSize,
  listenToQueueSize,
};
