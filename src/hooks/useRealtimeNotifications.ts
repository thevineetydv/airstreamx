// hooks/useRealtimeNotifications.ts
//
// Connects once (per browser tab) to the SSE stream and fires a "video is
// live" notification the instant the server pushes one — no polling.
//
// Mount this ONCE, at App level (e.g. inside NotificationProvider or
// AppContent), so it's active across the whole session, not tied to
// whether the upload modal happens to be open.

import { useEffect, useRef } from "react";
import { getAuth, onIdTokenChanged, type User } from "firebase/auth";
import { API_URL } from "../utils/constants";

interface VideoReadyEvent {
  type: "video-ready";
  videoId: string;
  title: string;
}

export function useRealtimeNotifications(
  onVideoReady: (videoId: string, title: string) => void
) {
  // Keep the latest callback in a ref so the effect below doesn't need
  // to reconnect the SSE stream every time the caller passes a new
  // inline function (which would otherwise happen on every render).
  const callbackRef = useRef(onVideoReady);
  callbackRef.current = onVideoReady;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const close = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      eventSource?.close();
      eventSource = null;
    };

    // EventSource doesn't support custom headers, so the auth token
    // travels as a query param (verifyFirebaseToken checks req.query.token
    // for this route).
    const connect = async (user: User | null) => {
      close();
      if (!user || cancelled) return; // not logged in — nothing to subscribe to
      let token: string;
      try { token = await user.getIdToken(); } catch { return; }
      if (cancelled) return;

      const es = new EventSource(`${API_URL}/api/events/stream?token=${encodeURIComponent(token)}`);
      eventSource = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as VideoReadyEvent | { type: "connected" };
          if (data.type === "video-ready") {
            callbackRef.current(data.videoId, data.title);
          }
        } catch {
          // Heartbeat comments never reach here; guard against bad JSON anyway
        }
      };

      es.onerror = () => {
        // The browser retries by itself after a network blip, but gives up
        // for good after an HTTP error (e.g. 401 once the 1-hour token in the
        // URL has expired). In that case reconnect with a fresh token.
        if (es.readyState === EventSource.CLOSED && !cancelled) {
          retryTimer = setTimeout(() => connect(getAuth().currentUser), 15_000);
        }
      };
    };

    // Previously this ran once on mount, when Firebase usually hasn't
    // restored the session yet — so after any page refresh the stream was
    // never opened. Follow the auth state instead (also handles login/logout).
    const unsubscribe = onIdTokenChanged(getAuth(), (user) => {
      // Token refreshes fire this too; only reconnect when there's no live stream
      if (!user) { close(); return; }
      if (!eventSource || eventSource.readyState === EventSource.CLOSED) connect(user);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      close();
    };
  }, []);
}
