/**
 * ============================================================
 *  FIREBASE AUTH
 *  firebase-auth.js
 *
 *  Handles: Register, Login, Logout, Password Reset,
 *           Auth state listener.
 *
 *  Depends on: firebase-config.js
 * ============================================================
 */

import { auth, db }                          from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
}                                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
}                                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────
//  REGISTER
// ──────────────────────────────────────────────

/**
 * Register a new user with email, password and username.
 * Creates the user in Firebase Auth and their profile in Firestore.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} username
 * @returns {Promise<{ user, error }>}
 */
async function register(email, password, username) {
  try {
    // Check username is not already taken
    const usernameDoc = await getDoc(doc(db, "usernames", username.toLowerCase()));
    if (usernameDoc.exists()) {
      return { user: null, error: "Username is already taken." };
    }

    // Create auth account
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user       = credential.user;

    // Set display name
    await updateProfile(user, { displayName: username });

    // Create Firestore profile
    await setDoc(doc(db, "users", user.uid), {
      username,
      usernameLower: username.toLowerCase(),
      email,
      avatar:        null,
      isPublic:      true,
      createdAt:     serverTimestamp(),
      stats: {
        wins:        0,
        losses:      0,
        draws:       0,
        gamesPlayed: 0,
        winRate:     0,
        elo:         1200,
        eloHigh:     1200,
      },
    });

    // Reserve the username
    await setDoc(doc(db, "usernames", username.toLowerCase()), {
      uid: user.uid,
    });

    // Create leaderboard entry
    await setDoc(doc(db, "leaderboard", user.uid), {
      username,
      wins:        0,
      losses:      0,
      draws:       0,
      gamesPlayed: 0,
      winRate:     0,
      elo:         1200,
      eloHigh:     1200,
      isPublic:    true,
    });

    return { user, error: null };

  } catch (err) {
    return { user: null, error: friendlyError(err.code) };
  }
}

// ──────────────────────────────────────────────
//  LOGIN
// ──────────────────────────────────────────────

/**
 * Login with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user, error }>}
 */
async function login(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { user: credential.user, error: null };
  } catch (err) {
    return { user: null, error: friendlyError(err.code) };
  }
}

// ──────────────────────────────────────────────
//  LOGOUT
// ──────────────────────────────────────────────

/**
 * Sign the current user out.
 * @returns {Promise<{ error }>}
 */
async function logout() {
  try {
    await signOut(auth);
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
//  PASSWORD RESET
// ──────────────────────────────────────────────

/**
 * Send a password reset email.
 * @param {string} email
 * @returns {Promise<{ error }>}
 */
async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err.code) };
  }
}

// ──────────────────────────────────────────────
//  AUTH STATE LISTENER
// ──────────────────────────────────────────────

/**
 * Listen to auth state changes.
 * Calls `callback(user)` whenever the user logs in or out.
 * user = Firebase User object | null
 *
 * @param {Function} callback
 * @returns unsubscribe function
 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the currently logged-in user, or null.
 * @returns {import("firebase/auth").User | null}
 */
function getCurrentUser() {
  return auth.currentUser;
}

// ──────────────────────────────────────────────
//  HELPER — Friendly error messages
// ──────────────────────────────────────────────

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use":    "That email is already registered.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/weak-password":           "Password must be at least 6 characters.",
    "auth/user-not-found":          "No account found with that email.",
    "auth/wrong-password":          "Incorrect password.",
    "auth/too-many-requests":       "Too many attempts. Please try again later.",
    "auth/network-request-failed":  "Network error. Check your connection.",
    "auth/invalid-credential":      "Invalid email or password.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ──────────────────────────────────────────────
//  EXPOSE
// ──────────────────────────────────────────────

export { register, login, logout, resetPassword, onAuthChange, getCurrentUser };
