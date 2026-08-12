import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { validateEnv } from "./utils/env";
import "./index.css";

// Validate environment on startup
try {
  validateEnv();
  console.log("✓ Configuration validated successfully");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("⚠️ Configuration Error:", message);
  // Show error to user
  document.body.innerHTML = `
    <div style="padding: 20px; color: #ef4444; font-family: monospace; background: #000;">
      <h1>⚠️ Configuration Error</h1>
      <pre>${message}</pre>
      <p>Please check your .env file and restart the app</p>
    </div>
  `;
}

/**
 * isSafeToReload — a silent reload mid-video-playback or while someone's
 * mid-comment would be a bad interruption on a video platform. This
 * checks both before we let the new service worker take over.
 */
function isSafeToReload(): boolean {
  const videos = document.querySelectorAll("video");
  for (const v of Array.from(videos)) {
    if (!v.paused && !v.ended) return false;
  }
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
    return false;
  }
  return true;
}

/**
 * scheduleReload — defers the update until it's actually safe, checking
 * every 5s. Capped at 15 minutes so a tab left open indefinitely (e.g.
 * an autoplay playlist running for hours) still eventually picks up the
 * new version rather than staying on stale code forever.
 */
function scheduleReload(updateSW: (reloadPage?: boolean) => Promise<void>) {
  const startedAt = Date.now();
  const MAX_WAIT_MS = 15 * 60 * 1000;
  const POLL_MS = 5000;

  const tryReload = () => {
    const waitedTooLong = Date.now() - startedAt > MAX_WAIT_MS;
    if (isSafeToReload() || waitedTooLong) {
      updateSW(true);
    } else {
      setTimeout(tryReload, POLL_MS);
    }
  };
  tryReload();
}

/**
 * Service worker registration — this is what actually fixes "I have to
 * manually refresh to see new features." registerType: 'autoUpdate' in
 * vite.config.ts only updates the SW in the background; without this,
 * an already-open tab keeps running the old bundle indefinitely.
 *
 * immediate: true       -> checks for a new SW as soon as the app loads,
 *                           not only on the next visit.
 * onNeedRefresh          -> fires once a new SW has installed and is
 *                           waiting. Instead of reloading immediately,
 *                           scheduleReload() waits until no video is
 *                           playing and no input is focused, then
 *                           activates + reloads automatically — no
 *                           manual refresh, and no interrupted playback.
 * onRegisteredSW          -> also poll periodically while the tab stays
 *                           open, since many people leave a video tab
 *                           open for a long time without navigating.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    scheduleReload(updateSW);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
    setInterval(() => {
      registration.update().catch(() => { });
    }, CHECK_INTERVAL_MS);
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);