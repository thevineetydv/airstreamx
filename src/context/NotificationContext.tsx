// ============================================================
// NotificationContext.tsx
// Global notification state + video-ready polling.
// Polling lives here (not in UploadModal) so it survives
// the modal closing or the component unmounting.
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { API_URL } from "../utils/constants";
import { useRealtimeNotifications } from "../hooks/useRealtimeNotifications";
import { useBadgeCelebrations } from "../hooks/useBadgeCelebrations";
import { useServerNotifications } from "../hooks/useServerNotifications";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type NotificationType = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: NotificationType;
  /** Optional link to navigate to when clicked */
  href?: string;
  /** Optional thumbnail (e.g. the new video) */
  image?: string;
  /** Epoch ms — used to sort local and server notifications together */
  createdAt?: number;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "time" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  /** Re-check the server for new notifications (call when the bell opens) */
  refreshNotifications: () => void;
  /**
   * Start polling a video until its status becomes "ready".
   * Fires a "Your video is live!" notification automatically.
   * Safe to call right after upload — survives modal unmount.
   */
  startVideoReadyPolling: (videoId: string | number, videoTitle: string) => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

const POLL_INTERVAL_MS  = 5000;  // check every 5 seconds
const MAX_POLL_ATTEMPTS = 72;    // give up after 6 minutes

function readLocal(key: string): AppNotification[] {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return []; // corrupted/blocked storage — fall back to empty, don't crash
  }
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Server-side notifications (new uploads from subscribed channels)
  const {
    items: serverItems, uid, refresh: refreshServer,
    markRead: markServerRead, markAllRead: markAllServerRead, clear: clearServer,
  } = useServerNotifications();

  // Local notifications (upload finished, badges…) are stored PER USER.
  // The old single key showed one person's notifications to whoever
  // logged in next on the same browser.
  const storageKey = `airstream_notifications:${uid ?? "guest"}`;
  const [localState, setLocalState] = useState<{ key: string; items: AppNotification[] }>(
    () => ({ key: "", items: [] })
  );
  // Load the right user's list whenever the signed-in user changes
  const notificationsLocal = localState.key === storageKey ? localState.items : readLocal(storageKey);
  const setNotifications = useCallback(
    (update: (prev: AppNotification[]) => AppNotification[]) =>
      setLocalState((st) => {
        const prev = st.key === storageKey ? st.items : readLocal(storageKey);
        return { key: storageKey, items: update(prev) };
      }),
    [storageKey]
  );

  // Switch to the signed-in user's list (login / logout / account change)
  useEffect(() => {
    setLocalState((st) => (st.key === storageKey ? st : { key: storageKey, items: readLocal(storageKey) }));
  }, [storageKey]);

  // Persist the current user's list
  useEffect(() => {
    if (localState.key !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(localState.items));
    } catch {
      // Storage full or blocked (private browsing) — still works for this session
    }
  }, [localState, storageKey]);

  // One-time cleanup of the old shared key
  useEffect(() => {
    try { localStorage.removeItem("airstream_notifications"); } catch { /* ignore */ }
  }, []);

  // Track active polling timers so we never duplicate-poll the same video
  const pollingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const stopPolling = useCallback((key: string) => {
    const timer = pollingTimers.current.get(key);
    if (timer) clearTimeout(timer);
    pollingTimers.current.delete(key);
  }, []);

  // ── Core helpers ─────────────────────────────

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "time" | "read">) => {
      const notification: AppNotification = {
        ...n,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        time: formatTime(new Date()),
        createdAt: Date.now(),
        read: false,
      };
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
    },
    [setNotifications]
  );

  const markAsRead = useCallback((id: string) => {
    if (id.startsWith("srv-")) { markServerRead(Number(id.slice(4))); return; }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, [markServerRead, setNotifications]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllServerRead();
  }, [markAllServerRead, setNotifications]);

  const clearAll = useCallback(() => {
    setNotifications(() => []);
    clearServer();
  }, [clearServer, setNotifications]);

  // Badge announcements (Rising Creator, …) — checked on login and
  // whenever one of the creator's videos goes live.
  const checkBadges = useBadgeCelebrations(addNotification);

  // ── Video-ready polling ───────────────────────

  const startVideoReadyPolling = useCallback(
    (videoId: string | number, videoTitle: string) => {
      const key = String(videoId);

      // Prevent duplicate polling for the same video
      if (pollingTimers.current.has(key)) return;

      let attempts = 0;

      const poll = async () => {
        attempts++;

        try {
          // Lightweight status endpoint: works for private/unlisted videos too
          // and never returns a cached copy.
          const res  = await fetch(`${API_URL}/videos/${key}/status`);
          const data = await res.json();

          // Handle both response shapes: { video: { status } } or { status }
          const status: string = data?.video?.status ?? data?.status ?? "";

          if (status === "ready") {
            addNotification({
              type:    "success",
              title:   "🎉 Your video is live!",
              message: `"${videoTitle}" has finished processing and is ready to watch.`,
              href:    `/watch?v=${key}`,
            });
            pollingTimers.current.delete(key);
            checkBadges();
            return; // done
          }

          if (status === "failed" || status === "error") {
            addNotification({
              type:    "error",
              title:   "Video processing failed",
              message: `"${videoTitle}" could not be processed. Please try uploading again.`,
            });
            pollingTimers.current.delete(key);
            return;
          }

          // Still processing — keep going
        } catch {
          // Network hiccup — keep polling silently
        }

        if (attempts < MAX_POLL_ATTEMPTS) {
          const timer = setTimeout(poll, POLL_INTERVAL_MS);
          pollingTimers.current.set(key, timer);
        } else {
          // Timeout after 6 minutes
          addNotification({
            type:    "warning",
            title:   "Processing is taking longer than usual",
            message: `"${videoTitle}" is still being processed. Check back in a few minutes.`,
          });
          pollingTimers.current.delete(key);
        }
      };

      // First poll after 5 s — give the server time to start processing
      const timer = setTimeout(poll, POLL_INTERVAL_MS);
      pollingTimers.current.set(key, timer);
    },
    [addNotification, checkBadges]
  );

  // ── Real-time push (SSE) — the primary path now, YouTube-style ──
  // Fires the instant the server pushes an event, no 5s polling delay.
  // Polling above still runs as an automatic fallback (e.g. if SSE is
  // blocked by a corporate firewall/proxy) — stopPolling() here just
  // prevents a duplicate notification if both happen to fire.
  useRealtimeNotifications((videoId, videoTitle) => {
    const key = String(videoId);
    stopPolling(key);
    addNotification({
      type: "success",
      title: "🎉 Your video is live!",
      message: `"${videoTitle}" has finished processing and is ready to watch.`,
      href: `/watch?v=${key}`,
    });
    checkBadges();
  });

  // ─────────────────────────────────────────────

  // Local + server notifications, newest first
  const serverMapped: AppNotification[] = serverItems.map((n) => {
    const at = new Date(n.created_at).getTime();
    return {
      id: `srv-${n.id}`,
      type: "info",
      title: n.channel_name ? `${n.channel_name} uploaded a new video` : "New video",
      message: n.video_title || n.message,
      time: formatTime(new Date(at)),
      createdAt: at,
      read: n.is_read,
      href: n.video_id ? `/watch?v=${n.video_id}` : undefined,
      image: n.video_thumbnail || undefined,
    };
  });
  const notifications = [...notificationsLocal, ...serverMapped]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        refreshNotifications: refreshServer,
        startVideoReadyPolling,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}