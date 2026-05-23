/**
 * ============================================================
 *  FIREBASE CONFIG
 *  firebase-config.js
 *
 *  Initialises Firebase and exports all service instances.
 *  Must be the FIRST Firebase file loaded.
 *
 *  Load order:
 *    1. firebase-config.js      ← this file
 *    2. firebase-auth.js
 *    3. firebase-profile.js
 *    4. firebase-multiplayer.js
 *    5. firebase-leaderboard.js
 *    6. firebase-db.js
 * ============================================================
 */

// ── Firebase SDK (loaded via CDN in index.html) ──────────────
import { initializeApp }                        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase }                          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAnalytics }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// ── Your Firebase project credentials ───────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyD37HMOW2F3bNIlN8A2uZKz3Jha6PTpdRM",
  authDomain:        "game-arena-30870.firebaseapp.com",
  databaseURL:       "https://game-arena-30870-default-rtdb.firebaseio.com",
  projectId:         "game-arena-30870",
  storageBucket:     "game-arena-30870.firebasestorage.app",
  messagingSenderId: "229549562058",
  appId:             "1:229549562058:web:a1c6106644379c2d2187c33",
  measurementId:     "G-LC5EJVLTLQ",
};

// ── Initialise Firebase ──────────────────────────────────────
const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const rtdb      = getDatabase(app);
const analytics = getAnalytics(app);

// ── Export for use in all other Firebase files ───────────────
export { app, auth, db, rtdb, analytics };
