/**
 * CreatorCard
 * -----------
 * Displays creator avatar + name + subscriber count + subscribe button.
 * Clicking avatar or name navigates to /channel/<email>.
 *
 * Props:
 *   email          – creator email (used for routing + profile lookup)
 *   compact        – true: horizontal pill layout (for watch page)
 *                    false/omit: vertical card layout
 *   showSubscribe  – show the subscribe / subscribed button (default true)
 *   className      – extra classes on the root wrapper
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCreatorProfile } from "../hooks/useCreatorProfile";
import { SubscriptionButton } from "./SubscriptionButton";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSubs(n: number, loaded: boolean): string {
  if (!loaded) return "Loading…";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M subscribers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K subscribers`;
  if (n === 1) return "1 subscriber";
  if (n > 0) return `${n} subscribers`;
  return "No subscribers yet";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  avatarUrl: string | null;
  displayName: string;
  gradient: string;
  size?: "sm" | "md" | "lg";
}

export function CreatorAvatar({ avatarUrl, displayName, gradient, size = "md" }: AvatarProps) {
  const sizeClass = {
    sm: "w-8 h-8 text-sm",
    md: "w-11 h-11 text-base",
    lg: "w-16 h-16 text-2xl",
  }[size];

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold flex-shrink-0 overflow-hidden ring-2 ring-transparent`}
      style={{
        aspectRatio: "1",
        containIntrinsicSize: "auto 11rem", // ✅ CLS Prevention: Reserve space
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="avatar-image"
          width={44}
          height={44}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="text-white select-none">
          {(displayName[0] ?? "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ─── CreatorCard ──────────────────────────────────────────────────────────────

interface CreatorCardProps {
  /** Creator's email — used for routing and profile fetch */
  email: string | null | undefined;
  /** Handle for /@handle URL (overrides email-based URL) */
  handle?: string | null;
  /** Channel display name (overrides fetched name) */
  channelName?: string | null;
  /** Avatar URL (overrides fetched avatar) */
  avatarUrl?: string | null;
  /** Channel numeric ID for accurate subscriber count */
  channelId?: number | string | null;
  /** Compact = horizontal row (watch page). Default = standalone card. */
  compact?: boolean;
  /** Show the subscribe button. Defaults to true. */
  showSubscribe?: boolean;
  className?: string;
}

export default function CreatorCard({
  email,
  handle,
  channelName: propChannelName,
  avatarUrl: propAvatarUrl,
  channelId,
  compact = true,
  showSubscribe = true,
  className = "",
}: CreatorCardProps) {
  const creator = useCreatorProfile(email);

  // Override with directly passed props (more reliable than fetch)
  const resolvedHandle    = handle || creator.handle || (email?.includes("@") ? email.split("@")[0] : email) || "creator";
  const resolvedName      = propChannelName?.trim() || creator.displayName || "Creator";
  const resolvedAvatarUrl = propAvatarUrl || creator.avatarUrl || null;
  // Use email as channelId — server resolves it to correct numeric ID
  // Do NOT use creator.channelId — it may be the logged-in user's channel
  const resolvedChannelId = channelId || email || "";
  const resolvedPath      = `/@${resolvedHandle.replace(/^@/, "")}`;

  // liveCount: synced from SubscriptionButton's rendered count.
  // SubscriptionButton shows "Subscribed 2" — we observe its DOM text after mount
  // to extract the number, since onSubscriptionChange only fires on user interaction.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const subBtnWrapperRef = useRef<HTMLDivElement>(null);

  // Read count from SubscriptionButton's rendered text via MutationObserver
  useEffect(() => {
    const wrapper = subBtnWrapperRef.current;
    if (!wrapper) return;

    const extractCount = () => {
      const text = wrapper.textContent ?? "";
      // SubscriptionButton renders text like "Subscribe", "Subscribed 2", etc.
      const match = text.match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n)) setLiveCount(n);
      }
    };

    // Run once after first paint (SubscriptionButton may be async)
    const t = setTimeout(extractCount, 800);

    // Also observe DOM changes (when SubscriptionButton updates its count)
    const observer = new MutationObserver(extractCount);
    observer.observe(wrapper, { childList: true, subtree: true, characterData: true });

    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [email]);

  const displayCount = liveCount !== null ? liveCount : creator.subscriberCount;
  const displayLoaded = liveCount !== null ? true : !creator.loading;

  // ── Compact (watch-page row) layout ──────────────────────────────────────
  if (compact) {
    return (
      <div
        className={`flex items-center justify-between gap-3 p-3 bg-[#181818] rounded-xl border border-white/5 ${className}`}
      >
        {/* Clickable avatar + name → channel */}
        <Link
          to={resolvedPath}
          className="flex items-center gap-2.5 min-w-0 group/creator"
          aria-label={`Visit ${resolvedName}'s channel`}
        >
          {/* Avatar with hover ring */}
          <motion.div
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={`w-9 h-9 rounded-full bg-gradient-to-br ${creator.avatarGradient} flex-shrink-0 overflow-hidden ring-2 ring-transparent group-hover/creator:ring-red-400 group-hover/creator:ring-offset-2 group-hover/creator:ring-offset-[#181818] transition-all`}
          >
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt={resolvedName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm">
                {(resolvedName[0] ?? "?").toUpperCase()}
              </div>
            )}
          </motion.div>

          {/* Name + sub count */}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white group-hover/creator:text-red-400 transition-colors leading-tight line-clamp-1 break-words">
              {resolvedName}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
              {fmtSubs(displayCount, displayLoaded)}
            </p>
          </div>
        </Link>

        {/* Subscribe button (separate — does NOT navigate). Zoomed down
            slightly — the full-size button was the biggest contributor
            to this row feeling bulky. */}
        {showSubscribe && (
          <div className="flex-shrink-0" style={{ zoom: 0.85 }} ref={subBtnWrapperRef}>
            <SubscriptionButton
              channelId={resolvedChannelId}
              channelName={resolvedName}
              initialSubscriberCount={creator.subscriberCount}
              onSubscriptionChange={(_subscribed, count) => {
                if (typeof count === "number") setLiveCount(count);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Standalone card layout ────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[#181818] rounded-2xl border border-white/5 p-5 flex flex-col items-center gap-3 text-center ${className}`}
    >
      <Link to={resolvedPath} className="group/creator flex flex-col items-center gap-3">
        <motion.div
          whileHover={{ scale: 1.06 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className={`w-20 h-20 rounded-full bg-gradient-to-br ${creator.avatarGradient} overflow-hidden ring-2 ring-transparent group-hover/creator:ring-red-400 group-hover/creator:ring-offset-2 group-hover/creator:ring-offset-[#181818] transition-all`}
        >
          {resolvedAvatarUrl ? (
            <img
              src={resolvedAvatarUrl}
              alt={resolvedName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white">
              {(resolvedName[0] ?? "?").toUpperCase()}
            </div>
          )}
        </motion.div>

        <div>
          <p className="font-bold text-white group-hover/creator:text-red-400 transition-colors">
            {resolvedName}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtSubs(displayCount, displayLoaded)}
          </p>
        </div>
      </Link>

      {showSubscribe && (
        <div ref={subBtnWrapperRef}>
        <SubscriptionButton
          channelId={resolvedChannelId}
          channelName={resolvedName}
          initialSubscriberCount={creator.subscriberCount}
          onSubscriptionChange={(_subscribed, count) => {
            if (typeof count === "number") setLiveCount(count);
          }}
        />
        </div>
      )}
    </motion.div>
  );
}