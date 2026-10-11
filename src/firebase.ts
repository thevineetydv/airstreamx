// src/firebase.ts
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { ENV } from "./utils/env";
import { clearAllCache } from "./utils/metadataCache";

// Firebase configuration - uses centralized ENV from utils/env.ts
const firebaseConfig = {
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.FIREBASE_APP_ID,
  measurementId: ENV.FIREBASE_MEASUREMENT_ID
};

// Validation is now done in main.tsx via validateEnv()

const app = initializeApp(firebaseConfig);

// Auth
// initializeAuth() instead of getAuth(): getAuth() attaches the popup/redirect
// resolver at startup, which eagerly loads Google's auth iframe (~126 KB:
// __/auth/iframe.js + gapi) on every page, even for logged-out visitors.
// Without a default resolver, that iframe is only loaded when the user
// actually clicks "Sign in" (the resolver is passed to signInWithPopup below).
// Session persistence is unchanged: IndexedDB first, localStorage fallback.
// Other files calling getAuth() get this same instance.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});
export const googleProvider = new GoogleAuthProvider();

// Functions
const PENDING_REDIRECT_KEY = "asx_auth_redirect_pending";

export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
  } catch (err) {
    // The auth iframe now loads on click, so some browsers (mainly Safari)
    // may block the popup. Fall back to a full-page redirect in that case.
    if ((err as { code?: string })?.code === "auth/popup-blocked") {
      try { sessionStorage.setItem(PENDING_REDIRECT_KEY, "1"); } catch { /* ignore */ }
      return signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
    }
    throw err;
  }
};

// Complete a redirect sign-in only when one was actually started, so normal
// page loads still skip the auth iframe.
try {
  if (sessionStorage.getItem(PENDING_REDIRECT_KEY)) {
    sessionStorage.removeItem(PENDING_REDIRECT_KEY);
    getRedirectResult(auth, browserPopupRedirectResolver).catch((e) =>
      console.error("Redirect sign-in failed:", e)
    );
  }
} catch { /* sessionStorage unavailable */ }

// Clear cached API data on logout so the next person on this browser
// never sees the previous user's private videos or recommendations.
export const logout = () => signOut(auth).finally(() => clearAllCache());
