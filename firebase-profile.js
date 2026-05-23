/**
 * ============================================================
 *  FIREBASE PROFILE
 *  firebase-profile.js
 *
 *  Handles: Get/update profile, stats, public/private toggle,
 *           avatar, Elo history.
 *
 *  Depends on: firebase-config.js
 * ============================================================
 */

import { db }                                  from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
}                                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────
//  GET PROFILE
// ──────────────────────────────────────────────

/**
 * Get a user's full profile from Firestore.
 * @param {string} uid
 * @returns {Promise<{ profile, error }>}
 */
async function getProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { profile: null, error: "User not found." };
    return { profile: { uid, ...snap.data() }, error: null };
  } catch (err) {
    return { profile: null, error: err.message };
  }
}

/**
 * Get a user's public profile (for viewing other players).
 * Returns null if the profile is private.
 * @param {string} uid
 * @returns {Promise<{ profile, error }>}
 */
async function getPublicProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { profile: null, error: "User not found." };
    const data = snap.data();
    if (!data.isPublic) return { profile: null, error: "This profile is private." };
    return { profile: { uid, ...data }, error: null };
  } catch (err) {
    return { profile: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  UPDATE USERNAME
// ──────────────────────────────────────────────

/**
 * Update a user's display username.
 * @param {string} uid
 * @param {string} newUsername
 * @returns {Promise<{ error }>}
 */
async function updateUsername(uid, newUsername) {
  try {
    // Check availability
    const taken = await getDoc(doc(db, "usernames", newUsername.toLowerCase()));
    if (taken.exists()) return { error: "Username is already taken." };

    await updateDoc(doc(db, "users", uid), {
      username:      newUsername,
      usernameLower: newUsername.toLowerCase(),
    });

    // Update leaderboard entry too
    await updateDoc(doc(db, "leaderboard", uid), { username: newUsername });

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  UPDATE AVATAR
// ──────────────────────────────────────────────

/**
 * Update a user's avatar URL.
 * @param {string} uid
 * @param {string} avatarUrl
 * @returns {Promise<{ error }>}
 */
async function updateAvatar(uid, avatarUrl) {
  try {
    await updateDoc(doc(db, "users", uid), { avatar: avatarUrl });
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  TOGGLE PUBLIC / PRIVATE
// ──────────────────────────────────────────────

/**
 * Toggle a user's profile visibility.
 * If set to private, they are removed from the leaderboard.
 *
 * @param {string} uid
 * @param {boolean} isPublic
 * @returns {Promise<{ error }>}
 */
async function setProfileVisibility(uid, isPublic) {
  try {
    // Update user profile
    await updateDoc(doc(db, "users", uid), { isPublic });

    // Update leaderboard visibility
    await updateDoc(doc(db, "leaderboard", uid), { isPublic });

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  GET STATS
// ──────────────────────────────────────────────

/**
 * Get just the stats object for a user.
 * @param {string} uid
 * @returns {Promise<{ stats, error }>}
 */
async function getStats(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { stats: null, error: "User not found." };
    return { stats: snap.data().stats || {}, error: null };
  } catch (err) {
    return { stats: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
//  ELO HISTORY
// ──────────────────────────────────────────────

/**
 * Append an Elo change to the user's history (last 20 kept).
 * Called internally by firebase-db.js after each game.
 *
 * @param {string} uid
 * @param {number} newElo
 * @param {number} change    — positive or negative
 * @param {string} opponent  — opponent username
 * @param {string} result    — "win" | "loss" | "draw"
 */
async function appendEloHistory(uid, newElo, change, opponent, result) {
  try {
    const entry = {
      elo:      newElo,
      change,
      opponent,
      result,
      date: new Date().toISOString(),
    };

    // Get current history to trim to 20
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;

    const current = snap.data().stats?.eloHistory || [];
    const updated  = [...current, entry].slice(-20);

    await updateDoc(doc(db, "users", uid), {
      "stats.eloHistory": updated,
    });
  } catch (err) {
    console.error("appendEloHistory error:", err);
  }
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export {
  getProfile,
  getPublicProfile,
  updateUsername,
  updateAvatar,
  setProfileVisibility,
  getStats,
  appendEloHistory,
};
