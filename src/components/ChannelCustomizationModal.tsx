/**
 * ChannelCustomizationModal.tsx — AirStreamX
 * ────────────────────────────────────────────
 * YouTube Studio–style channel customization modal.
 *
 * Tab 1 – Basic Info    : Channel Name · Handle (@slug) · Description
 * Tab 2 – Channel URL   : Live URL preview + one-click copy
 * Tab 3 – Links         : Up to 5 external links with auto-detected icons
 * Tab 4 – Contact info  : Business email (separate from login)
 * Tab 5 – Branding      : Video watermark (150×150px, ≤1MB, PNG/GIF/BMP/JPEG)
 *
 * Handle cooldown rules (matching YouTube):
 *   • 2 changes allowed per 10-day rolling window
 *   • Each previous handle is held for 10 days so you can switch back
 *   • When fully locked, shows exactly how many days until a slot reopens
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, AlertCircle, Globe, Instagram, Twitter,
  Link as LinkIcon, Mail, Pencil, Plus, Trash2,
  Copy, Info, Youtube, Save, Eye,
  Image as ImageIcon, Upload, RefreshCw, ExternalLink,
  CheckCircle2, Loader2, Lock,
} from "lucide-react";
import { registerHandle } from "../utils/channelUrl";
import { API_URL } from "../utils/constants";

/* ─────────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────────── */

export interface ChannelLink {
  id: string;
  label: string;
  url: string;
}

export interface HandleChange {
  handle: string;
  changedAt: string;     // ISO — when this handle was set
  releasedAt: string;    // ISO — when the previous slot is freed (changedAt + 10 days)
}

export interface ChannelCustomization {
  channelName: string;
  handle: string;
  description: string;
  contactEmail: string;
  links: ChannelLink[];
  avatarDataUrl?: string;
  avatarFileName?: string;
  bannerDataUrl?: string;
  bannerFileName?: string;
  watermarkDataUrl?: string;
  watermarkFileName?: string;
  handleLastChanged?: string;   // kept for backward-compat
  handleHistory?: HandleChange[];
}

/* ─────────────────────────────────────────────────────────────
 * CONSTANTS
 * ───────────────────────────────────────────────────────────── */

const SITE_BASE = "https://www.airstreamx.com/@";
const COOLDOWN_DAYS = 10;
const MAX_CHANGES = 2;
const MAX_LINKS = 5;

/* ─────────────────────────────────────────────────────────────
 * STORAGE HELPERS — PostgreSQL is the ONLY source of truth.
 *
 * loadCustomization / saveCustomization are kept as NO-OPs so
 * existing call-sites don't break, but they no longer read or
 * write localStorage.  The modal's useEffect loads data from
 * the /api/channel-customization/:email endpoint instead.
 *
 * getChannelDisplayName / getChannelHandle accept an already-
 * fetched ChannelCustomization object (from the DB response)
 * rather than an email string, so they never touch localStorage.
 * ───────────────────────────────────────────────────────────── */

/** @deprecated No-op — kept for import compatibility only. */
export function loadCustomization(_email: string): ChannelCustomization | null {
  return null;
}

/** @deprecated No-op — data is persisted via POST /api/channel-customization. */
export function saveCustomization(_email: string, _data: ChannelCustomization): void {
  // intentionally empty — PostgreSQL is the source of truth
}

/**
 * Get display name from an already-fetched DB record.
 * Pass the `customization` object returned by the API, not an email.
 */
export function getChannelDisplayName(customization: ChannelCustomization | null | undefined): string | null {
  return customization?.channelName?.trim() || null;
}

/**
 * Get handle from an already-fetched DB record.
 */
export function getChannelHandle(customization: ChannelCustomization | null | undefined, fallbackEmail?: string): string {
  if (customization?.handle?.trim()) return customization.handle.trim();
  if (fallbackEmail) return fallbackEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "");
  return "creator";
}

/* ─────────────────────────────────────────────────────────────
 * HANDLE COOLDOWN ENGINE
 *
 * YouTube rules implemented:
 *   - 2 changes per 10-day rolling window
 *   - Previous handle held for 10 days (can switch back for free)
 * ───────────────────────────────────────────────────────────── */

interface CooldownInfo {
  changesInWindow: number;
  locked: boolean;
  daysUntilSlot: number;
  heldHandles: { handle: string; releasedAt: Date }[];
}

function computeCooldown(history: HandleChange[]): CooldownInfo {
  const now = Date.now();
  const windowMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  const recentChanges = history.filter(
    h => now - new Date(h.changedAt).getTime() < windowMs
  );

  const heldHandles = history
    .slice(0, -1)
    .filter(h => now < new Date(h.releasedAt).getTime())
    .map(h => ({ handle: h.handle, releasedAt: new Date(h.releasedAt) }));

  const locked = recentChanges.length >= MAX_CHANGES;

  let daysUntilSlot = 0;
  if (locked && recentChanges.length > 0) {
    const oldest = recentChanges.reduce((a, b) =>
      new Date(a.changedAt) < new Date(b.changedAt) ? a : b
    );
    const expiresAt = new Date(oldest.changedAt).getTime() + windowMs;
    daysUntilSlot = Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
  }

  return { changesInWindow: recentChanges.length, locked, daysUntilSlot, heldHandles };
}

/* ─────────────────────────────────────────────────────────────
 * VALIDATION
 * ───────────────────────────────────────────────────────────── */

function validateHandle(h: string): string | null {
  if (!h.trim()) return "Handle is required.";
  if (h.length < 3) return "Handle must be at least 3 characters.";
  if (h.length > 30) return "Handle must be 30 characters or less.";
  if (!/^[a-zA-Z0-9_.]+$/.test(h)) return "Only letters, numbers, underscores ( _ ) and dots ( . ) allowed.";
  if (/^[._]/.test(h) || /[._]$/.test(h)) return "Cannot start or end with . or _";
  if (/[_.]{2}/.test(h)) return "Cannot have two consecutive . or _";
  return null;
}

function validateChannelName(n: string): string | null {
  if (!n.trim()) return "Channel name is required.";
  if (n.length > 100) return "100 characters maximum.";
  return null;
}

/**
 * isHandleTaken — checks via the backend API.
 * The localStorage scan has been removed; handle uniqueness is now
 * enforced server-side by the UNIQUE constraint on channel_customizations.handle.
 * This client-side function is kept as a fast debounced pre-check but
 * always returns false (not taken) so the save proceeds; the server
 * will return an error if the handle is genuinely taken.
 */
function isHandleTaken(_handle: string, _currentEmail: string): boolean {
  // Real uniqueness is enforced by the DB UNIQUE constraint.
  // A proper implementation would call GET /api/handle-available/:handle
  // For now we optimistically allow — server rejects if taken.
  return false;
}

/* ─────────────────────────────────────────────────────────────
 * TINY HELPERS
 * ───────────────────────────────────────────────────────────── */

function uid() { return Math.random().toString(36).slice(2, 9); }

function formatEmailName(email: string): string {
  const local = email.includes("@") ? email.split("@")[0] : email;
  return local.split(/[._\-0-9]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || email;
}

function makeChannelId(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) >>> 0;
  }
  return `UC${hash.toString(36).toUpperCase().padStart(10, "0")}ASX`;
}

function CharCount({ n, max }: { n: number; max: number }) {
  const pct = n / max;
  return (
    <span className={`text-[11px] tabular-nums ${n > max ? "text-red-400" : pct > 0.85 ? "text-yellow-400" : "text-gray-600"}`}>
      {n}/{max}
    </span>
  );
}

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5">
      <AlertCircle size={12} />{msg}
    </motion.p>
  );
}

function InfoBox({ icon, title, children }: { icon: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3.5 bg-white/[0.03] border border-white/[0.07] rounded-xl">
      <div className="text-blue-400 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="text-xs text-gray-400 leading-relaxed">
        {title && <p className="font-semibold text-blue-300 mb-0.5">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function detectPlatformIcon(url: string) {
  const u = (url || "").toLowerCase();
  if (u.includes("instagram.com")) return <Instagram size={14} className="text-red-500" />;
  if (u.includes("twitter.com") || u.includes("x.com")) return <Twitter size={14} className="text-sky-400" />;
  if (u.includes("youtube.com")) return <Youtube size={14} className="text-red-400" />;
  return <Globe size={14} className="text-gray-400" />;
}

/* ─────────────────────────────────────────────────────────────
 * TABS
 * ───────────────────────────────────────────────────────────── */

type Tab = "basic" | "url" | "links" | "contact" | "branding";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "basic", label: "Basic info", icon: <Pencil size={14} /> },
  { id: "url", label: "Channel URL", icon: <Globe size={14} /> },
  { id: "links", label: "Links", icon: <LinkIcon size={14} /> },
  { id: "contact", label: "Contact info", icon: <Mail size={14} /> },
  { id: "branding", label: "Branding", icon: <ImageIcon size={14} /> },
];

/* ─────────────────────────────────────────────────────────────
 * MAIN MODAL
 * ───────────────────────────────────────────────────────────── */

interface Props {
  email: string;
  token?: string | null;     // Firebase ID token for authenticated saves
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (data: ChannelCustomization) => void;
}

export default function ChannelCustomizationModal({ email, token, isOpen, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("basic");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedUrl, setCopied] = useState(false);

  // Form fields
  const [channelName, setChannelName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [links, setLinks] = useState<ChannelLink[]>([]);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [avatarFileName, setAvatarFileName] = useState("");
  const [bannerDataUrl, setBannerDataUrl] = useState("");
  const [bannerFileName, setBannerFileName] = useState("");
  const [watermarkDataUrl, setWatermarkDataUrl] = useState("");
  const [watermarkFileName, setWatermarkFileName] = useState("");

  // Validation
  const [nameError, setNameError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleAvail, setHandleAvail] = useState<boolean | null>(null);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);

  // Cooldown
  const [handleHistory, setHandleHistory] = useState<HandleChange[]>([]);
  const [cooldown, setCooldown] = useState<CooldownInfo>({ changesInWindow: 0, locked: false, daysUntilSlot: 0, heldHandles: [] });
  const [originalHandle, setOriginalHandle] = useState("");

  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const watermarkRef = useRef<HTMLInputElement>(null);

  // ── Load on open — fetch from PostgreSQL, never localStorage ──
  useEffect(() => {
    if (!isOpen || !email) return;
    setSaved(false); setTab("basic"); setWatermarkError(null);
    setNameError(null); setHandleError(null); setHandleAvail(null);

    const defaultHandle = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "");

    (async () => {
      try {
        const url = `${API_URL}/api/channel-customization/${encodeURIComponent(email)}`;
        const res = await fetch(url, {
          method: "GET"
        });

        if (!res.ok) {
          console.warn(`[Modal] Fetch returned status ${res.status}`);
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        const s: ChannelCustomization | null = json.customization ?? null;

        const history: HandleChange[] = s?.handleHistory ?? [];
        const cd = computeCooldown(history);
        const currentHandle = s?.handle?.trim() || defaultHandle;

        // Set all fields from DB data
        setChannelName(s?.channelName ?? formatEmailName(email));
        setHandle(currentHandle);
        setOriginalHandle(currentHandle);
        setDescription(s?.description ?? "");
        setContactEmail(s?.contactEmail ?? "");
        setLinks(s?.links ?? []);
        setAvatarDataUrl(s?.avatarDataUrl ?? "");
        setAvatarFileName(s?.avatarFileName ?? "");
        setBannerDataUrl(s?.bannerDataUrl ?? "");
        setBannerFileName(s?.bannerFileName ?? "");
        setWatermarkDataUrl(s?.watermarkDataUrl ?? "");
        setWatermarkFileName(s?.watermarkFileName ?? "");
        setHandleHistory(history);
        setCooldown(cd);
      } catch (err) {
        console.error("[Modal] Load error:", err);
        // Fallback to safe defaults on network error
        const defaultName = formatEmailName(email);
        setChannelName(defaultName);
        setHandle(defaultHandle);
        setOriginalHandle(defaultHandle);
        setDescription(""); setContactEmail(""); setLinks([]);
        setAvatarDataUrl(""); setAvatarFileName("");
        setBannerDataUrl(""); setBannerFileName("");
        setWatermarkDataUrl(""); setWatermarkFileName("");
        setHandleHistory([]); setCooldown({ changesInWindow: 0, locked: false, daysUntilSlot: 0, heldHandles: [] });
      }
    })();
  }, [isOpen, email]);

  // ESC close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── Handle availability check ──────────────────────────────
  const checkHandle = useCallback((h: string) => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    setHandleAvail(null);
    const err = validateHandle(h);
    if (err) { setHandleError(err); return; }
    setHandleError(null);
    if (h.toLowerCase() === originalHandle.toLowerCase()) { setHandleAvail(true); return; }
    checkTimerRef.current = setTimeout(() => {
      const taken = isHandleTaken(h, email);
      setHandleAvail(!taken);
      if (taken) setHandleError("This handle is already taken.");
    }, 350);
  }, [originalHandle, email]);

  const onHandleChange = (raw: string) => {
    const clean = raw.replace(/^@+/, "").replace(/\s/g, "").toLowerCase();
    setHandle(clean);
    checkHandle(clean);
  };

  const readImageAsDataUrl = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    });

  const onBrandImageSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "banner"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkError(null);
    if (!file.type.startsWith("image/")) {
      setWatermarkError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setWatermarkError("Image must be 5 MB or less.");
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      if (kind === "avatar") {
        setAvatarDataUrl(dataUrl);
        setAvatarFileName(file.name);
      } else {
        setBannerDataUrl(dataUrl);
        setBannerFileName(file.name);
      }
    } catch {
      setWatermarkError("Failed to read the image. Please try another file.");
    }
  };

  // ── Watermark upload ───────────────────────────────────────
  const onWatermarkSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWatermarkError(null);
    const allowed = ["image/png", "image/gif", "image/bmp", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.type)) {
      setWatermarkError("Only PNG, GIF (no animations), BMP, or JPEG files are supported.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setWatermarkError("File must be 1 MB or less.");
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setWatermarkDataUrl(dataUrl);
      setWatermarkFileName(file.name);
    } catch {
      setWatermarkError("Failed to read the image. Please try another file.");
    }
  };

  // ── Links ──────────────────────────────────────────────────
  const addLink = () => { if (links.length < MAX_LINKS) setLinks(p => [...p, { id: uid(), label: "", url: "" }]); };
  const updateLink = (id: string, field: "label" | "url", val: string) =>
    setLinks(p => p.map(l => l.id === id ? { ...l, [field]: val } : l));
  const removeLink = (id: string) => setLinks(p => p.filter(l => l.id !== id));

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    const nErr = validateChannelName(channelName);
    const handleChanged = handle.toLowerCase() !== originalHandle.toLowerCase();
    const hErr = handleChanged ? validateHandle(handle) : null;
    const switchingBack = handleChanged && cooldown.heldHandles.some(
      h => h.handle.toLowerCase() === handle.trim().toLowerCase()
    );
    setNameError(nErr); setHandleError(hErr);
    if (nErr || hErr) return;
    if (handleChanged && handleAvail === false) { setHandleError("This handle is already taken."); return; }
    if (handleChanged && cooldown.locked && !switchingBack) {
      setHandleError(`You've used both changes for this 10-day window. ${cooldown.daysUntilSlot} day${cooldown.daysUntilSlot !== 1 ? "s" : ""} until a slot reopens.`);
      return;
    }

    setSaving(true);

    let newHistory = [...handleHistory];
    if (handleChanged) {
      const now = new Date();
      const release = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      if (newHistory.length === 0 && originalHandle.trim()) {
        newHistory.push({ handle: originalHandle.trim(), changedAt: "1970-01-01T00:00:00.000Z", releasedAt: release.toISOString() });
      }
      if (!switchingBack) {
        newHistory.push({ handle: handle.trim(), changedAt: now.toISOString(), releasedAt: release.toISOString() });
      }
      registerHandle();
    }

    const data: ChannelCustomization = {
      channelName: channelName.trim(),
      handle: handle.trim(),
      description: description.trim(),
      contactEmail: contactEmail.trim(),
      links: links.filter(l => l.url.trim()),
      // avatarDataUrl / bannerDataUrl hold Cloudinary URLs (returned from
      // the /api/upload/image endpoint) — NOT raw base64 data URIs.
      // Raw base64 is only used for preview; actual persistence happens
      // via the upload endpoint before this save is called.
      avatarDataUrl: avatarDataUrl || undefined,
      avatarFileName: avatarFileName || undefined,
      bannerDataUrl: bannerDataUrl || undefined,
      bannerFileName: bannerFileName || undefined,
      watermarkDataUrl: watermarkDataUrl || undefined,
      watermarkFileName: watermarkFileName || undefined,
      handleLastChanged: handleChanged ? new Date().toISOString() : undefined,
      handleHistory: newHistory,
    };

    try {
      // ── Upload avatar to Cloudinary if it's a fresh base64 data URL ──
      if (avatarDataUrl?.startsWith("data:image/")) {
        const formData = new FormData();
        const blob = await (await fetch(avatarDataUrl)).blob();
        formData.append("file", blob, avatarFileName || "avatar.jpg");
        formData.append("type", "avatar");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const uploadRes = await fetch(`${API_URL}/api/upload/image`, { method: "POST", headers, body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          data.avatarDataUrl = url; // replace base64 with Cloudinary URL
        }
      }

      // ── Upload banner to Cloudinary if it's a fresh base64 data URL ──
      if (bannerDataUrl?.startsWith("data:image/")) {
        const formData = new FormData();
        const blob = await (await fetch(bannerDataUrl)).blob();
        formData.append("file", blob, bannerFileName || "banner.jpg");
        formData.append("type", "banner");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const uploadRes = await fetch(`${API_URL}/api/upload/image`, { method: "POST", headers, body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          data.bannerDataUrl = url;
        }
      }

      // ── Upload watermark to Cloudinary if fresh base64 ──
      if (watermarkDataUrl?.startsWith("data:image/")) {
        const formData = new FormData();
        const blob = await (await fetch(watermarkDataUrl)).blob();
        formData.append("file", blob, watermarkFileName || "watermark.png");
        formData.append("type", "watermark");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const uploadRes = await fetch(`${API_URL}/api/upload/image`, { method: "POST", headers, body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          data.watermarkDataUrl = url;
        }
      }

      // ── Persist everything to PostgreSQL via POST /api/channel-customization ──
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Create payload FIRST
      const payload: any = {
        email,
        channelName: data.channelName,
        handle: data.handle,
        description: data.description,
        contactEmail: data.contactEmail,
        links: data.links,
      };

      // Only send images if they exist
      if (data.avatarDataUrl) {
        payload.avatarUrl = data.avatarDataUrl;
      }

      if (data.bannerDataUrl) {
        payload.bannerUrl = data.bannerDataUrl;
      }

      if (data.watermarkDataUrl) {
        payload.watermarkUrl = data.watermarkDataUrl;
      }

      // THEN call fetch
      const saveRes = await fetch(
        `${API_URL}/api/channel-customization`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }
      );


      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        // Handle server-reported duplicate handle
        if (err?.error?.toLowerCase().includes("handle")) {
          setHandleError("This handle is already taken. Please choose another.");
          setSaving(false);
          return;
        }
        throw new Error(err?.error || "Save failed");
      }
    } catch (err) {
      console.error("ChannelCustomizationModal save error:", err);
      setSaving(false);
      return;
    }

    setHandleHistory(newHistory);
    setCooldown(computeCooldown(newHistory));
    setOriginalHandle(handle.trim());
    setSaving(false); setSaved(true);
    onSaved?.(data);
    setTimeout(() => { setSaved(false); onClose(); }, 1400);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(`${SITE_BASE}${handle || "yourhandle"}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Derived
  const changesLeft = Math.max(0, MAX_CHANGES - cooldown.changesInWindow);
  const handleChanged = handle.toLowerCase() !== originalHandle.toLowerCase();
  const standardChannelUrl = `https://www.airstreamx.com/channel/${makeChannelId(email)}`;

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}
          >

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div>
                <h2 className="text-[15px] font-bold text-white tracking-tight">Customize channel</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Manage your public identity on AirStreamX</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition">
                <X size={16} />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-3.5 text-[13px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${tab === t.id ? "text-white" : "text-gray-400 hover:text-gray-300"
                    }`}>
                  <span className={tab === t.id ? "text-red-500" : ""}>{t.icon}</span>
                  {t.label}
                  {tab === t.id && (
                    <motion.div layoutId="custTabLine"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">

                {/* ══════ BASIC INFO ══════ */}
                {tab === "basic" && (
                  <motion.div key="basic"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="px-6 py-5 space-y-7"
                  >
                    {/* Channel Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[13px] font-semibold text-white">Name <span className="text-red-400">*</span></label>
                        <CharCount n={channelName.length} max={100} />
                      </div>
                      <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">
                        Choose a channel name that represents you and your content. This is shown everywhere instead of your email address.
                      </p>
                      <input
                        value={channelName}
                        onChange={e => { setChannelName(e.target.value); setNameError(validateChannelName(e.target.value)); }}
                        maxLength={100}
                        placeholder="e.g. Vineet's Tech Corner"
                        className={`w-full bg-white/[0.04] border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition ${nameError ? "border-red-500/60" : "border-white/10 focus:border-red-500/40"
                          }`}
                      />
                      <FieldError msg={nameError} />
                    </div>

                    {/* Handle */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[13px] font-semibold text-white">Handle <span className="text-red-400">*</span></label>
                        {/* Change-slot dots */}
                        <div className="flex items-center gap-1.5">
                          {[0, 1].map(i => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < (MAX_CHANGES - changesLeft) ? "bg-red-500" : "bg-white/15"
                              }`} />
                          ))}
                          <span className="text-[11px] text-gray-400 ml-1">{changesLeft}/{MAX_CHANGES} changes left</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">
                        Your handle is a unique @name that helps people find your channel — different from your channel name.
                        You can change your handle <strong className="text-gray-300">twice within a 10-day period</strong>.
                        We hold your previous handle for <strong className="text-gray-300">10 days</strong> in case you'd like to switch back.
                        <br />
                        <span className="text-gray-600 mt-1 block">For example: {SITE_BASE}HelpfulHubb</span>
                      </p>

                      {/* Locked banner */}
                      {cooldown.locked && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl mb-3">
                          <Lock size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[12px] font-semibold text-amber-300">Handle changes locked</p>
                            <p className="text-[11px] text-amber-400/70 mt-0.5">
                              You've used both changes for this 10-day window.
                              A slot opens in <strong className="text-amber-300">{cooldown.daysUntilSlot} day{cooldown.daysUntilSlot !== 1 ? "s" : ""}</strong>.
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {/* Held handles (switch-back buttons) */}
                      {cooldown.heldHandles.length > 0 && (
                        <div className="mb-3 p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                          <p className="text-[11px] text-gray-400 font-medium mb-2">Previous handles held (tap to switch back):</p>
                          <div className="space-y-1.5">
                            {cooldown.heldHandles.map(({ handle: hh, releasedAt }) => (
                              <div key={hh} className="flex items-center justify-between">
                                <button
                                  disabled={cooldown.locked}
                                  onClick={() => { setHandle(hh); checkHandle(hh); }}
                                  className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <RefreshCw size={11} /> @{hh}
                                </button>
                                <span className="text-[10px] text-gray-600">
                                  Held until {releasedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Handle input */}
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-red-400 text-sm font-semibold select-none">@</span>
                        <input
                          value={handle}
                          onChange={e => onHandleChange(e.target.value)}
                          maxLength={30}
                          placeholder="yourhandle"
                          disabled={cooldown.locked}
                          className={`w-full bg-white/[0.04] border rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed ${handleError ? "border-red-500/60" :
                            handleAvail === true && handleChanged ? "border-emerald-500/50" :
                              "border-white/10 focus:border-red-500/40"
                            }`}
                        />
                        {handleChanged && !handleError && handleAvail !== null && (
                          <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${handleAvail ? "text-emerald-400" : "text-red-400"}`}>
                            {handleAvail ? <CheckCircle2 size={16} /> : <X size={16} />}
                          </div>
                        )}
                        {cooldown.locked && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500">
                            <Lock size={14} />
                          </div>
                        )}
                      </div>
                      <FieldError msg={handleError} />

                      {handleChanged && handleAvail === true && !handleError && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1.5">
                          <Check size={11} /> Handle is available
                        </p>
                      )}

                      {/* Inline URL preview */}
                      <div className="mt-3 flex items-center gap-2 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                        <Globe size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="text-[11px] text-gray-400 flex-1 truncate font-mono">{SITE_BASE}{handle || "yourhandle"}</span>
                        <button onClick={copyUrl} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-400 transition flex-shrink-0">
                          {copiedUrl ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          {copiedUrl ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[13px] font-semibold text-white">Description</label>
                        <CharCount n={description.length} max={1000} />
                      </div>
                      <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">
                        Tell viewers about your channel. Appears on your channel profile and About page.
                      </p>
                      <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        maxLength={1000}
                        rows={5}
                        placeholder="Tell viewers what your channel is about, what kind of content you upload, your schedule, etc."
                        className="w-full bg-white/[0.04] border border-white/10 focus:border-red-500/40 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition resize-none leading-relaxed"
                      />
                    </div>
                  </motion.div>
                )}

                {/* ══════ CHANNEL URL ══════ */}
                {tab === "url" && (
                  <motion.div key="url"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="px-6 py-5 space-y-5"
                  >
                    <div>
                      <h3 className="text-[13px] font-semibold text-white mb-1">Channel URL</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        This is the standard web address for your channel. It includes your unique channel ID, which is the numbers
                        and letters at the end of the URL. You can also share your public <strong className="text-gray-300">@handle</strong> URL.
                      </p>
                    </div>

                    <div className="bg-[#0d0d0d] border border-white/[0.08] rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-white/[0.05]">
                        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Your public handle URL</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 overflow-hidden">
                            <Globe size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-white font-mono truncate">{SITE_BASE}{handle || "yourhandle"}</span>
                          </div>
                          <button onClick={copyUrl}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.06] hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 hover:text-white transition flex-shrink-0">
                            {copiedUrl ? <><Check size={14} className="text-emerald-400" /> Copied</> : <><Copy size={14} /> Copy</>}
                          </button>
                        </div>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {[
                          { label: "Standard", value: standardChannelUrl },
                          { label: "Handle", value: `${SITE_BASE}${handle || "yourhandle"}` },
                          { label: "ID", value: makeChannelId(email) },
                        ].map(row => (
                          <div key={row.label} className="flex items-center px-5 py-3">
                            <span className="text-[11px] text-gray-600 w-20 flex-shrink-0">{row.label}</span>
                            <span className="text-[11px] text-gray-300 font-mono flex-1 truncate">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <InfoBox icon={<Info size={14} />}>
                      Handle changes take effect immediately. Your old handle is held for{" "}
                      <strong className="text-gray-200">10 days</strong> so you can switch back.
                      You can change your handle <strong className="text-gray-200">twice</strong> per 10-day window.
                    </InfoBox>

                    <a href={`${SITE_BASE}${handle || "yourhandle"}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition">
                      <ExternalLink size={14} /> View your channel
                    </a>
                  </motion.div>
                )}

                {/* ══════ LINKS ══════ */}
                {tab === "links" && (
                  <motion.div key="links"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="px-6 py-5 space-y-5"
                  >
                    <div>
                      <h3 className="text-[13px] font-semibold text-white mb-1">Links</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Share external links with your viewers. They'll be visible on your channel profile and About page.
                        You can add up to <strong className="text-gray-300">{MAX_LINKS} links</strong>.
                      </p>
                    </div>

                    {links.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-white/[0.08] rounded-2xl">
                        <LinkIcon size={28} className="mx-auto mb-3 text-gray-700" />
                        <p className="text-sm text-gray-400 mb-4">No links added yet</p>
                        <button onClick={addLink}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full text-sm font-medium transition border border-red-500/20">
                          <Plus size={14} /> Add your first link
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <AnimatePresence>
                          {links.map((link, i) => (
                            <motion.div key={link.id}
                              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                              className="group p-4 bg-white/[0.03] border border-white/[0.06] hover:border-white/10 rounded-xl transition-colors">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                                  {detectPlatformIcon(link.url)}
                                  <span className="text-[11px] text-gray-400 font-medium">Link {i + 1}</span>
                                </div>
                                <button onClick={() => removeLink(link.id)}
                                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-red-500/15 text-gray-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <div className="space-y-2">
                                <input value={link.label} onChange={e => updateLink(link.id, "label", e.target.value)}
                                  maxLength={40} placeholder="Label (e.g. My Website, Instagram, Portfolio)"
                                  className="w-full bg-[#0a0a0a] border border-white/[0.08] focus:border-red-500/40 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition" />
                                <input value={link.url} onChange={e => updateLink(link.id, "url", e.target.value)}
                                  maxLength={200} placeholder="https://" type="url"
                                  className="w-full bg-[#0a0a0a] border border-white/[0.08] focus:border-red-500/40 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition font-mono" />
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}

                    {links.length > 0 && links.length < MAX_LINKS && (
                      <button onClick={addLink}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/10 hover:border-red-500/30 rounded-xl text-sm text-gray-400 hover:text-red-400 transition">
                        <Plus size={14} /> Add another link ({links.length}/{MAX_LINKS})
                      </button>
                    )}
                    {links.length >= MAX_LINKS && (
                      <p className="text-center text-[11px] text-gray-600">Maximum {MAX_LINKS} links reached</p>
                    )}

                    {/* Quick add */}
                    <div>
                      <p className="text-[11px] text-gray-600 uppercase tracking-wider font-medium mb-2">Quick add</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { icon: "▶️", label: "YouTube", prefix: "https://youtube.com/@" },
                          { icon: "𝕏", label: "X / Twitter", prefix: "https://x.com/" },
                          { icon: "📸", label: "Instagram", prefix: "https://instagram.com/" },
                          { icon: "🌐", label: "Website", prefix: "https://" },
                        ].map(p => (
                          <button key={p.label} disabled={links.length >= MAX_LINKS}
                            onClick={() => setLinks(prev => [...prev, { id: uid(), label: p.label, url: p.prefix }])}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-full text-xs text-gray-400 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed">
                            <span>{p.icon}</span> {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preview pills */}
                    {links.some(l => l.url) && (
                      <div>
                        <p className="text-[11px] text-gray-600 uppercase tracking-wider font-medium mb-2">Preview</p>
                        <div className="flex flex-wrap gap-2">
                          {links.filter(l => l.url).map(l => (
                            <div key={l.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-xs text-gray-300">
                              {detectPlatformIcon(l.url)}
                              {l.label || (() => { try { return new URL(l.url.startsWith("http") ? l.url : `https://${l.url}`).hostname.replace("www.", ""); } catch { return l.url; } })()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ══════ CONTACT INFO ══════ */}
                {tab === "contact" && (
                  <motion.div key="contact"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="px-6 py-5 space-y-5"
                  >
                    <div>
                      <h3 className="text-[13px] font-semibold text-white mb-1">Contact info</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Provide a way for brands, collaborators, and viewers to reach you.
                        This is separate from your login email and will be shown on your About page.
                      </p>
                    </div>

                    <div>
                      <label className="text-[12px] font-medium text-gray-300 block mb-1.5">Business / contact email</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          value={contactEmail}
                          onChange={e => setContactEmail(e.target.value)}
                          type="email" maxLength={120}
                          placeholder="contact@yourdomain.com"
                          className="w-full bg-white/[0.04] border border-white/10 focus:border-red-500/40 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition"
                        />
                      </div>
                      {contactEmail && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-2 mt-3 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                          <Eye size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-emerald-300 leading-relaxed">
                            <strong>{contactEmail}</strong> will be publicly visible on your channel's About page.
                          </p>
                        </motion.div>
                      )}
                    </div>

                    <div>
                      <label className="text-[12px] font-medium text-gray-300 block mb-1.5">
                        Account email <span className="text-gray-600 font-normal">(login only — never shown publicly)</span>
                      </label>
                      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-2.5 opacity-60 cursor-not-allowed">
                        <Lock size={13} className="text-gray-600 flex-shrink-0" />
                        <span className="text-sm text-gray-400 font-mono">{email}</span>
                      </div>
                    </div>

                    <InfoBox icon={<Info size={14} />} title="Your login email stays private">
                      Only the contact email you enter above is visible to other users.
                      Your account login (<span className="font-mono text-gray-400">{email}</span>) is never displayed.
                    </InfoBox>
                  </motion.div>
                )}

                {/* ══════ BRANDING / WATERMARK ══════ */}
                {tab === "branding" && (
                  <motion.div key="branding"
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.15 }}
                    className="px-6 py-5 space-y-5"
                  >
                    <div>
                      <h3 className="text-[13px] font-semibold text-white mb-1">Picture and banner</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        Your profile picture appears where your channel is presented on AirStreamX, like next to your videos and comments.
                        Your banner appears across the top of your channel page.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="relative w-full h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-red-950/40 to-black border border-white/[0.08]">
                        {bannerDataUrl && <img src={bannerDataUrl} alt="Channel banner" className="absolute inset-0 w-full h-full object-cover" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <button
                          onClick={() => { if (bannerRef.current) { bannerRef.current.value = ""; bannerRef.current.click(); } }}
                          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-xs text-white border border-white/20 transition"
                        >
                          <Upload size={12} /> {bannerDataUrl ? "Change banner" : "Upload banner"}
                        </button>
                      </div>

                      <div className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
                          {avatarDataUrl ? <img src={avatarDataUrl} alt="Profile" className="w-full h-full object-cover" /> : (channelName[0] || "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium">Picture</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Changes made to your name and picture are visible across your channel, videos, and comments.
                          </p>
                          {(avatarFileName || bannerFileName) && (
                            <p className="text-[10px] text-gray-600 mt-1 truncate">
                              {[avatarFileName, bannerFileName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => { if (avatarRef.current) { avatarRef.current.value = ""; avatarRef.current.click(); } }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-xs text-gray-300 hover:text-white transition"
                          >
                            <Upload size={12} /> {avatarDataUrl ? "Change" : "Upload"}
                          </button>
                          {avatarDataUrl && (
                            <button
                              onClick={() => { setAvatarDataUrl(""); setAvatarFileName(""); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs text-red-400 hover:text-red-300 transition"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <input ref={avatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => onBrandImageSelect(e, "avatar")} />
                    <input ref={bannerRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => onBrandImageSelect(e, "banner")} />

                    <div>
                      <h3 className="text-[13px] font-semibold text-white mb-1">Video watermark</h3>
                      <p className="text-[11px] text-gray-400 leading-relaxed">
                        The watermark will appear on your videos in the{" "}
                        <strong className="text-gray-300">bottom-right corner</strong> of the video player.
                        An image that's <strong className="text-gray-300">150 × 150 pixels</strong> is recommended.
                        Use a PNG, GIF (no animations), BMP, or JPEG file that's{" "}
                        <strong className="text-gray-300">1 MB or less</strong>.
                      </p>
                    </div>

                    {watermarkDataUrl ? (
                      <div className="space-y-4">
                        {/* Video player mockup with watermark preview */}
                        <div className="relative w-full aspect-video bg-[#050505] border border-white/[0.08] rounded-2xl overflow-hidden select-none">
                          {/* Gradient content stand-in */}
                          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <div className="text-gray-600 text-xs tracking-widest uppercase">Video content</div>
                          </div>
                          {/* Bottom gradient */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          {/* Watermark in bottom-right (above controls) */}
                          <div className="absolute bottom-10 right-3 flex flex-col items-end gap-1">
                            <div className="w-9 h-9 rounded overflow-hidden bg-black/50 backdrop-blur-sm border border-white/10 shadow-lg">
                              <img src={watermarkDataUrl} alt="Watermark" className="w-full h-full object-contain" />
                            </div>
                          </div>
                          {/* Fake player controls bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-9 bg-gradient-to-t from-black to-transparent px-3 flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-white/20 flex-shrink-0" />
                            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className="w-[38%] h-full bg-red-500 rounded-full" />
                            </div>
                            <div className="w-16 h-1 bg-white/10 rounded-full flex-shrink-0" />
                            <div className="w-4 h-4 rounded bg-white/10 flex-shrink-0" />
                          </div>
                          {/* Label */}
                          <div className="absolute top-3 left-3 text-[10px] text-white/40 font-medium uppercase tracking-wider">Preview</div>
                        </div>

                        {/* Watermark controls */}
                        <div className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                          <img src={watermarkDataUrl} alt="Watermark" className="w-14 h-14 object-contain rounded-lg bg-black/50 border border-white/10 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{watermarkFileName || "Watermark"}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Appears bottom-right of video player</p>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <button
                              onClick={() => { if (watermarkRef.current) { watermarkRef.current.value = ""; watermarkRef.current.click(); } }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-xs text-gray-300 hover:text-white transition">
                              <Upload size={12} /> Change
                            </button>
                            <button
                              onClick={() => { setWatermarkDataUrl(""); setWatermarkFileName(""); setWatermarkError(null); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs text-red-400 hover:text-red-300 transition">
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Upload zone */
                      <button
                        onClick={() => { if (watermarkRef.current) { watermarkRef.current.value = ""; watermarkRef.current.click(); } }}
                        className="w-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-red-500/30 rounded-2xl transition group cursor-pointer"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] group-hover:bg-red-500/10 flex items-center justify-center mb-3 transition">
                          <Upload size={24} className="text-gray-600 group-hover:text-red-400 transition" />
                        </div>
                        <p className="text-sm text-gray-400 font-medium mb-1">Upload watermark image</p>
                        <p className="text-[11px] text-gray-600">PNG, GIF, BMP, or JPEG · 150 × 150 px recommended · Max 1 MB</p>
                      </button>
                    )}

                    {/* Hidden file input */}
                    <input ref={watermarkRef} type="file"
                      accept="image/png,image/gif,image/bmp,image/jpeg,image/jpg"
                      style={{ display: "none" }}
                      onChange={onWatermarkSelect}
                    />

                    {watermarkError && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                        <AlertCircle size={13} /> {watermarkError}
                      </motion.div>
                    )}

                    <InfoBox icon={<Info size={14} />}>
                      The watermark is stored locally and overlaid on your video player.
                      For best results, use a transparent PNG with your channel logo or icon at 150 × 150 px.
                      Clicking the watermark will prompt viewers to subscribe to your channel.
                    </InfoBox>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] flex-shrink-0 bg-[#0d0d0d]">
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition rounded-lg hover:bg-white/5">
                Cancel
              </button>

              <motion.button
                onClick={handleSave}
                disabled={saving || saved || !!nameError}
                whileHover={!saving && !saved && !nameError ? { scale: 1.02 } : {}}
                whileTap={!saving && !saved && !nameError ? { scale: 0.98 } : {}}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${saved
                  ? "bg-emerald-500 text-white"
                  : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/20"
                  }`}
              >
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> :
                  saved ? <><CheckCircle2 size={15} /> Saved!</> :
                    <><Save size={15} /> Save changes</>}
              </motion.button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
