// hooks/useServerNotifications.ts
//
// Bell notifications stored on the server — e.g. "Cultmedia uploaded: …"
// for channels the user subscribed to with the bell ON. Rows are created
// by a database trigger when a public video becomes ready.
//
// Refreshes on login, every 2 minutes while the tab is visible, when the
// tab becomes visible again, and whenever refresh() is called (the Header
// calls it when the bell panel opens).

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { API_URL } from "../utils/constants";

export interface ServerNotification {
  id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  channel_name: string | null;
  channel_avatar: string | null;
  channel_handle: string | null;
  video_id: string | number | null;
  video_title: string | null;
  video_thumbnail: string | null;
}

const POLL_MS = 2 * 60 * 1000;

async function authFetch(path: string, init: RequestInit = {}) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("signed out");
  const token = await user.getIdToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export function useServerNotifications() {
  const [items, setItems] = useState<ServerNotification[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const uidRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const forUid = uidRef.current;
    if (!forUid) return;
    try {
      const res = await authFetch("/api/notifications?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      // Ignore a late answer that belongs to a user who has since logged out
      if (uidRef.current !== forUid) return;
      setItems(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch {
      // offline — keep what we have
    }
  }, []);

  // Follow login / logout
  useEffect(() => onAuthStateChanged(getAuth(), (user: User | null) => {
    uidRef.current = user?.uid ?? null;
    setUid(user?.uid ?? null);
    setItems([]); // never show the previous user's notifications
  }), []);

  // Poll while signed in and the tab is visible
  useEffect(() => {
    if (!uid) return;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid, refresh]);

  const markRead = useCallback((id: number) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    authFetch(`/api/notifications/${id}/read`, { method: "PUT" }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (uidRef.current) authFetch("/api/notifications/read-all", { method: "PUT" }).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    if (uidRef.current) authFetch("/api/notifications", { method: "DELETE" }).catch(() => {});
  }, []);

  return { items, uid, refresh, markRead, markAllRead, clear };
}
