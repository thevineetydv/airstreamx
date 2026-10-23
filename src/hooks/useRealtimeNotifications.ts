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
    let abort: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const close = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      abort?.abort();
      abort = null;
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      retryTimer = setTimeout(() => connect(getAuth().currentUser), 15_000);
    };

    // fetch() instead of EventSource so the token goes in the Authorization
    // header, not the URL (URLs end up in Cloudflare/nginx/pm2 access logs).
    const connect = async (user: User | null) => {
      close();
      if (!user || cancelled) return;
      let token: string;
      try { token = await user.getIdToken(); } catch { return; }
      if (cancelled) return;

      const ctrl = new AbortController();
      abort = ctrl;
      try {
        const res = await fetch(`${API_URL}/api/events/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) { scheduleRetry(); return; }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const data = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!data) continue; // heartbeat comment
            try {
              const evt = JSON.parse(data) as VideoReadyEvent | { type: "connected" };
              if (evt.type === "video-ready") callbackRef.current(evt.videoId, evt.title);
            } catch { /* ignore bad JSON */ }
          }
        }
        scheduleRetry(); // server closed the stream
      } catch {
        if (!ctrl.signal.aborted) scheduleRetry();
      }
    };

    const unsubscribe = onIdTokenChanged(getAuth(), (user) => {
      if (!user) { close(); return; }
      if (!abort) connect(user);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      close();
    };
  }, []);
}
