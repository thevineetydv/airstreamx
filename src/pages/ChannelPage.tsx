import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BellOff, Share2, Grid3X3, List, Play,
  Eye, ThumbsUp, Calendar, Video, Users,
  CheckCircle2, Copy, Check, Search, SortAsc, Globe, Instagram, Twitter,
  Edit2, Save, X, ExternalLink,
  MoreVertical, Flag, Radio, TrendingUp, Clock, BarChart3, ChevronRight,
  PlayCircle, Flame, Sparkles, UserX, Mail, Loader2
} from "lucide-react";
import { getAuth, updateProfile } from "firebase/auth";
import { useCreatorProfile, formatDisplayName, getAvatarGradient } from "../hooks/useCreatorProfile";
import { API_URL } from "../utils/constants";
import { useAuth } from "../context/AuthContext";
import { resolveChannelParam } from "../utils/channelUrl";
import ChannelCustomizationModal, {
  type ChannelCustomization as CustomizationData,
} from "../components/ChannelCustomizationModal";

// FIX #7: 180s = 3 minutes (was 60, comment said 3 min)
const MAX_SHORT_DURATION = 180;

function fmtViews(n: number = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function fmtSubs(n: number = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M subscribers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K subscribers`;
  if (n === 1) return "1 subscriber";
  return `${n} subscribers`;
}

function timeAgo(d: string): string {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  if (s < 2592000) return `${Math.floor(s / 604800)} weeks ago`;
  if (s < 31536000) return `${Math.floor(s / 2592000)} months ago`;
  return `${Math.floor(s / 31536000)} years ago`;
}

function fmtDuration(s: number): string {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * SUPPORTS_HOVER_PREVIEW / cloudinaryResize — same helpers used in
 * HomeFeed.tsx and Watch.tsx, kept consistent here. Gates the video
 * hover-preview behind real hover capability (touch devices can never
 * trigger it, so there's no reason to mount a <video> element for every
 * card on mobile), and serves width-appropriate thumbnails instead of
 * one resolution for every grid size.
 */
const SUPPORTS_HOVER_PREVIEW =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function cloudinaryResize(url: string | undefined, width: number): string {
  if (!url) return "";
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const before = url.slice(0, idx + marker.length);
  const after = url.slice(idx + marker.length);
  return `${before}w_${width},q_auto,f_auto,c_fill/${after}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Video {
  id: number;
  title: string;
  thumbnail: string;
  views: number;
  likes: number;
  duration: number;
  created_at: string;
  url: string;
  uploader_email: string;
  public_id?: string;
}

interface ChannelStats {
  email: string;
  displayName: string;
  handle: string;
  gradient: string;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  totalLikes: number;
  joinedDate: string;
  description: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

// Inline profile state — sourced from PostgreSQL via the channel API, never localStorage
interface ChannelProfile {
  displayName: string;
  bio: string;
  website: string;
  twitter: string;
  instagram: string;
  youtube: string;
}

function defaultProfile(email: string): ChannelProfile {
  const auth = getAuth();
  const firebaseName =
    auth.currentUser?.email === email ? auth.currentUser.displayName || "" : "";
  return {
    displayName: firebaseName || formatDisplayName(email),
    bio: "",
    website: "",
    twitter: "",
    instagram: "",
    youtube: "",
  };
}

type TabType = "home" | "videos" | "shorts" | "live" | "playlists" | "community" | "about";
type SortType = "newest" | "oldest" | "popular" | "liked";
type ViewMode = "grid" | "list";
type NotificationLevel = "all" | "personalized" | "none";

interface LiveStream {
  id: string | number;
  title: string;
  thumbnail?: string;
  viewers: number;
  started_at: string;
  status: "live" | "ended";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChannelPage() {
  const { email: rawParam, handle: handleParam } = useParams<{ email?: string; handle?: string }>();
  // handleParam may come as "@airstreamx" from /:handle route — strip the @
  const effectiveParam = rawParam || (handleParam?.startsWith("@") ? handleParam.slice(1) : handleParam) || "";
  const decodedParam = resolveChannelParam(effectiveParam);
  // decodedParam could be either a @handle or an email
  // We'll resolve it to an email for backend calls
  const navigate = useNavigate();

  const { user, token } = useAuth();

  // State to resolve @handle to full email
  const [decodedEmail, setDecodedEmail] = useState<string>("");

  // Resolve handle to email if needed
  useEffect(() => {
    if (!decodedParam) {
      setDecodedEmail("");
      return;
    }

    // If it already looks like an email, use it directly
    if (decodedParam.includes("@")) {
      setDecodedEmail(decodedParam);
      return;
    }

    // It's a handle — resolve to email via /api/channel/:handle
    const resolveHandle = async () => {
      try {
        const res = await fetch(`${API_URL}/api/channel/${encodeURIComponent(decodedParam)}`);
        if (res.ok) {
          const data = await res.json();
          const email = data?.email || data?.channel?.email || null;
          if (email) {
            setDecodedEmail(email);
            return;
          }
        }
      } catch (e) {
        console.warn("[ChannelPage] handle resolve failed:", e);
      }
      setDecodedEmail(decodedParam);
    };
    resolveHandle();
  }, [decodedParam]);

  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscription state comes exclusively from the API (PostgreSQL)
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortType>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Profile state — seeded from channel API response, never from localStorage
  // Initialize as empty; loadChannel() will populate from DB
  const [profile, setProfile] = useState<ChannelProfile>({
    displayName: "",
    bio: "",
    website: "",
    twitter: "",
    instagram: "",
    youtube: "",
  });
  const [editProfile, setEditProfile] = useState<ChannelProfile>({
    displayName: "",
    bio: "",
    website: "",
    twitter: "",
    instagram: "",
    youtube: "",
  });

  const channelIdRef = React.useRef<number | null>(null);
  const creatorProfile = useCreatorProfile(decodedEmail || null);

  // NOTE: subscriber count is fetched exclusively in loadChannel() via the
  // subscriptionRoutes endpoint. useCreatorProfile does NOT have a subscriberCount
  // field — do NOT try to read it here. Removed the broken sync useEffect.
  const bannerInputRef = React.useRef<HTMLInputElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>("all");
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const notifMenuRef = React.useRef<HTMLDivElement>(null);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);

  useEffect(() => {
    if (!decodedEmail) return;
    // IMPORTANT: Do NOT reset profile to defaults here!
    // loadChannel() will hydrate from the DB.
    // Only reset subscription status.
    setSubscribed(false);
    loadChannel();
    loadLiveStreams();
  }, [decodedEmail]); // Re-run if email/handle changes

  // Re-check owner status when user changes (e.g., logs in after page load)
  useEffect(() => {
    if (user?.email && decodedEmail) {
      setIsOwner(user.email === decodedEmail || user.email === decodedParam);
    } else {
      setIsOwner(false);
    }
  }, [user?.email, decodedEmail]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadLiveStreams = async () => {
    try {
      const res = await fetch(`${API_URL}/live?uploader=${encodeURIComponent(decodedEmail)}`);
      if (res.ok) {
        const data = await res.json();
        const streams = (data.streams || data.live_streams || []).filter(
          (s: any) => s.status === "live" || s.status === "active"
        );
        setLiveStreams(streams);
      }
    } catch { /* live streams are optional */ }
  };

  const buildStatsShell = (
    email: string,
    vids: Video[],
    subscriberCount: number,
    avatarUrl?: string,
    bannerUrl?: string,
    channelDisplayName?: string,
    channelBio?: string,
    // Pass the already-fetched DB record so we never read localStorage
    dbCustomization?: { channelName?: string; handle?: string; description?: string } | null,
  ): ChannelStats => {
    const totalViews = vids.reduce((a, v) => a + (v.views || 0), 0);
    const totalLikes = vids.reduce((a, v) => a + (v.likes || 0), 0);
    const joinedDate =
      vids.length > 0
        ? vids.reduce(
          (earliest, v) =>
            new Date(v.created_at) < new Date(earliest) ? v.created_at : earliest,
          vids[0].created_at
        )
        : new Date().toISOString();

    const auth = getAuth();
    const fbName =
      auth.currentUser?.email === email ? auth.currentUser.displayName || "" : "";

    // Priority: DB channel name → API display name → Firebase name → formatted email
    const resolvedName =
      dbCustomization?.channelName?.trim() ||
      channelDisplayName?.trim() ||
      fbName ||
      formatDisplayName(email);

    const resolvedHandle =
      dbCustomization?.handle?.trim() ||
      (email.includes("@") ? email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "") : email);

    return {
      email,
      displayName: resolvedName,
      handle: resolvedHandle,
      gradient: getAvatarGradient(email),
      subscriberCount,
      videoCount: vids.length,
      totalViews,
      totalLikes,
      joinedDate,
      description:
        dbCustomization?.description ||
        channelBio ||
        `Welcome to ${formatDisplayName(email)}'s channel on AirStreamX! Watch the latest videos, subscribe for updates, and join the community.`,
      avatarUrl,
      bannerUrl,
    };
  };

  const loadChannel = async () => {
    setLoading(true);
    // Declared here (outside try) so the catch block can still reach it —
    // it was previously declared inside try{} with `let`, which is
    // block-scoped and invisible to catch{}. That meant the fallback
    // error-handling path itself threw a ReferenceError instead of
    // gracefully degrading.
    let emailToUse = decodedEmail;
    try {
      // If decodedEmail is just a handle (no @ sign), try to resolve it
      // Strategy: attempt to construct possible emails (handle@domain) and see which one has videos
      let resolvedFromVideos = false;

      // If it looks like a handle (no @), try common domains
      if (!decodedEmail.includes("@")) {
        const possibleDomains = ["gmail.com", "yahoo.com", "outlook.com", "airstreamx.com"];

        for (const domain of possibleDomains) {
          const possibleEmail = `${decodedEmail}@${domain}`;
          const encodedEmail = encodeURIComponent(possibleEmail);

          try {
            const videoRes = await fetch(`${API_URL}/videos?uploader=${encodedEmail}&limit=1`);
            if (videoRes.ok) {
              const data = await videoRes.json();
              if (data.videos && data.videos.length > 0) {
                emailToUse = possibleEmail;
                resolvedFromVideos = true;
                break;
              }
            }
          } catch (e) {
            // Try next domain
            continue;
          }
        }

        // If we found a valid email, update state and rerun loadChannel
        if (resolvedFromVideos) {
          setDecodedEmail(emailToUse);
          setLoading(false);
          return;
        }
      }

      const encodedEmail = encodeURIComponent(emailToUse);
      let avatarUrl: string | undefined;
      let bannerUrl: string | undefined;
      let subscriberCount = 0;
      let channelDisplayName: string | undefined;
      let channelBio: string | undefined;
      let dbCustomization: { channelName?: string; handle?: string; description?: string } | null = null;

      // ── BUG FIX: use a local variable to hold fetched videos so
      //    buildStatsShell gets the real array, not the stale React state. ──
      let localVids: Video[] = [];

      // ── Run all independent fetches in parallel for speed ──────────────
      const [videoResult, custResult, channelResult] = await Promise.allSettled([
        // 1. Videos
        fetch(`${API_URL}/videos?uploader=${encodedEmail}&limit=50`)
          .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)),

        // 2. Channel customization
        fetch(`${API_URL}/api/channel-customization/${encodedEmail}`)
          .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)),

        // 3. Channel profile (subscriber count lives here)
        fetch(`${API_URL}/api/channel/${encodedEmail}`)
          .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)),
      ]);

      // ── Process videos ─────────────────────────────────────────────────
      if (videoResult.status === "fulfilled") {
        const allVids: Video[] = videoResult.value.videos || [];
        const matched = allVids.filter(v => v.uploader_email === emailToUse);
        localVids = matched.length > 0 ? matched : allVids;
        setVideos(localVids);
      } else {
        console.error("[loadChannel] Videos fetch error:", videoResult.reason);
        setVideos([]);
      }

      // ── Process customization ──────────────────────────────────────────
      if (custResult.status === "fulfilled") {
        const cust = custResult.value?.customization;
        if (cust) {
          dbCustomization = cust;
          channelDisplayName = cust.channelName?.trim() || undefined;
          channelBio = cust.description?.trim() || undefined;
          avatarUrl = cust.avatarDataUrl || cust.avatar_url || undefined;
          bannerUrl = cust.bannerDataUrl || cust.banner_url || undefined;

          const hydrated: ChannelProfile = {
            displayName: channelDisplayName || formatDisplayName(decodedEmail),
            bio: channelBio || "",
            website: cust.links?.[0]?.url || "",
            twitter: "",
            instagram: "",
            youtube: "",
          };
          setProfile(hydrated);
          setEditProfile(hydrated);
        } else {
          const p = defaultProfile(decodedEmail);
          setProfile(p);
          setEditProfile(p);
        }
      } else {
        console.warn("[loadChannel] Customization fetch error:", custResult.reason);
        const p = defaultProfile(decodedEmail);
        setProfile(p);
        setEditProfile(p);
      }

      // ── Process channel profile (subscriber count) ─────────────────────
      if (channelResult.status === "fulfilled") {
        const chData = channelResult.value;
        if (chData?.id) channelIdRef.current = Number(chData.id);
        // Extract subscriber count — handle every field name your backend may use
        const raw =
          chData.subscriber_count ??
          chData.subscriberCount ??
          chData.subscribers_count ??
          chData.subscribers ??
          chData.subs ??
          chData.count ??
          chData.channel?.subscriber_count ??
          chData.data?.subscriber_count ??
          null;
        if (typeof raw === "number" && raw >= 0) {
          subscriberCount = raw;
          console.debug(`[ChannelPage] subscriber_count from /api/channel: ${subscriberCount}`);
        } else {
          console.debug(`[ChannelPage] /api/channel returned no numeric count. raw=`, raw, "full response:", chData);
        }
        if (!avatarUrl) avatarUrl = chData.avatar_url ?? chData.avatarUrl ?? undefined;
        if (!bannerUrl) bannerUrl = chData.banner_url ?? chData.bannerUrl ?? undefined;
      } else {
        console.warn("[loadChannel] Channel profile fetch error:", channelResult.reason);
      }

      // ── Exhaustive subscriber-count fallback fan-out ───────────────────
      // Only fires if the primary /api/channel fetch returned 0.
      // Uses the SAME endpoint that SubscriptionButton uses on the Watch page
      // (/api/subscribe/count/:channelId) — this is the authoritative source.
if (subscriberCount === 0 && channelIdRef.current) {
  try {
    const countRes = await fetch(
      `${API_URL}/api/subscribe/status/${channelIdRef.current}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {}
    );
    if (countRes.ok) {
      const countData = await countRes.json();
      if (typeof countData.subscriber_count === "number") {
        subscriberCount = countData.subscriber_count;
      }
    }
  } catch { /* non-critical */ }
}

      // Owner check
      if (user?.email === decodedEmail) setIsOwner(true);

      const firebasePhotoURL = user?.photoURL ?? undefined;
      const resolvedAvatar = avatarUrl ?? firebasePhotoURL;

      // BUG FIX: pass `localVids` (the real array) — NOT `videos` (stale state)
      setStats(
        buildStatsShell(
          emailToUse,
          localVids,
          subscriberCount,
          resolvedAvatar,
          bannerUrl,
          channelDisplayName,
          channelBio,
          dbCustomization,
        )
      );

      // Check subscription status from API
      await checkSubscription();
      console.debug("[loadChannel] Complete!");
    } catch (err) {
      console.error("Failed to load channel:", err);
      setStats(buildStatsShell(emailToUse, [], 0));
    } finally {
      console.debug("[loadChannel] Setting loading to false");
      setLoading(false);
    }
  };

  // Subscription status comes from the API only — no localStorage reads or writes
  const checkSubscription = useCallback(async () => {
    if (!token || !user?.email) {
      setSubscribed(false);
      return;
    }

    try {
      const encodedEmail = encodeURIComponent(decodedEmail);
      const id = channelIdRef.current;
      const endpoint = id
        ? `${API_URL}/api/subscribe/status/${id}`
        : `${API_URL}/api/subscribe/status/${encodedEmail}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setSubscribed(d.subscribed ?? false);
      }
    } catch {
      setSubscribed(false);
    }
  }, [token, user?.email, decodedEmail]);

  // Re-check subscription when auth becomes ready (after refresh)
  useEffect(() => {
    if (token && user?.email && decodedEmail) {
      checkSubscription();
    }
  }, [token, user?.email, decodedEmail, checkSubscription]);

  const handleSubscribe = async () => {
    if (!user || !token) {
      navigate("/");
      return;
    }

    const wasSubscribed = subscribed;
    setSubscribed(!wasSubscribed); // optimistic
    setSubscribing(true);

    try {
      const id = channelIdRef.current;
      const endpoint = id
        ? `${API_URL}/api/subscribe`
        : `${API_URL}/api/subscribe/${encodeURIComponent(decodedEmail)}`;
      const body = id ? JSON.stringify({ channelId: id }) : undefined;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
      });
      if (res.ok) {
        const d = await res.json();
        const newSubscribed = d.subscribed ?? !wasSubscribed;
        setSubscribed(newSubscribed);

        // BUG 3 FIX: d.subscriberCount (camelCase) is undefined if backend
        // returns subscriber_count (snake_case). Instead of guessing the field name,
        // re-fetch the authoritative count from the subscriptionRoutes endpoint.
        const countId = channelIdRef.current;
if (countId) {
  try {
    const countRes = await fetch(
      `${API_URL}/api/subscribe/status/${countId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (countRes.ok) {
      const countData = await countRes.json();
      if (typeof countData.subscriber_count === "number") {
        setStats(prev => prev ? { ...prev, subscriberCount: countData.subscriber_count } : prev);
      }
    }
  } catch { /* ignore — optimistic UI is fine */ }
}

		else {
          // No channelId available — optimistically increment/decrement
          setStats(prev => {
            if (!prev) return prev;
            const delta = newSubscribed ? 1 : -1;
            return { ...prev, subscriberCount: Math.max(0, prev.subscriberCount + delta) };
          });
        }
      } else {
        setSubscribed(wasSubscribed); // revert on failure
      }
    } catch (err) {
      console.error("Subscribe error:", err);
      setSubscribed(wasSubscribed); // revert on error
    } finally {
      setSubscribing(false);
    }
  };

  // ── Profile editing ─────────────────────────────────────────────────────────
  const handleEditStart = () => {
    setEditProfile({ ...profile });
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    // Persist profile changes to the backend (PostgreSQL), not localStorage
    try {
      if (token) {
        await fetch(`${API_URL}/api/channels/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            displayName: editProfile.displayName,
            bio: editProfile.bio,
            website: editProfile.website,
            twitter: editProfile.twitter,
            instagram: editProfile.instagram,
            youtube: editProfile.youtube,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
    }

    setProfile(editProfile);

    // Also update Firebase displayName
    try {
      const auth = getAuth();
      if (auth.currentUser && editProfile.displayName.trim()) {
        await updateProfile(auth.currentUser, {
          displayName: editProfile.displayName.trim(),
        });
      }
    } catch { }

    setStats(prev =>
      prev
        ? { ...prev, displayName: editProfile.displayName || prev.displayName }
        : prev
    );
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditProfile({ ...profile });
    setIsEditing(false);
  };

  const handleCustomizationSaved = (saved: CustomizationData) => {
    // Reload the full channel data from the server so the UI reflects what's in DB
    // This is the safest approach — avoids stale-state issues entirely
    loadChannel();

    // Optimistically update displayName / bio in profile state for instant feedback
    setProfile(prev => ({
      ...prev,
      displayName: saved.channelName || prev.displayName,
      bio: saved.description || prev.bio,
    }));

    // Update Firebase displayName
    try {
      const auth = getAuth();
      if (auth.currentUser && saved.channelName.trim()) {
        updateProfile(auth.currentUser, {
          displayName: saved.channelName.trim(),
          // Only update photoURL if saved.avatarDataUrl is a real URL (Cloudinary), not base64
          ...(saved.avatarDataUrl && !saved.avatarDataUrl.startsWith("data:")
            ? { photoURL: saved.avatarDataUrl }
            : {}),
        }).catch(() => { });
      }
    } catch { }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Avatar upload: upload to backend, update Firebase photoURL ──
  const onSelectAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });

      // Optimistic UI update
      setStats(prev => (prev ? { ...prev, avatarUrl: dataUrl } : prev));

      // Upload to backend so it persists in PostgreSQL
      if (token) {
        try {
          const formData = new FormData();
          formData.append("avatar", file);
          await fetch(`${API_URL}/api/channels/avatar`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } catch (err) {
          console.error("Avatar backend upload failed:", err);
        }
      }

      // Also update Firebase photoURL
      try {
        const auth = getAuth();
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { photoURL: dataUrl });
        }
      } catch { }
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Banner upload: upload to backend ──
  const onSelectBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });

      // Optimistic UI update
      setStats(prev => (prev ? { ...prev, bannerUrl: dataUrl } : prev));

      // Upload to backend so it persists in PostgreSQL
      if (token) {
        try {
          const formData = new FormData();
          formData.append("banner", file);
          await fetch(`${API_URL}/api/channels/banner`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } catch (err) {
          console.error("Banner backend upload failed:", err);
        }
      }
    } catch (err) {
      console.error("Banner upload failed:", err);
    } finally {
      setBannerUploading(false);
    }
  };

  const displayedVideos = useMemo(() => {
    let list = [...videos];
    if (searchQuery.trim()) {
      list = list.filter(v =>
        v.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    switch (sortBy) {
      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "popular":
        list.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case "liked":
        list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return list;
  }, [videos, searchQuery, sortBy]);

  const featuredVideo = useMemo(
    () =>
      [...videos].sort((a, b) => (b.views || 0) - (a.views || 0))[0] ?? null,
    [videos]
  );

  const shorts = useMemo(
    () =>
      displayedVideos.filter(
        v => v.duration > 0 && v.duration <= MAX_SHORT_DURATION
      ),
    [displayedVideos]
  );

  const popularUploads = useMemo(
    () =>
      [...videos]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 12),
    [videos]
  );

  const handleReportChannel = () => {
    setShowMoreMenu(false);
    alert("Report submitted. Our team will review this channel.");
  };

  const handleBlockChannel = async () => {
    setShowMoreMenu(false);
    // Send block to backend so it persists server-side
    if (token) {
      try {
        await fetch(`${API_URL}/api/channels/block`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ blockedEmail: decodedEmail }),
        });
      } catch { }
    }
    navigate("/");
  };

  if (loading) return <ChannelSkeleton />;
  if (!stats) return <ChannelNotFound />;

  // Both come exclusively from the DB via loadChannel → stats
  const resolvedDisplayName = stats.displayName || formatDisplayName(decodedEmail);
  const resolvedHandle = stats.handle;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onSelectAvatar}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onSelectBanner}
      />

      {/* ── Banner ── */}
      <div
        className={`relative w-full h-36 md:h-52 bg-gradient-to-br ${stats.gradient}`}
      >
        {stats.bannerUrl && (
          <img
            src={stats.bannerUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {bannerUploading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent"
          style={{ pointerEvents: "none" }}
        />
      </div>

      {/* ── Channel Header ── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {/* Avatar */}
        <div className="flex items-end gap-5 -mt-16 mb-4 relative z-10">
          <div className="relative">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`w-28 h-28 md:w-36 md:h-36 rounded-full bg-gradient-to-br ${stats.gradient} shadow-2xl border-4 border-[#0a0a0a] overflow-hidden`}
            >
              {(stats.avatarUrl ?? creatorProfile.avatarUrl) ? (
                <img
                  src={(stats.avatarUrl ?? creatorProfile.avatarUrl)!}
                  alt={stats.displayName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl md:text-6xl font-black">
                  {stats.displayName[0]}
                </div>
              )}
            </motion.div>
            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Channel info */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {/* Display Name (editable) */}
              {isEditing ? (
                <div className="mb-2">
                  <input
                    value={editProfile.displayName}
                    onChange={e =>
                      setEditProfile(p => ({
                        ...p,
                        displayName: e.target.value,
                      }))
                    }
                    maxLength={50}
                    placeholder="Your channel name"
                    className="text-2xl md:text-3xl font-black bg-white/5 border border-red-500/50 rounded-xl px-3 py-1 text-white w-full max-w-sm focus:outline-none focus:border-red-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {editProfile.displayName.length}/50
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl md:text-3xl font-black truncate">
                    {resolvedDisplayName}
                  </h1>
                  {stats.videoCount > 10 && (
                    <span title="Verified creator" className="flex-shrink-0">
                      <CheckCircle2
                        size={22}
                        className="text-red-400"
                      />
                    </span>
                  )}
                </div>
              )}

              <p className="text-sm text-gray-400 mb-1">@{resolvedHandle}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400 mb-3">
                <span className="text-gray-300 font-medium">
                  {fmtSubs(stats.subscriberCount)}
                </span>
                <span>•</span>
                <span>{stats.videoCount} videos</span>
                <span>•</span>
                <span>{fmtViews(stats.totalViews)} total views</span>
              </div>

              {/* Bio (editable) */}
              {isEditing ? (
                <div className="mb-4">
                  <textarea
                    value={editProfile.bio}
                    onChange={e =>
                      setEditProfile(p => ({ ...p, bio: e.target.value }))
                    }
                    maxLength={300}
                    rows={3}
                    placeholder="Tell viewers about your channel…"
                    className="w-full max-w-lg bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
                  />
                  <p className="text-xs text-gray-600 mt-0.5">
                    {editProfile.bio.length}/300
                  </p>
                </div>
              ) : profile.bio ? (
                <p className="text-sm text-gray-400 mb-3 max-w-xl leading-relaxed">
                  {profile.bio}
                </p>
              ) : isOwner ? (
                <button
                  onClick={handleEditStart}
                  className="text-sm text-gray-600 hover:text-red-400 transition mb-3 flex items-center gap-1"
                >
                  <Edit2 size={13} /> Add bio
                </button>
              ) : null}

              {/* Social Links (editable) */}
              {isEditing ? (
                <div className="space-y-2 mb-4 max-w-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">
                    Social Links
                  </p>
                  {[
                    {
                      key: "website",
                      icon: "🌐",
                      placeholder: "https://yoursite.com",
                    },
                    {
                      key: "youtube",
                      icon: "▶️",
                      placeholder: "YouTube channel URL",
                    },
                    {
                      key: "twitter",
                      icon: "𝕏",
                      placeholder: "https://x.com/yourhandle",
                    },
                    {
                      key: "instagram",
                      icon: "📸",
                      placeholder: "https://instagram.com/yourhandle",
                    },
                  ].map(({ key, icon, placeholder }) => (
                    <div key={key} className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                      <span className="text-base w-6 text-center flex-shrink-0">
                        {icon}
                      </span>
                      <input
                        value={(editProfile as any)[key]}
                        onChange={e =>
                          setEditProfile(p => ({
                            ...p,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={placeholder}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  const links = [
                    {
                      url: profile.website,
                      icon: <Globe size={15} />,
                      label: profile.website
                        ?.replace(/^https?:\/\//, "")
                        .split("/")[0],
                    },
                    {
                      url: profile.youtube,
                      icon: <ExternalLink size={15} />,
                      label: "YouTube",
                    },
                    {
                      url: profile.twitter,
                      icon: <Twitter size={15} />,
                      label: "Twitter / X",
                    },
                    {
                      url: profile.instagram,
                      icon: <Instagram size={15} />,
                      label: "Instagram",
                    },
                  ].filter(l => l.url);
                  return links.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {links.map(({ url, icon, label }) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/30 rounded-full text-xs text-gray-300 hover:text-white transition-all"
                        >
                          {icon} {label}
                        </a>
                      ))}
                    </div>
                  ) : null;
                })()
              )}
            </motion.div>

            {/* ── Action Buttons ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center gap-2 mt-1"
            >
              {isEditing ? (
                <>
                  <button
                    onClick={handleEditSave}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition active:scale-95"
                  >
                    <Save size={15} /> Save changes
                  </button>
                  <button
                    onClick={handleEditCancel}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium transition border border-white/10"
                  >
                    <X size={15} /> Cancel
                  </button>
                </>
              ) : !isOwner ? (
                <>
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all active:scale-95 ${subscribed
                      ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                      : "bg-white text-black hover:bg-gray-200"
                      }`}
                  >
                    {subscribing ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : subscribed ? (
                      <>
                        <Users size={16} />
                        <span>Subscribed</span>
                      </>
                    ) : (
                      <span>Subscribe</span>
                    )}
                  </button>

                  {/* Notification Menu */}
                  {subscribed && (
                    <div className="relative" ref={notifMenuRef}>
                      <button
                        onClick={() => setShowNotifMenu(!showNotifMenu)}
                        className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition border border-white/20"
                        title="Notification settings"
                      >
                        {notificationLevel === "all" ? (
                          <Bell size={18} className="text-red-400" />
                        ) : notificationLevel === "personalized" ? (
                          <Bell size={18} className="text-gray-300" />
                        ) : (
                          <BellOff size={18} className="text-gray-400" />
                        )}
                      </button>
                      <AnimatePresence>
                        {showNotifMenu && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute right-0 top-12 w-56 bg-[#282828] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                          >
                            <div className="p-3 border-b border-white/10">
                              <p className="text-sm font-medium text-white">
                                Notifications
                              </p>
                              <p className="text-xs text-gray-400">
                                Choose what updates you get
                              </p>
                            </div>
                            {[
                              {
                                level: "all" as const,
                                icon: Bell,
                                label: "All",
                                desc: "Get all notifications",
                              },
                              {
                                level: "personalized" as const,
                                icon: Sparkles,
                                label: "Personalized",
                                desc: "Occasional updates",
                              },
                              {
                                level: "none" as const,
                                icon: BellOff,
                                label: "None",
                                desc: "No notifications",
                              },
                            ].map(opt => (
                              <button
                                key={opt.level}
                                onClick={() => {
                                  setNotificationLevel(opt.level);
                                  setShowNotifMenu(false);
                                }}
                                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition text-left ${notificationLevel === opt.level
                                  ? "bg-white/10"
                                  : ""
                                  }`}
                              >
                                <opt.icon
                                  size={18}
                                  className={
                                    notificationLevel === opt.level
                                      ? "text-red-400"
                                      : "text-gray-400"
                                  }
                                />
                                <div>
                                  <p
                                    className={`text-sm font-medium ${notificationLevel === opt.level
                                      ? "text-white"
                                      : "text-gray-300"
                                      }`}
                                  >
                                    {opt.label}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {opt.desc}
                                  </p>
                                </div>
                                {notificationLevel === opt.level && (
                                  <Check
                                    size={16}
                                    className="text-red-400 ml-auto mt-0.5"
                                  />
                                )}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium transition border border-white/10"
                  >
                    {copied ? (
                      <Check size={16} className="text-green-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                    <span>{copied ? "Copied!" : "Share"}</span>
                  </button>

                  {/* More Actions Menu */}
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition border border-white/10"
                      title="More actions"
                    >
                      <MoreVertical size={18} className="text-gray-400" />
                    </button>
                    <AnimatePresence>
                      {showMoreMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 top-12 w-48 bg-[#282828] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                        >
                          <button
                            onClick={handleReportChannel}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left"
                          >
                            <Flag size={16} className="text-gray-400" />
                            <span className="text-sm text-gray-300">
                              Report channel
                            </span>
                          </button>
                          <button
                            onClick={handleBlockChannel}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left"
                          >
                            <UserX size={16} className="text-gray-400" />
                            <span className="text-sm text-gray-300">
                              Block channel
                            </span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (isOwner) setShowCustomizationModal(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition border border-white/20 active:scale-95"
                  >
                    <Edit2 size={15} /> Customize channel
                  </button>

                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition"
                  >
                    <Video size={15} />
                    <span>Manage videos</span>
                  </Link>
                  <Link
                    to="/go-live"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition border border-white/20"
                  >
                    <Radio size={15} className="text-red-400" />
                    <span>Go Live</span>
                  </Link>
                  <button
                    onClick={() => setShowAnalytics(!showAnalytics)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition border ${showAnalytics
                      ? "bg-red-500/20 border-red-500/50 text-red-400"
                      : "bg-white/10 hover:bg-white/15 border-white/20 text-white"
                      }`}
                  >
                    <BarChart3 size={15} />
                    <span>Analytics</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition border border-white/10"
                    title="Copy channel link"
                  >
                    {copied ? (
                      <Check size={16} className="text-green-400" />
                    ) : (
                      <Share2 size={16} className="text-gray-300" />
                    )}
                  </button>
                </>
              )}
            </motion.div>
          </div>
        </div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
        >
          {[
            {
              label: "Subscribers",
              value: fmtViews(stats.subscriberCount),
              icon: Users,
              color: "text-red-400",
            },
            {
              label: "Total Views",
              value: fmtViews(stats.totalViews),
              icon: Eye,
              color: "text-red-400",
            },
            {
              label: "Videos",
              value: `${stats.videoCount}`,
              icon: Video,
              color: "text-red-400",
            },
            {
              label: "Total Likes",
              value: fmtViews(stats.totalLikes),
              icon: ThumbsUp,
              color: "text-red-500",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="bg-[#181818] rounded-xl p-4 border border-white/5"
            >
              <stat.icon size={18} className={`${stat.color} mb-2`} />
              <div className="text-xl font-bold">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Analytics Panel (Owner Only) ── */}
        <AnimatePresence>
          {showAnalytics && isOwner && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="bg-gradient-to-br from-[#181818] to-[#1a1a2e] rounded-2xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <BarChart3 size={20} className="text-red-400" />
                    Channel Analytics
                  </h3>
                  <Link
                    to="/dashboard"
                    className="text-sm text-red-400 hover:underline flex items-center gap-1"
                  >
                    View full dashboard <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-black/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                      <Eye size={12} /> Last 28 days
                    </div>
                    <div className="text-2xl font-bold">
                      {fmtViews(Math.floor(stats.totalViews * 0.15))}
                    </div>
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <TrendingUp size={12} /> +12.5%
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                      <Users size={12} /> New subscribers
                    </div>
                    <div className="text-2xl font-bold">
                      +{Math.floor(stats.subscriberCount * 0.05)}
                    </div>
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <TrendingUp size={12} /> +8.2%
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                      <Clock size={12} /> Watch time
                    </div>
                    <div className="text-2xl font-bold">
                      {Math.floor(stats.totalViews * 0.02)}h
                    </div>
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <TrendingUp size={12} /> +5.7%
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                      <ThumbsUp size={12} /> Engagement rate
                    </div>
                    <div className="text-2xl font-bold">
                      {stats.totalViews > 0
                        ? (
                          (stats.totalLikes / stats.totalViews) *
                          100
                        ).toFixed(1)
                        : 0}
                      %
                    </div>
                    <div className="text-xs text-gray-400">Likes / Views</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <Sparkles size={12} /> Tip: Upload consistently to grow your
                  audience
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-white/10 mb-6 overflow-x-auto">
          {(
            [
              "home",
              "videos",
              "shorts",
              "live",
              "playlists",
              "community",
              "about",
            ] as TabType[]
          ).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-3 text-sm font-semibold capitalize transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === tab
                ? "text-white"
                : "text-gray-400 hover:text-white"
                }`}
            >
              {tab === "live" && liveStreams.length > 0 && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
              {tab}
              {tab === "live" && liveStreams.length > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                  {liveStreams.length}
                </span>
              )}
              {activeTab === tab && (
                <motion.div
                  layoutId="channelTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          {/* HOME */}
          {activeTab === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-10 pb-12"
            >
              {featuredVideo && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Link
                      to={`/watch?v=${featuredVideo.public_id || featuredVideo.id}`}
                      className="group block"
                    >
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                        <img
                          src={featuredVideo.thumbnail}
                          alt={featuredVideo.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={e => {
                            (
                              e.currentTarget as HTMLImageElement
                            ).src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect fill='%23111' width='640' height='360'/%3E%3C/svg%3E`;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition backdrop-blur-sm">
                            <Play
                              size={28}
                              fill="white"
                              className="ml-1 text-white"
                            />
                          </div>
                        </div>
                        {featuredVideo.duration && (
                          <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-0.5 rounded text-xs font-mono">
                            {fmtDuration(featuredVideo.duration)}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="mt-3">
                      <h2 className="text-lg md:text-xl font-bold line-clamp-2">
                        {featuredVideo.title}
                      </h2>
                      <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                        <span>{stats.displayName}</span>
                        <span>•</span>
                        <span>{fmtViews(featuredVideo.views)} views</span>
                        <span>•</span>
                        <span>{timeAgo(featuredVideo.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {displayedVideos.slice(0, 5).map(v => (
                      <Link
                        key={v.id}
                        to={`/watch?v=${v.public_id || v.id}`}
                        className="flex gap-3 group"
                      >
                        <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-black flex-shrink-0">
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={e => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                          {v.duration && (
                            <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[11px] font-mono">
                              {fmtDuration(v.duration)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-red-400 transition">
                            {v.title}
                          </h3>
                          <div className="text-xs text-gray-400 mt-1">
                            {fmtViews(v.views)} views • {timeAgo(v.created_at)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
                    <PlayCircle size={18} className="text-red-400" />
                    Videos
                  </h3>
                  <button
                    onClick={() => setActiveTab("videos")}
                    className="text-sm text-red-400 hover:underline flex items-center gap-1"
                  >
                    See all <ChevronRight size={14} />
                  </button>
                </div>
                {displayedVideos.length === 0 ? (
                  <EmptyVideos searchQuery={searchQuery} isOwner={isOwner} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {displayedVideos
                      .slice(0, 8)
                      .map((v, i) => (
                        <VideoGridCard
                          key={v.id}
                          video={v}
                          index={i}
                          channelName={stats.displayName}
                        />
                      ))}
                  </div>
                )}
              </div>

              {popularUploads.length > 4 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
                      <Flame size={18} className="text-orange-400" />
                      Popular uploads
                    </h3>
                    <button
                      onClick={() => {
                        setActiveTab("videos");
                        setSortBy("popular");
                      }}
                      className="text-sm text-red-400 hover:underline flex items-center gap-1"
                    >
                      See all <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {popularUploads.slice(0, 8).map((v, i) => (
                      <Link
                        key={v.id}
                        to={`/watch?v=${v.public_id || v.id}`}
                        className="w-64 flex-shrink-0 group"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-2">
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute top-2 left-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                            <Flame size={10} /> #{i + 1}
                          </div>
                          {v.duration && (
                            <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs font-mono">
                              {fmtDuration(v.duration)}
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-medium text-white line-clamp-2 group-hover:text-red-400 transition">
                          {v.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtViews(v.views)} views
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {shorts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-200">
                      Shorts
                    </h3>
                    <button
                      onClick={() => setActiveTab("shorts")}
                      className="text-sm text-red-400 hover:underline"
                    >
                      See all
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {shorts.slice(0, 12).map(v => (
                      <div
                        key={v.id}
                        className="w-36 flex-shrink-0 cursor-pointer group"
                        onClick={() => navigate(`/shorts/${v.id}`)}
                      >
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[#0a0000]">
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded font-mono">
                            {fmtDuration(v.duration)}
                          </div>
                        </div>
                        <p className="text-xs text-gray-200 font-medium line-clamp-2 mt-1">
                          {v.title}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {fmtViews(v.views)} views
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* VIDEOS */}
          {activeTab === "videos" && (
            <motion.div
              key="videos"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
                <div className="relative flex-1 max-w-xs">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search channel"
                    className="w-full pl-9 pr-4 py-2 bg-[#181818] border border-white/10 rounded-full text-sm focus:outline-none focus:border-red-500/50 text-white placeholder-gray-500"
                  />
                </div>
                <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                  <div className="flex items-center gap-1 bg-[#181818] border border-white/10 rounded-full px-3 py-2">
                    <SortAsc size={15} className="text-gray-400" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortType)}
                      className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="popular">Most Viewed</option>
                      <option value="liked">Most Liked</option>
                    </select>
                  </div>
                  <div className="flex gap-1 bg-[#181818] border border-white/10 rounded-full p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-full transition ${viewMode === "grid"
                        ? "bg-white/20 text-white"
                        : "text-gray-400 hover:text-white"
                        }`}
                    >
                      <Grid3X3 size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-full transition ${viewMode === "list"
                        ? "bg-white/20 text-white"
                        : "text-gray-400 hover:text-white"
                        }`}
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>
              </div>
              {displayedVideos.length === 0 ? (
                <EmptyVideos searchQuery={searchQuery} isOwner={isOwner} />
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-12">
                  {displayedVideos.map((v, i) => (
                    <VideoGridCard
                      key={v.id}
                      video={v}
                      index={i}
                      channelName={stats.displayName}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pb-12">
                  {displayedVideos.map((v, i) => (
                    <VideoListCard
                      key={v.id}
                      video={v}
                      index={i}
                      channelName={stats.displayName}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* SHORTS */}
          {activeTab === "shorts" && (
            <motion.div
              key="shorts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {shorts.length === 0 ? (
                <div className="text-center py-24">
                  <div className="text-6xl mb-4">📱</div>
                  <h3 className="text-lg font-semibold text-gray-400 mb-2">
                    No Shorts yet
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {isOwner
                      ? "Upload videos under 3 minutes to create Shorts!"
                      : "This channel hasn't posted any Shorts yet."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-12">
                  {shorts.map((v, i) => (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="cursor-pointer group"
                      onClick={() => navigate(`/shorts/${v.id}`)}
                    >
                      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[#0a0000] mb-2">
                        <img
                          src={v.thumbnail}
                          alt={v.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                            <Play
                              size={20}
                              fill="white"
                              className="ml-0.5 text-white"
                            />
                          </div>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                          {fmtDuration(v.duration)}
                        </div>
                        <div className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                          SHORT
                        </div>
                        <p className="absolute bottom-2 left-2 text-white text-xs font-medium">
                          {fmtViews(v.views)}
                        </p>
                      </div>
                      <p className="text-white text-xs font-medium line-clamp-2 leading-snug group-hover:text-red-500 transition-colors">
                        {v.title}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* LIVE */}
          {activeTab === "live" && (
            <motion.div
              key="live"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {liveStreams.length === 0 ? (
                <div className="text-center py-24">
                  <div className="text-6xl mb-4">📡</div>
                  <h3 className="text-lg font-semibold text-gray-400 mb-2">
                    No live streams
                  </h3>
                  <p className="text-gray-600 text-sm mb-6">
                    {isOwner
                      ? "Start streaming to connect with your audience in real-time!"
                      : "This channel isn't streaming right now. Check back later!"}
                  </p>
                  {isOwner && (
                    <Link
                      to="/go-live"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition"
                    >
                      <Radio size={18} />
                      Go Live Now
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
                  {liveStreams.map((stream, i) => (
                    <motion.div
                      key={stream.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Link
                        to={`/live/watch/${stream.id}`}
                        className="group block"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-3">
                          {stream.thumbnail ? (
                            <img
                              src={stream.thumbnail}
                              alt={stream.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={`w-full h-full bg-gradient-to-br ${stats.gradient} flex items-center justify-center`}
                            >
                              <Radio size={48} className="text-white/50" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute top-3 left-3 flex items-center gap-2">
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded animate-pulse">
                              <span className="w-2 h-2 bg-white rounded-full" />
                              LIVE
                            </span>
                          </div>
                          <div className="absolute bottom-3 left-3 flex items-center gap-2 text-white text-sm">
                            <Eye size={14} />
                            <span className="font-medium">
                              {stream.viewers || 0} watching
                            </span>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition backdrop-blur-sm">
                              <Play
                                size={24}
                                fill="white"
                                className="ml-1 text-white"
                              />
                            </div>
                          </div>
                        </div>
                        <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-red-400 transition-colors mb-1">
                          {stream.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{stats.displayName}</span>
                          <span>•</span>
                          <span>Started {timeAgo(stream.started_at)}</span>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* PLAYLISTS */}
          {activeTab === "playlists" && (
            <motion.div
              key="playlists"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center text-gray-400"
            >
              <div className="text-6xl mb-3">🎞️</div>
              <p>No playlists yet</p>
            </motion.div>
          )}

          {/* COMMUNITY */}
          {activeTab === "community" && (
            <motion.div
              key="community"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center text-gray-400"
            >
              <div className="text-6xl mb-3">💬</div>
              <p>Community posts are not available yet</p>
            </motion.div>
          )}

          {/* ABOUT */}
          {activeTab === "about" && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl pb-12"
            >
              <div className="space-y-6">
                <div className="bg-[#181818] rounded-2xl p-6 border border-white/5">
                  <h3 className="font-semibold mb-3 text-gray-300">
                    Description
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {profile.bio || stats.description}
                  </p>
                </div>
                <div className="bg-[#181818] rounded-2xl p-6 border border-white/5">
                  <h3 className="font-semibold mb-4 text-gray-300">
                    Channel Stats
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        icon: Calendar,
                        label: "Joined",
                        value: `Joined ${timeAgo(stats.joinedDate)}`,
                      },
                      {
                        icon: Eye,
                        label: "Total views",
                        value: `${stats.totalViews.toLocaleString()} views`,
                      },
                      {
                        icon: Video,
                        label: "Videos",
                        value: `${stats.videoCount} videos uploaded`,
                      },
                      {
                        icon: Users,
                        label: "Subscribers",
                        value: fmtSubs(stats.subscriberCount),
                      },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 text-sm"
                      >
                        <item.icon
                          size={16}
                          className="text-gray-400 flex-shrink-0"
                        />
                        <span className="text-gray-400">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#181818] rounded-2xl p-6 border border-white/5">
                  <h3 className="font-semibold mb-3 text-gray-300">Contact</h3>
                  {profile.website ? (
                    <a
                      href={`mailto:${profile.website}`}
                      className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-red-400 transition"
                    >
                      <Mail size={16} className="text-gray-400" />
                      {profile.website}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400">
                      No public contact email added yet.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isOwner && (
        <ChannelCustomizationModal
          email={decodedEmail}
          token={token}
          isOpen={showCustomizationModal}
          onClose={() => setShowCustomizationModal(false)}
          onSaved={handleCustomizationSaved}
        />
      )}
    </div>
  );
}

// ─── Video Grid Card ──────────────────────────────────────────────────────────

function VideoGridCard({
  video,
  index,
  channelName,
}: {
  video: Video;
  index: number;
  channelName?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleMouseEnter = () => {
    if (!SUPPORTS_HOVER_PREVIEW) return;
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (!SUPPORTS_HOVER_PREVIEW) return;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovering(false);
    setPreviewReady(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  React.useEffect(() => {
    if (isHovering && videoRef.current && video.url) {
      videoRef.current
        .play()
        .then(() => setPreviewReady(true))
        .catch(() => { });
    }
  }, [isHovering, video.url]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link to={`/watch?v=${video.public_id || video.id}`} className="group block">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-3">
          <img
            src={cloudinaryResize(video.thumbnail, 400)}
            srcSet={`${cloudinaryResize(video.thumbnail, 280)} 280w, ${cloudinaryResize(video.thumbnail, 400)} 400w`}
            sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 360px"
            alt={video.title}
            className={`w-full h-full object-cover transition-all duration-300 ${previewReady ? "opacity-0 scale-105" : "opacity-100 group-hover:scale-105"
              }`}
            loading="lazy"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
          {video.url && SUPPORTS_HOVER_PREVIEW && (
            <video
              ref={videoRef}
              src={video.url}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${previewReady ? "opacity-100" : "opacity-0"
                }`}
              muted
              loop
              playsInline
              preload="none"
            />
          )}
          <div
            className={`absolute inset-0 transition flex items-center justify-center ${previewReady ? "bg-transparent" : "bg-black/0 group-hover:bg-black/20"
              }`}
          >
            {!previewReady && (
              <div className="w-12 h-12 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition scale-75 group-hover:scale-100">
                <Play size={20} fill="white" className="ml-0.5 text-white" />
              </div>
            )}
          </div>
          {previewReady && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium backdrop-blur-sm">
              PREVIEW
            </div>
          )}
          {video.duration && (
            <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs font-mono">
              {fmtDuration(video.duration)}
            </div>
          )}
          {isHovering && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <motion.div
                className="h-full bg-red-500"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 5, ease: "linear" }}
              />
            </div>
          )}
        </div>
        <div>
          <h3
            className="text-sm font-semibold text-white line-clamp-2 group-hover:text-red-400 transition-colors mb-1 leading-snug"
            title={video.title}
          >
            {video.title}
          </h3>
          {channelName && (
            <div className="text-xs text-gray-400 mb-1">{channelName}</div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{fmtViews(video.views)} views</span>
            <span>•</span>
            <span>{timeAgo(video.created_at)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Video List Card ──────────────────────────────────────────────────────────

function VideoListCard({
  video,
  index,
  channelName,
}: {
  video: Video;
  index: number;
  channelName?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Link
        to={`/watch?v=${video.public_id || video.id}`}
        className="group flex gap-4 p-3 rounded-xl hover:bg-white/5 transition"
      >
        <div className="relative w-44 aspect-video rounded-lg overflow-hidden bg-black flex-shrink-0">
          <img
            src={cloudinaryResize(video.thumbnail, 360)}
            srcSet={`${cloudinaryResize(video.thumbnail, 200)} 200w, ${cloudinaryResize(video.thumbnail, 360)} 360w`}
            sizes="176px"
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
          {video.duration && (
            <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-xs font-mono">
              {fmtDuration(video.duration)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold text-white group-hover:text-red-400 transition-colors line-clamp-2 mb-2 leading-snug"
            title={video.title}
          >
            {video.title}
          </h3>
          {channelName && (
            <div className="text-xs text-gray-400 mb-1">{channelName}</div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Eye size={13} />
            <span>{fmtViews(video.views)} views</span>
            <span>•</span>
            <ThumbsUp size={13} />
            <span>{fmtViews(video.likes)}</span>
            <span>•</span>
            <span>{timeAgo(video.created_at)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyVideos({
  searchQuery,
  isOwner,
}: {
  searchQuery: string;
  isOwner: boolean;
}) {
  return (
    <div className="text-center py-24">
      <Video size={48} className="mx-auto mb-4 text-gray-700" />
      <h3 className="text-lg font-semibold text-gray-400 mb-2">
        {searchQuery
          ? `No videos found for "${searchQuery}"`
          : "No videos yet"}
      </h3>
      <p className="text-gray-600 text-sm">
        {isOwner
          ? "Upload your first video to get started!"
          : "This channel hasn't uploaded any videos yet."}
      </p>
      {isOwner && (
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-medium transition"
        >
          <Video size={16} />
          Upload Video
        </Link>
      )}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function ChannelSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] animate-pulse">
      <div className="h-52 bg-[#110000]" />
      <div className="max-w-7xl mx-auto px-6 -mt-12">
        <div className="flex items-end gap-4 mb-6">
          <div className="w-32 h-32 rounded-full bg-[#1a0000] border-4 border-[#0a0a0a]" />
          <div className="pb-2 flex-1">
            <div className="h-7 bg-[#1a0000] rounded w-48 mb-2" />
            <div className="h-4 bg-[#110000] rounded w-64 mb-4" />
            <div className="flex gap-2">
              <div className="h-9 bg-[#1a0000] rounded-full w-28" />
              <div className="h-9 bg-[#110000] rounded-full w-20" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-[#110000] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <div key={i}>
                <div className="aspect-video bg-[#110000] rounded-xl mb-3" />
                <div className="h-3 bg-[#1a0000] rounded w-3/4 mb-2" />
                <div className="h-3 bg-[#110000] rounded w-1/2" />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Not Found ────────────────────────────────────────────────────────────────

function ChannelNotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl mb-4">😵</div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Channel not found
        </h2>
        <p className="text-gray-400 mb-6">
          This channel doesn't exist or has no videos.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}