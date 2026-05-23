/**
 * ============================================================
 *  FIREBASE LEADERBOARD
 *  firebase-leaderboard.js
 *
 *  Handles: Global Elo leaderboard, top players,
 *           player rank lookup, pagination.
 *
 *  Depends on: firebase-config.js
 * ============================================================
 */

import { db }                                  from "./firebase-config.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  doc,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────
//  GET TOP PLAYERS
// ──────────────────────────────────────────────

/**
 * Fetch the top N players by Elo rating.
 * Only includes players with isPublic = true.
 *
 * @param {number} [count=50]        — how many players to fetch
 * @param {Object} [lastDoc=null]    — last document for pagination
 * @returns {Promise<{ players, lastDoc, error }>}
 */
async function getTopPlayers(count = 50, lastDoc = null) {
  try {
    let q = query(
      collection(db, "leaderboard"),
      where("isPublic", "==", true),
      where("gamesPlayed", ">=", 1),   // must have played at least 1 game
      orderBy("gamesPlayed"),          // needed for the above where clause
      orderBy("elo", "desc"),
      limit(count)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const players  = snapshot.docs.map((d, index) => ({
      uid:   d.id,
      rank:  index + 1,
      ...d.data(),
    }));

    const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    return { players, lastDoc: newLastDoc, error: null };
  } catch (err) {
    return { players: [], lastDoc: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  GET PLAYER RANK
// ──────────────────────────────────────────────

/**
 * Get how many public players have a higher Elo than the given user.
 * Rank = that count + 1.
 *
 * @param {string} uid
 * @returns {Promise<{ rank, elo, error }>}
 */
async function getPlayerRank(uid) {
  try {
    const userSnap = await getDoc(doc(db, "leaderboard", uid));
    if (!userSnap.exists()) return { rank: null, elo: null, error: "User not found." };

    const userData = userSnap.data();
    if (!userData.isPublic) return { rank: null, elo: userData.elo, error: "Profile is private." };

    const userElo = userData.elo;

    // Count players with higher Elo
    const q = query(
      collection(db, "leaderboard"),
      where("isPublic", "==", true),
      where("elo", ">", userElo)
    );

    const snapshot = await getDocs(q);
    const rank     = snapshot.size + 1;

    return { rank, elo: userElo, error: null };
  } catch (err) {
    return { rank: null, elo: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  SEARCH PLAYER ON LEADERBOARD
// ──────────────────────────────────────────────

/**
 * Search for a player by username on the leaderboard.
 * Case-insensitive prefix search.
 *
 * @param {string} username
 * @returns {Promise<{ players, error }>}
 */
async function searchLeaderboard(username) {
  try {
    const lower = username.toLowerCase();
    const q = query(
      collection(db, "leaderboard"),
      where("isPublic", "==", true),
      where("usernameLower", ">=", lower),
      where("usernameLower", "<=", lower + "\uf8ff"),
      orderBy("usernameLower"),
      limit(10)
    );

    const snapshot = await getDocs(q);
    const players  = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));

    return { players, error: null };
  } catch (err) {
    return { players: [], error: err.message };
  }
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export { getTopPlayers, getPlayerRank, searchLeaderboard };
