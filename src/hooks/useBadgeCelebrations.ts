// hooks/useBadgeCelebrations.ts
//
// Tells a creator the moment they earn a badge ("🎉 You're a Rising
// Creator!"). Checks once after login (covers creators who already
// qualify, or whose video went live while they were away) and again
// whenever one of their videos finishes processing.
//
// Each badge is announced only once per creator per browser.

import { useCallback, useEffect, useRef } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { API_URL } from "../utils/constants";
import { BADGE_INFO, getCreatorBadges, type CreatorBadgeId } from "../utils/creatorBadges";

type Notify = (n: { type: "success"; title: string; message: string; href?: string }) => void;

const storageKey = (email: string) => `ax_badges_announced:${email.toLowerCase()}`;

function readAnnounced(email: string): Set<CreatorBadgeId> {
  try {
    const raw = localStorage.getItem(storageKey(email));
    return new Set(raw ? (JSON.parse(raw) as CreatorBadgeId[]) : []);
  } catch {
    return new Set();
  }
}

function saveAnnounced(email: string, ids: Set<CreatorBadgeId>) {
  try { localStorage.setItem(storageKey(email), JSON.stringify([...ids])); } catch { /* ignore */ }
}

const MESSAGES: Record<CreatorBadgeId, { title: string; message: string }> = {
  rising: {
    title: "🎉 Badhai ho! You're a Rising Creator",
    message: `${BADGE_INFO.rising.description}. Your badge now shows on your channel and videos. Keep going!`,
  },
};

export function useBadgeCelebrations(notify: Notify) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const running = useRef(false);

  const checkBadges = useCallback(async () => {
    const email = getAuth().currentUser?.email;
    if (!email || running.current) return;
    running.current = true;
    try {
      const enc = encodeURIComponent(email);
      // nocache: the video that just went live must be counted
      const [videosRes, custRes] = await Promise.all([
        fetch(`${API_URL}/videos?uploader=${enc}&limit=1&nocache=1`),
        fetch(`${API_URL}/api/channel-customization/${enc}`).catch(() => null),
      ]);
      if (!videosRes.ok) return;
      const total = Number((await videosRes.json())?.total) || 0;

      const announced = readAnnounced(email);
      const fresh = getCreatorBadges({ videoCount: total }).filter((id) => !announced.has(id));
      if (fresh.length === 0) return;

      const cust = custRes?.ok ? await custRes.json().catch(() => null) : null;
      const handle = cust?.customization?.handle?.trim() || email.split("@")[0];

      for (const id of fresh) {
        notifyRef.current({ type: "success", ...MESSAGES[id], href: `/@${handle.replace(/^@/, "")}` });
        announced.add(id);
      }
      saveAnnounced(email, announced);
    } catch {
      // Offline or server hiccup — we'll check again next time
    } finally {
      running.current = false;
    }
  }, []);

  // Check after every login / page load with a restored session
  useEffect(() => onAuthStateChanged(getAuth(), (user) => { if (user) checkBadges(); }), [checkBadges]);

  return checkBadges;
}
