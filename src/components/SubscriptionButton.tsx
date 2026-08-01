import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useReducer,
} from "react";
import { Bell, BellOff, Check, UserPlus, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "../firebase";
import { API_URL } from "../utils/constants";

interface SubscriptionButtonProps {
  channelId: number | string;
  channelName: string;
  initialSubscriberCount?: number;
  onSubscriptionChange?: (subscribed: boolean, count: number) => void;
}

interface SubState {
  subscribed: boolean;
  notificationsEnabled: boolean;
  subscriberCount: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function looksLikeEmail(v: string | number): boolean {
  return typeof v === "string" && v.includes("@");
}

function isValidNumericId(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function backoffDelay(attempt: number): Promise<void> {
  const ms = Math.min(300 * 2 ** attempt, 5_000);
  return new Promise(r => setTimeout(r, ms));
}

export function SubscriptionButton({
  channelId,
  channelName,
  initialSubscriberCount = 0,
  onSubscriptionChange,
}: SubscriptionButtonProps) {
  const [sub, setSub] = useReducer(
    (prev: SubState, next: Partial<SubState>) => ({ ...prev, ...next }),
    {
      subscribed: false,
      notificationsEnabled: true,
      subscriberCount: initialSubscriberCount,
    }
  );

  const [loading, setLoading] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showNotifTooltip, setShowNotifTooltip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const numericIdRef = useRef<number | null>(
    isValidNumericId(channelId) ? (channelId as number) : null
  );
  const prevChannelIdRef = useRef(channelId);

  useEffect(() => {
    if (prevChannelIdRef.current !== channelId) {
      // ── BUG FIX: Stale subscriber count on channel change ─────────────────
      // When channelId changes (e.g. navigating watch page A → B) we must
      // reset all subscription state immediately. Without this, the previous
      // channel's subscribed=true / count=5 lingers until the status fetch
      // resolves, causing wrong UI and wrong count flash on the new channel.
      numericIdRef.current = isValidNumericId(channelId) ? (channelId as number) : null;
      prevChannelIdRef.current = channelId;
      setSub({
        subscribed: false,
        notificationsEnabled: true,
        subscriberCount: initialSubscriberCount,
      });
      setChecking(true);
    }
  }, [channelId, initialSubscriberCount]);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4_000);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    try { return (await auth.currentUser?.getIdToken()) ?? null; }
    catch { return null; }
  }, []);

  const resolveNumericId = useCallback(async (): Promise<number | null> => {
    if (numericIdRef.current !== null) return numericIdRef.current;
    if (isValidNumericId(channelId)) { numericIdRef.current = channelId as number; return channelId as number; }
    const parsed = Number(channelId);
    if (isValidNumericId(parsed)) { numericIdRef.current = parsed; return parsed; }
    if (looksLikeEmail(channelId)) {
      try {
        const res = await fetch(`${API_URL}/api/channels/by-email/${encodeURIComponent(String(channelId))}`);
        if (res.ok) {
          const data = await res.json();
          const id = data?.channel?.id ?? data?.id ?? null;
          const numId = Number(id);
          if (isValidNumericId(numId)) { numericIdRef.current = numId; return numId; }
        }
      } catch { }
    }
    return null;
  }, [channelId]);

// ✅ NEW: fetch count publicly without needing auth token
const fetchPublicCount = useCallback(async () => {
  try {
    if (looksLikeEmail(channelId)) {
      const res = await fetch(
        `${API_URL}/api/channels/by-email/${encodeURIComponent(String(channelId))}`
      );
      if (res.ok) {
        const data = await res.json();
        const count =
          data?.channel?.subscriber_count ??
          data?.subscriber_count ??
          null;
        if (typeof count === "number") {
          setSub({ subscriberCount: count });
          onSubscriptionChange?.(false, count);
        }
      }
    } else {
      const numId = await resolveNumericId();
      if (numId) {
        const res = await fetch(`${API_URL}/api/channels/${numId}/subscribers`);
        if (res.ok) {
          const data = await res.json();
          const count = data?.subscriber_count ?? data?.count ?? null;
          if (typeof count === "number") {
            setSub({ subscriberCount: count });
            onSubscriptionChange?.(false, count);
          }
        }
      }
    }
  } catch {
    // silent fail — count just stays at 0
  }
}, [channelId, resolveNumericId, onSubscriptionChange]);

  const checkSubscriptionStatus = useCallback(async (attempt = 0) => {
    if (attempt === 0) setChecking(true);
    const token = await getToken();
    if (!token) { setChecking(false); return; }
    const numId = await resolveNumericId();
    const statusParam = numId ?? encodeURIComponent(String(channelId));
    try {
      const res = await fetch(`${API_URL}/api/subscribe/status/${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSub({
          subscribed: data.subscribed ?? false,
          notificationsEnabled: data.notifications_enabled ?? true,
          ...(typeof data.subscriber_count === "number" && { subscriberCount: data.subscriber_count }),
        });
      } else if (res.status >= 500 && attempt < 3) {
        await backoffDelay(attempt);
        return checkSubscriptionStatus(attempt + 1);
      }
    } catch {
      if (attempt < 3) { await backoffDelay(attempt); return checkSubscriptionStatus(attempt + 1); }
    } finally {
      if (attempt === 0) setChecking(false);
    }
  }, [channelId, getToken, resolveNumericId]);

useEffect(() => {
  if (!channelId) return;
  const unsub = auth.onAuthStateChanged(user => {
    setIsAuthenticated(!!user);
    if (user) {
      checkSubscriptionStatus();
    } else {
      setSub({ subscribed: false });
      setChecking(false);
      fetchPublicCount(); // ✅ fetch count even when logged out
    }
  });
  return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [channelId]);

  useEffect(() => {
    if (channelId && isAuthenticated) checkSubscriptionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const handleSubscribe = async () => {
    if (!isAuthenticated) { showError("Please sign in to subscribe"); return; }
    const token = await getToken();
    if (!token) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    setLoading(true);
    const snapshot = { ...sub };
    try {
      const numId = await resolveNumericId();
      if (sub.subscribed) {
        const optimisticCount = Math.max(snapshot.subscriberCount - 1, 0);
        setSub({ subscribed: false, subscriberCount: optimisticCount });
        onSubscriptionChange?.(false, optimisticCount);
        const urls = [
          ...(numId ? [`${API_URL}/api/subscribe/${numId}`] : []),
          `${API_URL}/api/subscribe/${encodeURIComponent(String(channelId))}`,
        ];
        let succeeded = false;
        for (const url of urls) {
          if (signal.aborted) break;
          try {
            const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal });
            if (res.ok) {
              const data = await res.json();
              const count = typeof data.subscriber_count === "number" ? data.subscriber_count : optimisticCount;
              setSub({ subscriberCount: count });
              onSubscriptionChange?.(false, count);
              succeeded = true;
              break;
            }
            if (res.status !== 404 && res.status !== 405) break;
          } catch (err) { if ((err as Error).name === "AbortError") return; }
        }
        if (!succeeded && !signal.aborted) {
          setSub(snapshot);
          onSubscriptionChange?.(snapshot.subscribed, snapshot.subscriberCount);
          showError("Could not unsubscribe — please try again");
        }
      } else {
        const optimisticCount = snapshot.subscriberCount + 1;
        setSub({ subscribed: true, subscriberCount: optimisticCount });
        onSubscriptionChange?.(true, optimisticCount);
        const bodies = [...(numId ? [{ channelId: numId }] : []), { channelId: String(channelId) }];
        let succeeded = false;
        for (const body of bodies) {
          if (signal.aborted) break;
          try {
            const res = await fetch(`${API_URL}/api/subscribe`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal,
            });
            if (res.ok) {
              const data = await res.json();
              const count = typeof data.subscriber_count === "number" ? data.subscriber_count : optimisticCount;
              setSub({ subscriberCount: count });
              onSubscriptionChange?.(true, count);
              succeeded = true;
              break;
            }
            if (res.status !== 404 && res.status !== 405) break;
          } catch (err) { if ((err as Error).name === "AbortError") return; }
        }
        if (!succeeded && !signal.aborted) {
          setSub(snapshot);
          onSubscriptionChange?.(snapshot.subscribed, snapshot.subscriberCount);
          showError("Subscription failed");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") { setSub(snapshot); showError("Network error — please try again"); }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const handleToggleNotifications = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated || !sub.subscribed || notifLoading) return;
    const token = await getToken();
    if (!token) return;
    const next = !sub.notificationsEnabled;
    setNotifLoading(true);
    setSub({ notificationsEnabled: next });
    try {
      const numId = await resolveNumericId();
      const target = numId ?? encodeURIComponent(String(channelId));
      const res = await fetch(`${API_URL}/api/subscribe/${target}/notifications`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) { setShowNotifTooltip(true); setTimeout(() => setShowNotifTooltip(false), 2_000); }
      else { setSub({ notificationsEnabled: !next }); showError("Could not update notification preference"); }
    } catch { setSub({ notificationsEnabled: !next }); showError("Network error — please try again"); }
    finally { setNotifLoading(false); }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  if (checking) {
    return (
      <div className="flex items-center gap-2 animate-pulse" aria-busy="true" aria-label="Loading subscription status">
        <div className="h-10 w-36 bg-white/10 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-400 max-w-xs"
          >
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="flex-shrink-0 hover:text-red-200 transition-colors" aria-label="Dismiss error">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
        <motion.button
          onClick={handleSubscribe}
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.03 }}
          whileTap={{ scale: loading ? 1 : 0.97 }}
          aria-pressed={sub.subscribed}
          aria-label={sub.subscribed ? `Unsubscribe from ${channelName}` : `Subscribe to ${channelName}`}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-base transition-all duration-200 shadow-xl disabled:opacity-60 disabled:cursor-not-allowed ${sub.subscribed
            ? "bg-white/10 hover:bg-red-500/20 text-white border border-white/20 hover:border-red-500/50"
            : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-red-500/30"
            }`}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                <Loader2 size={16} className="animate-spin" /> Loading…
              </motion.span>
            ) : sub.subscribed ? (
              <motion.span key="subscribed" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                <Check size={16} className="text-green-400" />
                Subscribed
                {sub.subscriberCount > 0 && (
                  <motion.span key={sub.subscriberCount} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-white/50">
                    {formatCount(sub.subscriberCount)}
                  </motion.span>
                )}
              </motion.span>
            ) : (
              <motion.span key="subscribe" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                <UserPlus size={16} />
                Subscribe
                {sub.subscriberCount > 0 && (
                  <motion.span key={sub.subscriberCount} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-white/70">
                    {formatCount(sub.subscriberCount)}
                  </motion.span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <AnimatePresence>
          {sub.subscribed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.5, x: -10 }}
              className="relative"
            >
              <motion.button
                onClick={handleToggleNotifications}
                disabled={notifLoading}
                whileHover={{ scale: notifLoading ? 1 : 1.1 }}
                whileTap={{ scale: notifLoading ? 1 : 0.9 }}
                aria-pressed={sub.notificationsEnabled}
                aria-label={sub.notificationsEnabled ? `Mute notifications for ${channelName}` : `Enable notifications for ${channelName}`}
                className={`p-2.5 rounded-full transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed ${sub.notificationsEnabled
                  ? "bg-white/10 border-white/20 text-yellow-400 hover:bg-white/20"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-300"
                  }`}
              >
                {notifLoading ? <Loader2 size={18} className="animate-spin text-white/50" />
                  : sub.notificationsEnabled ? <Bell size={18} fill="currentColor" />
                    : <BellOff size={18} />}
              </motion.button>

              <AnimatePresence>
                {showNotifTooltip && (
                  <motion.div
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/90 text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none"
                  >
                    {sub.notificationsEnabled ? "🔔 Notifications on" : "🔕 Notifications off"}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}