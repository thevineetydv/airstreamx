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
  ReactNode,
} from "react";
import { API_URL } from "../utils/constants";

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
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "time" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
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

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Track active polling timers so we never duplicate-poll the same video
  const pollingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Core helpers ─────────────────────────────

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "time" | "read">) => {
      const notification: AppNotification = {
        ...n,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        time: formatTime(new Date()),
        read: false,
      };
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

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
          const res  = await fetch(`${API_URL}/videos/${key}`);
          const data = await res.json();

          // Handle both response shapes: { video: { status } } or { status }
          const status: string = data?.video?.status ?? data?.status ?? "";

          if (status === "ready") {
            addNotification({
              type:    "success",
              title:   "🎉 Your video is live!",
              message: `"${videoTitle}" has finished processing and is now public.`,
              href:    `/watch/${key}`,
            });
            pollingTimers.current.delete(key);
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
    [addNotification]
  );

  // ─────────────────────────────────────────────

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

