/**
 * ============================================================
 *  FIREBASE DB
 *  firebase-db.js
 *
 *  Handles: Save completed game to Firestore,
 *           Update player stats (wins/losses/draws/winRate),
 *           Elo rating calculation (K=32),
 *           Update leaderboard.
 *
 *  Depends on: firebase-config.js, firebase-profile.js
 * ============================================================
 */

import { db }                                  from "./firebase-config.js";
import { appendEloHistory }                    from "./firebase-profile.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  serverTimestamp,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────
//  ELO CALCULATION
// ──────────────────────────────────────────────

const K_FACTOR = 32; // Standard casual chess K-factor

/**
 * Calculate new Elo ratings after a game.
 *
 * @param {number} whiteElo
 * @param {number} blackElo
 * @param {string} result   — "white" | "black" | "draw"
 * @returns {{ newWhiteElo, newBlackElo, whiteChange, blackChange }}
 */
function calculateElo(whiteElo, blackElo, result) {
  // Expected scores
  const expectedWhite = 1 / (1 + Math.pow(10, (blackElo - whiteElo) / 400));
  const expectedBlack = 1 - expectedWhite;

  // Actual scores
  let actualWhite, actualBlack;
  if (result === "white")      { actualWhite = 1;   actualBlack = 0;   }
  else if (result === "black") { actualWhite = 0;   actualBlack = 1;   }
  else                         { actualWhite = 0.5; actualBlack = 0.5; }

  // New ratings
  const whiteChange = Math.round(K_FACTOR * (actualWhite - expectedWhite));
  const blackChange = Math.round(K_FACTOR * (actualBlack - expectedBlack));

  return {
    newWhiteElo: Math.max(100, whiteElo + whiteChange), // floor at 100
    newBlackElo: Math.max(100, blackElo + blackChange),
    whiteChange,
    blackChange,
  };
}

// ──────────────────────────────────────────────
//  SAVE GAME RESULT
// ──────────────────────────────────────────────

/**
 * Save a completed game and update both players' stats and Elo.
 * Call this once when a multiplayer game finishes.
 *
 * @param {Object} gameData
 *   {
 *     roomCode:     string,
 *     whiteUid:     string,
 *     whiteUsername: string,
 *     blackUid:     string,
 *     blackUsername: string,
 *     result:       "white" | "black" | "draw",
 *     reason:       "checkmate" | "stalemate" | "resignation" | "draw-50" | "draw-material" | "agreement",
 *     moves:        Array,
 *     fen:          string,   — final position
 *   }
 * @returns {Promise<{ eloChanges, error }>}
 */
async function saveGameResult(gameData) {
  try {
    const {
      roomCode, whiteUid, whiteUsername,
      blackUid, blackUsername,
      result, reason, moves, fen,
    } = gameData;

    // ── Fetch current Elo for both players ──
    const [whiteSnap, blackSnap] = await Promise.all([
      getDoc(doc(db, "users", whiteUid)),
      getDoc(doc(db, "users", blackUid)),
    ]);

    const whiteStats = whiteSnap.data()?.stats || {};
    const blackStats = blackSnap.data()?.stats || {};
    const whiteElo   = whiteStats.elo   || 1200;
    const blackElo   = blackStats.elo   || 1200;

    // ── Calculate new Elo ──
    const { newWhiteElo, newBlackElo, whiteChange, blackChange } =
      calculateElo(whiteElo, blackElo, result);

    // ── Determine win/loss/draw for each player ──
    const whiteResult = result === "white" ? "win" : result === "black" ? "loss" : "draw";
    const blackResult = result === "black" ? "win" : result === "white" ? "loss" : "draw";

    // ── Update white player stats ──
    await updatePlayerStats(whiteUid, whiteResult, newWhiteElo, whiteStats);

    // ── Update black player stats ──
    await updatePlayerStats(blackUid, blackResult, newBlackElo, blackStats);

    // ── Append Elo history for both ──
    await Promise.all([
      appendEloHistory(whiteUid, newWhiteElo, whiteChange, blackUsername, whiteResult),
      appendEloHistory(blackUid, newBlackElo, blackChange, whiteUsername, blackResult),
    ]);

    // ── Save game record to Firestore ──
    const gameId  = roomCode + "_" + Date.now();
    await setDoc(doc(db, "games", gameId), {
      roomCode,
      white:       { uid: whiteUid, username: whiteUsername, elo: whiteElo, newElo: newWhiteElo },
      black:       { uid: blackUid, username: blackUsername, elo: blackElo, newElo: newBlackElo },
      result,
      reason,
      moves:       moves || [],
      finalFen:    fen,
      playedAt:    serverTimestamp(),
    });

    return {
      eloChanges: { whiteChange, blackChange, newWhiteElo, newBlackElo },
      error: null,
    };

  } catch (err) {
    return { eloChanges: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  UPDATE PLAYER STATS  (internal)
// ──────────────────────────────────────────────

async function updatePlayerStats(uid, result, newElo, currentStats) {
  const wins        = (currentStats.wins   || 0) + (result === "win"  ? 1 : 0);
  const losses      = (currentStats.losses || 0) + (result === "loss" ? 1 : 0);
  const draws       = (currentStats.draws  || 0) + (result === "draw" ? 1 : 0);
  const gamesPlayed = wins + losses + draws;
  const winRate     = gamesPlayed > 0
    ? Math.round((wins / gamesPlayed) * 100) / 100
    : 0;
  const eloHigh     = Math.max(currentStats.eloHigh || 1200, newElo);

  const updatedStats = {
    "stats.wins":        wins,
    "stats.losses":      losses,
    "stats.draws":       draws,
    "stats.gamesPlayed": gamesPlayed,
    "stats.winRate":     winRate,
    "stats.elo":         newElo,
    "stats.eloHigh":     eloHigh,
  };

  // Update user profile
  await updateDoc(doc(db, "users", uid), updatedStats);

  // Update leaderboard
  await updateDoc(doc(db, "leaderboard", uid), {
    wins,
    losses,
    draws,
    gamesPlayed,
    winRate,
    elo:     newElo,
    eloHigh,
  });
}

// ──────────────────────────────────────────────
//  GET GAME HISTORY
// ──────────────────────────────────────────────

/**
 * Get recent games for a player (last 20).
 * @param {string} uid
 * @returns {Promise<{ games, error }>}
 */
async function getGameHistory(uid) {
  try {
    const { getDocs, query, collection, where, orderBy, limit } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    // Games where user was white
    const [whiteSnap, blackSnap] = await Promise.all([
      getDocs(query(
        collection(db, "games"),
        where("white.uid", "==", uid),
        orderBy("playedAt", "desc"),
        limit(20)
      )),
      getDocs(query(
        collection(db, "games"),
        where("black.uid", "==", uid),
        orderBy("playedAt", "desc"),
        limit(20)
      )),
    ]);

    const games = [
      ...whiteSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      ...blackSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ]
      .sort((a, b) => (b.playedAt?.seconds || 0) - (a.playedAt?.seconds || 0))
      .slice(0, 20);

    return { games, error: null };
  } catch (err) {
    return { games: [], error: err.message };
  }
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export { saveGameResult, calculateElo, getGameHistory };
