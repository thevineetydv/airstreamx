// ============================================================
// Header.tsx — VERSION 2.1  ACCESSIBILITY FIXES
//
// Previous fixes (v2.0):
//   [1] "+ Create" dropdown toggle state + createRef click-outside.
//   [2] Dropdown closes on outside click.
//   [3] Dropdown closes when a menu item is clicked.
//   [4] Glass-morphism styling consistent with notifications menu.
//   [5] "Go Live" and "Upload" respect auth (login modal).
//
// A11y fixes (v2.1):
//   [A1] Create button: aria-label (text is hidden on mobile — this was
//        the Lighthouse "button-name" failure), aria-expanded/controls.
//   [A2] All icon-only buttons labelled (close menu, clear search);
//        decorative icons aria-hidden.
//   [A3] Notifications + account buttons expose open/closed state.
//   [A4] Search inputs get aria-label; desktop search is a proper
//        combobox/listbox so arrow-key selection is announced.
//   [A5] Desktop and mobile search no longer share one ref (the mobile
//        input was overwriting inputRef/searchRef on desktop).
//   [A6] Escape closes Create / notifications / account / sidebar.
//   [A7] Sidebar drawer is a labelled modal dialog; focus moves into it.
//   [A8] Notification rows are buttons, not clickable divs.
//   [A9] Contrast: red-500 → red-600 behind white text; gray-500/600
//        text → gray-400; fixed 11px text → rem-based text-xs.
//   [A10] Sidebar navigation uses real links (<Link>) instead of buttons.
// ============================================================

import React, { useEffect, useState, useRef, useId } from "react";
import {
  Menu, Mic, MicOff, Search as SearchIcon, Upload,
  Loader2, Bell, History, Settings, User, LogOut, X,
  TrendingUp, Clock, Zap, Home, Library, ThumbsUp, PlaySquare,
  Radio, ArrowRight, Scissors, Plus, FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoginRequiredModal } from "./LoginRequiredModal";
import CreatePostModal from "./CreatePostModal";
import { API_URL } from "../utils/constants";
import { useNotifications } from "../context/NotificationContext";

type SpeechRecognition = any;

// ─────────────────────────────────────────────
// BirthdayConfetti — founder-only, Aug 23
// ─────────────────────────────────────────────
function BirthdayConfetti() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const now = new Date();
    const isBirthday = now.getMonth() === 7 && now.getDate() === 23; // Aug 23
    const isFounder = user?.email?.toLowerCase() === "vineetsitm09@gmail.com";
    if (!isBirthday || !isFounder) return;

    try {
      if (sessionStorage.getItem("birthday_shown_2026") === "1") return;
      sessionStorage.setItem("birthday_shown_2026", "1");
    } catch { }

    setShow(true);
    const t = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(t);
  }, [user?.email]);

  if (!show) return null;

  const confettiColors = ["#ef4444", "#f87171", "#fbbf24", "#60a5fa", "#34d399"];
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.4,
    color: confettiColors[i % confettiColors.length],
    rotate: Math.random() * 360,
    drift: (Math.random() - 0.5) * 120,
  }));

  return (
    <div className="fixed inset-0 z-[999] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          aria-hidden="true"
          initial={{ y: -30, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", x: p.drift, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: 8,
            height: 14,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
        />
      ))}
      <motion.div
        role="status"
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md border border-red-500/30 rounded-2xl px-6 py-4 shadow-2xl text-center"
      >
        <p className="text-white font-bold text-lg whitespace-nowrap">
          🎉 Happy Birthday, Vineet! 🎂
        </p>
        <p className="text-gray-400 text-xs mt-1">— from the platform you built</p>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Shared logo — single source of truth
// ─────────────────────────────────────────────
export function AirStreamXLogo({ size = 36 }: { size?: number }) {
  // Unique per instance — rendered more than once at a time, so shared
  // ids would break the url(#...) gradient/glow references.
  const uid = useId().replace(/:/g, "");
  const gradId = `axLogoGrad-${uid}`;
  const glowId = `axLogoGlow-${uid}`;

  // Independence Day (14–16 Aug) kite doodle
  const now = new Date();
  const showKite = now.getMonth() === 7 && now.getDate() >= 14 && now.getDate() <= 16;

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }} aria-hidden="true">
      <div
        style={{ width: size, height: size }}
        className="rounded-[10px] flex items-center justify-center bg-[#050a10] border border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.35)] flex-shrink-0"
      >
        <svg
          width={size * 0.61}
          height={size * 0.61}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Play triangle */}
          <polygon points="4,6 21,16 4,26" fill={`url(#${gradId})`} filter={`url(#${glowId})`} />
          {/* Pause bar */}
          <rect x="24" y="6" width="4" height="20" rx="2" fill="#ef4444" opacity="0.9" />
        </svg>
      </div>

      {showKite && (
        <motion.svg
          aria-hidden
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 40 40"
          className="absolute pointer-events-none"
          style={{ top: -size * 0.42, right: -size * 0.32 }}
          initial={{ opacity: 0, y: -6 }}
          animate={{
            opacity: 1,
            y: [0, -3, 0, 2, 0],
            rotate: [-6, 4, -6],
          }}
          transition={{
            opacity: { duration: 0.4 },
            y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <path
            d="M14 22 Q 6 30 -2 34"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
            fill="none"
          />
          <g transform="translate(20,16) rotate(20)">
            <path d="M0,-13 L9,0 L0,13 L-9,0 Z" fill="#FF9933" stroke="#0F0F0F" strokeWidth="0.6" />
            <path d="M-9,0 L9,0 L0,13 Z" fill="#138808" />
            <path d="M-9,0 L9,0 L0,-13 Z" fill="#FF9933" />
            <rect x="-9" y="-1.3" width="18" height="2.6" fill="#FFFFFF" />
            <line x1="0" y1="-13" x2="0" y2="13" stroke="#0F0F0F" strokeWidth="0.5" opacity="0.4" />
          </g>
          <path d="M12 27 l3 2 M15 29 l3 2 M18 31 l3 2" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        </motion.svg>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface HeaderProps {
  theme: "dark" | "neon";
  setTheme: (t: "dark" | "neon") => void;
  q: string;
  setQ: (v: string) => void;
  themeCls: { page: string; panel: string };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadClick: () => void;
  uploading: boolean;
}

type SuggestionType = "history" | "trending" | "suggestion";
interface SearchSuggestion { text: string; type: SuggestionType }

// ─────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────

// [A10] Navigation items are real links — announced as links, and
// middle-click / "open in new tab" work.
function SidebarItem({
  icon: Icon,
  label,
  to,
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  label: string;
  to: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-left group"
    >
      <Icon aria-hidden="true" className="w-5 h-5 group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-left text-sm group"
    >
      <Icon aria-hidden="true" className="w-4 h-4 group-hover:scale-110 transition-transform" />
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────

const TRENDING_SEARCHES = [
  "music videos",
  "tech reviews",
  "gaming highlights",
  "cooking tutorials",
  "travel vlogs",
];

const GEO_APIS = [
  { url: "https://ipapi.co/json/", field: "country_code" },
  { url: "https://api.country.is", field: "country" },
  { url: "https://ipwho.is/", field: "country_code" },
] as const;

const SIDEBAR_LINKS = [
  { icon: Home, label: "Home", to: "/" },
  { icon: Zap, label: "Shorts", to: "/shorts" },
  { icon: TrendingUp, label: "Trending", to: "/trending" },
  { icon: Library, label: "Library", to: "/library" },
  { icon: History, label: "History", to: "/history" },
  { icon: ThumbsUp, label: "Liked Videos", to: "/liked" },
  { icon: PlaySquare, label: "Watch Later", to: "/watch-later" },
];

const FOOTER_LINKS = [
  { label: "About", to: "/about" },
  { label: "How it works", to: "/how-it-works" },
  { label: "FAQ", to: "/faq" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
];

/**
 * CountryFlagIcon — small inline SVG flag, NOT an emoji (Windows often
 * renders flag emoji as the raw letters "IN").
 */
function CountryFlagIcon({ code, className = "w-4 h-3" }: { code: string; className?: string }) {
  switch (code.toUpperCase()) {
    case "IN":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true" focusable="false">
          <rect width="24" height="16" fill="#0F0F0F" />
          <rect width="24" height="5.33" y="0" fill="#FF9933" />
          <rect width="24" height="5.33" y="5.33" fill="#FFFFFF" />
          <rect width="24" height="5.33" y="10.67" fill="#138808" />
          <circle cx="12" cy="8" r="2.1" fill="none" stroke="#000080" strokeWidth="0.35" />
          <circle cx="12" cy="8" r="0.4" fill="#000080" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2c2.5 2.7 4 6.3 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.3-4-10s1.5-7.3 4-10z" />
        </svg>
      );
  }
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function Header({
  theme, q = "", setQ, handleUploadClick,
}: HeaderProps) {
  const { user, login, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, clearAll: clearAllNotifications } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  // Stable ids for aria-controls / aria-activedescendant
  const baseId = useId().replace(/:/g, "");
  const createMenuId = `${baseId}-create-menu`;
  const notifPanelId = `${baseId}-notifications`;
  const accountMenuId = `${baseId}-account-menu`;
  const suggestionsId = `${baseId}-search-suggestions`;
  const optionId = (i: number) => `${baseId}-search-option-${i}`;

  // Dropdown visibility
  const [openMenu, setOpenMenu] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [openSidebar, setOpenSidebar] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [userHandle, setUserHandle] = useState<string | null>(null);

  // Fetch real handle from DB when user logs in
  React.useEffect(() => {
    if (!user?.email) { setUserHandle(null); return; }
    fetch(`${API_URL}/api/channel-customization/${encodeURIComponent(user.email)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const handle = data?.customization?.handle || data?.handle || null;
        setUserHandle(handle);
      })
      .catch(() => setUserHandle(null));
  }, [user?.email]);

  // Search
  const [searchFocused, setSearchFocused] = useState(false);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Voice search
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  // Country badge
  const [countryCode, setCountryCode] = useState("");

  // Refs
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);          // desktop search only
  const createRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);         // desktop input only
  const mobileInputRef = useRef<HTMLInputElement>(null);   // [A5] separate mobile ref
  const menuButtonRef = useRef<HTMLButtonElement>(null);   // returns focus after sidebar closes

  // ── Sync search query with URL ─────────────
  useEffect(() => {
    const urlQuery = new URLSearchParams(location.search).get("q") ?? "";
    if (urlQuery !== q) setQ(urlQuery);
  }, [location.search]); // intentionally omitting q/setQ to avoid loop

  // ── Load search history ────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("search_history");
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch { }
  }, []);

  // ── Fetch search suggestions (debounced) ───
  useEffect(() => {
    if (!q.trim() || !showSearchSuggestions) { setSuggestions([]); return; }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${API_URL}/videos?search=${encodeURIComponent(q)}&limit=5`);
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
          setSuggestions(
            data.videos.slice(0, 5).map((v: { title: string }) => ({
              text: v.title,
              type: "suggestion" as const,
            }))
          );
        }
      } catch {
        // fail silently
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [q, showSearchSuggestions]);

  // Reset highlighted suggestion whenever the list changes
  useEffect(() => { setSelectedIndex(-1); }, [q, showSearchSuggestions]);

  // ── Voice search setup ─────────────────────
  useEffect(() => {
    const SpeechRec =
      (window as Window & { SpeechRecognition?: any }).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) return;
    setVoiceSupported(true);

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setQ(transcript);
      handleSearchSubmit(transcript);
      setIsListening(false);
    };

    rec.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        alert("Microphone access denied. Please allow it in your browser settings.");
      } else if (event.error === "no-speech") {
        alert("No speech detected. Please try again.");
      }
    };

    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;

    return () => rec.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geo IP (country badge) ──────────────────
  useEffect(() => {
    const cached = localStorage.getItem("countryCode");
    if (cached) { setCountryCode(cached); return; }

    (async () => {
      for (const api of GEO_APIS) {
        try {
          const res = await fetch(api.url);
          if (!res.ok) continue;
          const data = await res.json();
          const code = data?.[api.field] as string | undefined;
          if (code) {
            setCountryCode(code);
            localStorage.setItem("countryCode", code);
            return;
          }
        } catch { continue; }
      }
      setCountryCode("IN");
      localStorage.setItem("countryCode", "IN");
    })();
  }, []);

  // ── Close dropdowns on outside click ───────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(false);
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setOpenNotifications(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchSuggestions(false);
      if (createRef.current && !createRef.current.contains(e.target as Node)) setOpenCreate(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── [A6] Escape closes every popup ─────────
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpenCreate(false);
      setOpenMenu(false);
      setOpenNotifications(false);
      setOpenSidebar(prev => {
        if (prev) menuButtonRef.current?.focus(); // return focus to the trigger
        return false;
      });
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  // ── Helpers ─────────────────────────────────

  const getCombinedSuggestions = (): SearchSuggestion[] => {
    if (!q.trim()) {
      if (searchHistory.length) return searchHistory.map(text => ({ text, type: "history" as const })).slice(0, 8);
      return TRENDING_SEARCHES.map(text => ({ text, type: "trending" as const }));
    }
    const combined: SearchSuggestion[] = [...suggestions];
    searchHistory
      .filter(h => h.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 3)
      .forEach(text => {
        if (!combined.find(s => s.text === text)) combined.push({ text, type: "history" });
      });
    return combined.slice(0, 8);
  };

  const handleSearchSubmit = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) { navigate("/"); return; }

    const newHistory = [trimmed, ...searchHistory.filter(h => h !== trimmed)].slice(0, 10);
    setSearchHistory(newHistory);
    localStorage.setItem("search_history", JSON.stringify(newHistory));

    navigate(`/?q=${encodeURIComponent(trimmed)}`);
    setShowSearchSuggestions(false);
    inputRef.current?.blur();
    mobileInputRef.current?.blur();
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSearchSubmit(q); };
  const onSuggestionClick = (text: string) => { setQ(text); handleSearchSubmit(text); };

  const handleClear = () => {
    setQ("");
    setShowSearchSuggestions(false);
    setSuggestions([]);
    inputRef.current?.focus();
    if (location.pathname === "/") navigate("/");
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("search_history");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = getCombinedSuggestions();
    if (e.key === "ArrowDown") { e.preventDefault(); setShowSearchSuggestions(true); setSelectedIndex(i => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && selectedIndex >= 0) { e.preventDefault(); onSuggestionClick(list[selectedIndex].text); }
    else if (e.key === "Escape") { setShowSearchSuggestions(false); inputRef.current?.blur(); }
  };

  const handleVoiceSearch = () => {
    if (!voiceSupported) { alert("Voice search is not supported in your browser."); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
    else { try { recognitionRef.current?.start(); setIsListening(true); } catch { setIsListening(false); } }
  };

  // Close dropdown + auth gate in one helper
  const createAction = (action: () => void) => {
    setOpenCreate(false);
    if (!user) { setShowLoginModal(true); return; }
    action();
  };

  const closeSidebar = () => {
    setOpenSidebar(false);
    menuButtonRef.current?.focus();
  };

  const combinedSuggestions = getCombinedSuggestions();
  const suggestionsOpen = showSearchSuggestions && combinedSuggestions.length > 0 && !isListening;

  return (
    <>
      <BirthdayConfetti />

      {/* ── Slide-in sidebar ─────────────────── */}
      <AnimatePresence>
        {openSidebar && (
          <>
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
              onClick={closeSidebar}
            />
            {/* [A7] Labelled modal dialog */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-black/95 backdrop-blur-xl border-r border-red-500/20 z-50 overflow-y-auto shadow-[0_0_30px_rgba(239,68,68,0.3)]"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5" style={{ minHeight: "40px" }}>
                    <AirStreamXLogo size={34} />
                    <div className="flex items-start gap-1">
                      <span className="font-extrabold text-[1.1rem] leading-none tracking-tight">
                        <span className="text-white">Air</span>
                        <span className="text-red-400">Stream</span>
                        <span className="text-red-400 italic">X</span>
                      </span>
                      {countryCode && (
                        <span className="inline-flex flex-shrink-0 -mt-1" title="Your detected region">
                          <CountryFlagIcon code={countryCode} className="w-3.5 h-2.5 rounded-[2px] ring-1 ring-white/25" />
                        </span>
                      )}
                    </div>
                  </div>
                  {/* [A2] labelled; autoFocus moves focus into the dialog */}
                  <button
                    type="button"
                    autoFocus
                    onClick={closeSidebar}
                    aria-label="Close menu"
                    className="p-1 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <X aria-hidden="true" className="w-5 h-5 text-red-400" />
                  </button>
                </div>

                <nav aria-label="Main" className="space-y-1">
                  {SIDEBAR_LINKS.map(link => (
                    <SidebarItem
                      key={link.to}
                      icon={link.icon}
                      label={link.label}
                      to={link.to}
                      onNavigate={() => setOpenSidebar(false)}
                    />
                  ))}
                </nav>

                {/* Compact footer links, YouTube-style */}
                <div className="px-4 pt-4 mt-2 border-t border-white/10">
                  <nav aria-label="Site information" className="flex flex-wrap gap-x-3 gap-y-2 mb-4">
                    {FOOTER_LINKS.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setOpenSidebar(false)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                  {/* [A9] gray-600 (2.7:1) → gray-400; 11px → text-xs */}
                  <p className="text-xs text-gray-400 pb-2">
                    © {new Date().getFullYear()} AirStreamX
                  </p>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Header bar ───────────────────────── */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-all ${theme === "neon"
          ? "bg-black/80 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
          : "bg-zinc-900/75 border-white/[0.15] shadow-[0_4px_20px_rgba(255,255,255,0.06)]"
          }`}
      >
        {theme !== "neon" && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at top left, rgba(255,255,255,0.1), transparent 70%)" }}
          />
        )}
        <div className="relative w-full px-2.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-start gap-1.5 sm:gap-2 md:gap-4">
          {/* Menu button */}
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-expanded={openSidebar}
            onClick={() => setOpenSidebar(true)}
            className="p-1.5 sm:p-2 rounded-full hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95 flex-shrink-0"
          >
            <Menu aria-hidden="true" className="w-5 h-5" />
          </button>

          {/* Logo */}
          <a
            href="/"
            aria-label="AirStreamX home"
            className="flex items-center gap-1.5 sm:gap-2.5 hover:opacity-90 transition-opacity group flex-shrink-0 min-w-0"
          >
            <span className="sm:hidden">
              <AirStreamXLogo size={30} />
            </span>
            <span className="hidden sm:inline-flex">
              <AirStreamXLogo size={36} />
            </span>
            <div className="flex items-start gap-1 sm:gap-1.5 flex-shrink-0">
              <span className="font-extrabold text-[0.8rem] sm:text-[1.2rem] leading-none tracking-tight whitespace-nowrap">
                <span className="text-white">Air</span>
                <span className="text-red-400">Stream</span>
                <span className="text-red-400 italic">X</span>
              </span>
              {countryCode && (
                <span
                  className="inline-flex flex-shrink-0 -mt-1 sm:-mt-1.5"
                  title="Your detected region"
                >
                  <CountryFlagIcon
                    code={countryCode}
                    className="w-3.5 h-2.5 sm:w-4 sm:h-3 rounded-[2px] ring-1 ring-white/25"
                  />
                </span>
              )}
            </div>
          </a>

          {/* For Creators */}
          <Link
            to="/how-it-works?tab=creator"
            className="hidden lg:inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-red-300 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            For Creators
          </Link>

          {/* Search bar (desktop) */}
          <div className="hidden md:flex md:flex-1 min-w-0 items-center gap-2" ref={searchRef}>
            <div className="relative w-full max-w-full md:max-w-2xl">
              <form role="search" onSubmit={onSubmit}>
                <div className={`flex items-center transition-all ${searchFocused ? "ring-2 ring-red-500 shadow-lg shadow-red-500/30" : ""} rounded-full overflow-hidden`}>
                  <SearchIcon aria-hidden="true" className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                  {/* [A4] labelled combobox */}
                  <input
                    ref={inputRef}
                    type="search"
                    role="combobox"
                    aria-label="Search videos"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsOpen}
                    aria-controls={suggestionsId}
                    aria-activedescendant={suggestionsOpen && selectedIndex >= 0 ? optionId(selectedIndex) : undefined}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onFocus={() => { setSearchFocused(true); setShowSearchSuggestions(true); }}
                    onBlur={() => setSearchFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? "Listening…" : "Search"}
                    className="flex-1 h-10 pl-11 pr-4 text-sm bg-[#0F0F0F]/50 border border-gray-700 rounded-l-full focus:outline-none placeholder:text-gray-400 focus:border-red-500/50 transition-all"
                    disabled={isListening}
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="absolute right-24 pointer-events-none" role="status" aria-label="Loading suggestions">
                      <Loader2 aria-hidden="true" size={16} className="text-gray-400 animate-spin" />
                    </div>
                  )}
                  {q && !isListening && (
                    <button
                      type="button"
                      onClick={handleClear}
                      aria-label="Clear search"
                      className="absolute right-20 p-1 hover:bg-white/10 rounded-full transition"
                    >
                      <X aria-hidden="true" size={16} className="text-gray-400" />
                    </button>
                  )}
                  <button type="submit" aria-label="Search" className="h-10 px-5 flex items-center justify-center bg-[#212121]/50 border border-l-0 border-gray-700 rounded-r-full hover:bg-red-600 hover:border-red-600 transition-all group">
                    <SearchIcon aria-hidden="true" className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </form>

              {/* Listening indicator */}
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    role="status"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#0F0F0F]/95 backdrop-blur-xl border border-red-500/20 rounded-lg px-4 py-2 shadow-lg z-50"
                  >
                    <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                      <div className="flex gap-1" aria-hidden="true">
                        {[0, 0.1, 0.2].map(delay => (
                          <motion.div
                            key={delay}
                            animate={{ height: [4, 12, 4] }}
                            transition={{ repeat: Infinity, duration: 0.6, delay }}
                            className="w-1 bg-red-500 rounded-full"
                          />
                        ))}
                      </div>
                      <span className="text-sm text-red-400">Listening…</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Search suggestions dropdown */}
              <AnimatePresence>
                {suggestionsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-[#212121] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    {!q && searchHistory.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-xs text-gray-400 font-medium">Recent searches</span>
                        <button type="button" onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 transition">Clear all</button>
                      </div>
                    )}
                    <div
                      id={suggestionsId}
                      role="listbox"
                      aria-label={!q ? (searchHistory.length ? "Recent searches" : "Trending searches") : "Search suggestions"}
                      className="max-h-[400px] overflow-y-auto"
                    >
                      {combinedSuggestions.map((s, i) => (
                        <button
                          type="button"
                          id={optionId(i)}
                          role="option"
                          aria-selected={selectedIndex === i}
                          tabIndex={-1}
                          key={`${s.type}-${s.text}-${i}`}
                          onClick={() => onSuggestionClick(s.text)}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${selectedIndex === i ? "bg-white/10" : "hover:bg-white/5"}`}
                        >
                          <span className="flex-shrink-0 text-gray-400" aria-hidden="true">
                            {s.type === "history" && <Clock size={18} />}
                            {s.type === "trending" && <TrendingUp size={18} />}
                            {s.type === "suggestion" && <SearchIcon size={18} />}
                          </span>
                          <span className="flex-1 text-white truncate text-sm">{s.text}</span>
                          <ArrowRight aria-hidden="true" size={16} className="text-gray-400 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                    {!q && searchHistory.length === 0 && (
                      <div className="px-4 py-2 border-t border-gray-700">
                        <span className="text-xs text-gray-400">🔥 Trending searches</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice search */}
            <button
              type="button"
              onClick={handleVoiceSearch}
              disabled={!voiceSupported}
              aria-label={isListening ? "Stop listening" : "Voice search"}
              aria-pressed={isListening}
              className={`flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-all group ${isListening
                ? "bg-red-600 shadow-lg shadow-red-500/50 animate-pulse"
                : voiceSupported
                  ? "bg-[#212121]/50 hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/50"
                  : "bg-[#212121]/30 cursor-not-allowed opacity-50"
                }`}
            >
              {isListening
                ? <MicOff aria-hidden="true" className="w-5 h-5 text-white" />
                : <Mic aria-hidden="true" className={`w-5 h-5 transition-colors ${voiceSupported ? "text-gray-300 group-hover:text-white" : "text-gray-600"}`} />}
            </button>
          </div>

          {/* ── Right actions ──────────────────────── */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* + Create dropdown */}
            <div className="relative" ref={createRef}>
              {/* [A1] accessible name on mobile + state; [A9] red-600 for 4.8:1 contrast */}
              <button
                type="button"
                onClick={() => setOpenCreate(prev => !prev)}
                aria-label="Create"
                aria-expanded={openCreate}
                aria-controls={createMenuId}
                className={`ml-auto flex items-center gap-1.5 px-2.5 sm:px-4 h-8 sm:h-9 rounded-full text-white text-sm font-medium transition-all hover:scale-105 active:scale-95 justify-center ${openCreate
                  ? "bg-red-700 shadow-lg shadow-red-500/40"
                  : "bg-red-600 hover:shadow-lg hover:shadow-red-500/40"
                  }`}
              >
                {/* Plus icon rotates to × when open */}
                <Plus aria-hidden="true" className={`w-4 h-4 transition-transform duration-200 ${openCreate ? "rotate-45" : "rotate-0"}`} />
                <span className="hidden sm:inline">Create</span>
              </button>

              <AnimatePresence>
                {openCreate && (
                  <motion.div
                    id={createMenuId}
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-48 bg-[#212121]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    {/* [A9] gray-500 11px → gray-400 text-xs */}
                    <div className="px-3.5 pt-2.5 pb-1" aria-hidden="true">
                      <p className="text-xs text-gray-400 font-semibold tracking-wide">Create</p>
                    </div>

                    <div className="p-1.5">
                      {[
                        { label: "AI Clips", icon: Scissors, color: "text-violet-400", run: () => navigate("/clip-generator") },
                        { label: "Upload video", icon: Upload, color: "text-red-400", run: () => handleUploadClick() },
                        { label: "Create post", icon: FileText, color: "text-blue-400", run: () => setShowCreatePostModal(true) },
                        { label: "Go Live", icon: Radio, color: "text-red-400", run: () => navigate("/go-live") },
                      ].map(item => (
                        <button
                          type="button"
                          key={item.label}
                          onClick={() => createAction(item.run)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 focus-visible:bg-white/5 transition-colors text-left"
                        >
                          <span aria-hidden="true" className="w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.06] flex-shrink-0">
                            <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                          </span>
                          <span className="text-sm font-medium text-white">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              {/* [A3] exposes open/closed state */}
              <button
                type="button"
                onClick={() => setOpenNotifications(!openNotifications)}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                aria-expanded={openNotifications}
                aria-controls={notifPanelId}
                className="relative h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-white/10 border border-white/25 text-white hover:bg-white/20 hover:border-white/50 transition-all hover:scale-110 active:scale-95"
              >
                <Bell aria-hidden="true" className="w-5 h-5 text-white" />
                {unreadCount > 0 && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-600 text-white text-[0.625rem] font-bold rounded-full flex items-center justify-center border-2 border-black px-0.5 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {openNotifications && (
                  <motion.div
                    id={notifPanelId}
                    role="region"
                    aria-label="Notifications"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-[#0F0F0F]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-4 border-b border-red-500/20">
                      <h3 className="font-semibold">Notifications</h3>
                      <div className="flex items-center gap-3">
                        {notifications.some(n => !n.read) && (
                          <button
                            type="button"
                            onClick={() => notifications.forEach(n => markAsRead(n.id))}
                            className="text-xs text-gray-400 hover:text-red-300 transition-colors"
                          >
                            Mark all read
                          </button>
                        )}
                        <button type="button" onClick={clearAllNotifications} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear All</button>
                      </div>
                    </div>
                    <ul className="max-h-96 overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map(n => (
                          <li key={n.id}>
                            {/* [A8] real button instead of clickable div */}
                            <button
                              type="button"
                              onClick={() => {
                                markAsRead(n.id);
                                if (n.href) { navigate(n.href); setOpenNotifications(false); }
                              }}
                              className={`w-full text-left p-4 border-b border-white/5 transition-all ${n.href ? "cursor-pointer hover:bg-red-500/5" : "cursor-default"} ${!n.read ? "bg-red-500/10 border-l-2 border-l-red-500" : ""}`}
                            >
                              <span className="flex items-start gap-3">
                                <span aria-hidden="true" className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${n.type === "success" ? "bg-red-500" :
                                  n.type === "error" ? "bg-red-500" :
                                    n.type === "warning" ? "bg-yellow-500" :
                                      "bg-red-400"
                                  } ${n.read ? "opacity-30" : ""}`} />
                                <span className="flex-1 min-w-0">
                                  {!n.read && <span className="sr-only">Unread: </span>}
                                  <span className="block text-sm font-medium text-white leading-snug">{n.title}</span>
                                  <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">{n.message}</span>
                                  <span className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-400">{n.time}</span>
                                    {n.href && <span className="text-xs text-red-400 hover:text-red-300">Watch now →</span>}
                                  </span>
                                </span>
                              </span>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="p-8 text-center text-gray-400">
                          <Bell aria-hidden="true" className="w-12 h-12 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">No notifications</p>
                        </li>
                      )}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              {user ? (
                <>
                  {/* [A3] named + exposes state */}
                  <button
                    type="button"
                    onClick={() => setOpenMenu(!openMenu)}
                    aria-label="Account menu"
                    aria-expanded={openMenu}
                    aria-controls={accountMenuId}
                    className="relative hover:ring-2 ring-red-500 rounded-full transition-all hover:scale-105 active:scale-95 p-1"
                  >
                    {user.photoURL ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={user.photoURL}
                        alt=""
                        className="w-8 h-8 rounded-full border-2 border-red-500/30 object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }}
                      />
                    ) : null}
                    <span aria-hidden="true" className={`w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-500/30 flex items-center justify-center text-white text-sm font-bold ${user.photoURL ? "hidden" : ""}`}>
                      {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </span>
                    <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 border-2 border-black rounded-full" />
                  </button>
                  <AnimatePresence>
                    {openMenu && (
                      <motion.div
                        id={accountMenuId}
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-64 bg-[#0F0F0F]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl overflow-hidden z-50"
                      >
                        <div className="p-4 border-b border-red-500/20 flex items-center gap-3">
                          {user.photoURL ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={user.photoURL}
                              alt=""
                              className="w-12 h-12 rounded-full border-2 border-red-500/30 object-cover flex-shrink-0"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }}
                            />
                          ) : null}
                          <div aria-hidden="true" className={`w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-500/30 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${user.photoURL ? "hidden" : ""}`}>
                            {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{user.displayName ?? "User"}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email}</p>
                          </div>
                        </div>
                        <div className="p-2">
                          <MenuItem icon={User} label="Your Channel" onClick={() => {
                            const handle = userHandle || user.email!.split("@")[0];
                            navigate(`/@${handle}`);
                            setOpenMenu(false);
                          }} />
                          <MenuItem icon={Settings} label="Settings" onClick={() => { navigate("/settings"); setOpenMenu(false); }} />
                          <MenuItem icon={History} label="Watch History" onClick={() => { navigate("/history"); setOpenMenu(false); }} />
                          <MenuItem icon={ThumbsUp} label="Liked Videos" onClick={() => { navigate("/liked"); setOpenMenu(false); }} />
                        </div>
                        <div className="p-2 border-t border-red-500/20">
                          <button
                            type="button"
                            onClick={logout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all"
                          >
                            <LogOut aria-hidden="true" className="w-4 h-4" />
                            <span>Logout</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                /* [A9] solid red-600 for 4.8:1 contrast with white text */
                <button
                  type="button"
                  onClick={login}
                  className="px-3 sm:px-5 h-8 sm:h-9 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                >
                  Sign in
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Mobile search bar — [A5] own ref, [A4] labelled */}
      <div className="md:hidden px-4 py-2 bg-black/90 border-b border-white/10">
        <form role="search" onSubmit={onSubmit} className="flex items-center bg-[#0F0F0F]/50 border border-gray-700 rounded-full px-4 h-10 focus-within:ring-2 focus-within:ring-red-500">
          <SearchIcon aria-hidden="true" className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
          <input
            ref={mobileInputRef}
            type="search"
            aria-label="Search videos"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search"
            enterKeyHint="search"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
        </form>
      </div>
      {/* Login modal */}
      {showLoginModal && (
        <LoginRequiredModal
          onClose={() => setShowLoginModal(false)}
          onLogin={() => { setShowLoginModal(false); login(); }}
        />
      )}

      {/* Create Post modal */}
      {showCreatePostModal && (
        <CreatePostModal
          onClose={() => setShowCreatePostModal(false)}
          onPosted={() => setShowCreatePostModal(false)}
        />
      )}
    </>
  );
}
