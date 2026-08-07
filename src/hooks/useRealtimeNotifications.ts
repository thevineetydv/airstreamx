// hooks/useRealtimeNotifications.ts
//
// Connects once (per browser tab) to the SSE stream and fires a "video is
// live" notification the instant the server pushes one — no polling.
//
// Mount this ONCE, at App level (e.g. inside NotificationProvider or
// AppContent), so it's active across the whole session, not tied to
// whether the upload modal happens to be open.

import { useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
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
    let cancelled = false;

    (async () => {
      const user = getAuth().currentUser;
      if (!user) return; // not logged in — nothing to subscribe to

      const token = await user.getIdToken();
      if (cancelled) return;

      // EventSource doesn't support custom headers, so the auth token
      // has to travel as a query param here rather than an Authorization
      // header. Your verifyFirebaseToken middleware needs to also check
      // req.query.token as a fallback for this one route.
      const url = `${API_URL}/api/events/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as VideoReadyEvent | { type: "connected" };
          if (data.type === "video-ready") {
            callbackRef.current(data.videoId, data.title);
          }
        } catch {
          // Heartbeat comments (": heartbeat") don't reach here — only
          // real `data:` lines do — but guard anyway against malformed JSON.
        }
      };

      eventSource.onerror = () => {
        // Browser's EventSource auto-reconnects on its own after a
        // network hiccup — no manual retry logic needed here.
        console.warn("[realtime] SSE connection error (will auto-reconnect)");
      };
    })();

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, []);
}
