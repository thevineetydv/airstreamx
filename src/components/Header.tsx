// ============================================================
// Header.tsx — VERSION 2.0  FIXED
//
// Fix applied:
//   [1] "+ Create" dropdown was always open — no toggle state existed.
//       Added openCreate state + createRef for click-outside detection.
//   [2] Dropdown now closes on outside click (same pattern as user menu).
//   [3] Dropdown closes when a menu item is clicked.
//   [4] Styling polished to match the rest of the header (glass morphism,
//       red accent, motion animations — consistent with notifications menu).
//   [5] "Go Live" and "Upload" items now respect auth (show login modal).
// ============================================================

import React, { useEffect, useState, useRef, useId } from "react";
import {
  Menu, Mic, MicOff, Search as SearchIcon, Upload,
  Loader2, Bell, History, Settings, User, LogOut, X,
  TrendingUp, Clock, Zap, Home, Library, ThumbsUp, PlaySquare,
  Radio, ArrowRight, Scissors, Plus,
} from "lucide-react";

// ─────────────────────────────────────────────
// Shared logo — single source of truth
// Use this EVERYWHERE: header, sidebar, favicon fallback
// ─────────────────────────────────────────────
export function AirStreamXLogo({ size = 36 }: { size?: number }) {
  // Unique per instance — this component is intentionally rendered more
  // than once at a time (e.g. the responsive mobile/desktop pair below,
  // plus the sidebar drawer copy). Without unique IDs here, every extra
  // instance collides on id="axLogoGrad"/"axLogoGlow", and the browser's
  // url(#...) reference breaks — the fill/glow silently drops, leaving
  // just the bare pause-bar rectangle instead of the full mark.
  const uid = useId().replace(/:/g, "");
  const gradId = `axLogoGrad-${uid}`;
  const glowId = `axLogoGlow-${uid}`;

  return (
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
  );
}
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoginRequiredModal } from "./LoginRequiredModal";

type SpeechRecognition = any;
import { API_URL } from "../utils/constants";
import { useNotifications } from "../context/NotificationContext";


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

function SidebarItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-left group"
    >
      <Icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-left text-sm group"
    >
      <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
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

/**
 * CountryFlagIcon — small inline SVG flag, NOT an emoji.
 *
 * Flag emoji rely on the OS font to combine two "regional indicator"
 * characters into a flag glyph — Windows (even recent versions, depending
 * on Chrome's font fallback) frequently fails this and just shows the two
 * raw letters instead (that's why "IN" showed up twice — the emoji itself
 * rendered as literal text "IN"). An inline SVG has no such dependency:
 * it looks identical on every OS and browser.
 *
 * Add more `case`s here as you support more regions — falls back to a
 * neutral globe glyph for anything not explicitly drawn.
 */
function CountryFlagIcon({ code, className = "w-4 h-3" }: { code: string; className?: string }) {
  switch (code.toUpperCase()) {
    case "IN":
      return (
        <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
          <rect width="24" height="16" fill="#0a0000" />
          <rect width="24" height="5.33" y="0" fill="#FF9933" />
          <rect width="24" height="5.33" y="5.33" fill="#FFFFFF" />
          <rect width="24" height="5.33" y="10.67" fill="#138808" />
          <circle cx="12" cy="8" r="2.1" fill="none" stroke="#000080" strokeWidth="0.35" />
          <circle cx="12" cy="8" r="0.4" fill="#000080" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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

  // Dropdown visibility
  const [openMenu, setOpenMenu] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [openSidebar, setOpenSidebar] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);  // [FIX 1] was missing entirely
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
  const searchRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);   // [FIX 2] ref for click-outside
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  // [FIX 2] createRef added so "+ Create" also closes on outside click
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
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && selectedIndex >= 0) { e.preventDefault(); onSuggestionClick(list[selectedIndex].text); }
    else if (e.key === "Escape") { setShowSearchSuggestions(false); inputRef.current?.blur(); }
  };

  const handleVoiceSearch = () => {
    if (!voiceSupported) { alert("Voice search is not supported in your browser."); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }
    else { try { recognitionRef.current?.start(); setIsListening(true); } catch { setIsListening(false); } }
  };

  // [FIX 3] Close dropdown + auth gate in one helper
  const createAction = (action: () => void) => {
    setOpenCreate(false);
    if (!user) { setShowLoginModal(true); return; }
    action();
  };

  const combinedSuggestions = getCombinedSuggestions();

  return (
    <>
      {/* ── Slide-in sidebar ─────────────────── */}
      <AnimatePresence>
        {openSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
              onClick={() => setOpenSidebar(false)}
            />
            <motion.div
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
                  <button onClick={() => setOpenSidebar(false)} className="p-1 hover:bg-red-500/10 rounded-lg transition-all">
                    <X className="w-5 h-5 text-red-400" />
                  </button>
                </div>

                <nav className="space-y-1">
<SidebarItem icon={Home}      label="Home"        onClick={() => { navigate("/");          setOpenSidebar(false); }} />
<SidebarItem icon={Zap}       label="Shorts"      onClick={() => { navigate("/shorts");    setOpenSidebar(false); }} />
<SidebarItem icon={TrendingUp} label="Trending"   onClick={() => { navigate("/trending");  setOpenSidebar(false); }} />
<SidebarItem icon={Library}   label="Library"     onClick={() => { navigate("/library");   setOpenSidebar(false); }} />
<SidebarItem icon={History}   label="History"     onClick={() => { navigate("/history");   setOpenSidebar(false); }} />
<SidebarItem icon={ThumbsUp}  label="Liked Videos" onClick={() => { navigate("/liked");   setOpenSidebar(false); }} />
<SidebarItem icon={PlaySquare} label="Watch Later" onClick={() => { navigate("/watch-later"); setOpenSidebar(false); }} />
                </nav>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Header bar ───────────────────────── */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-all ${theme === "neon"
          ? "bg-black/80 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
          : "bg-black/90 border-white/10"
          }`}
      >
<div className="w-full px-2.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-start gap-1.5 sm:gap-2 md:gap-4">
          {/* Menu button */}
          <button
            aria-label="Open menu"
            onClick={() => setOpenSidebar(true)}
            className="p-1.5 sm:p-2 rounded-full hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95 flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo — slightly smaller on mobile so it doesn't eat into the
              already-tight 320px budget shared with the action buttons */}
          <a href="/" className="flex items-center gap-1.5 sm:gap-2.5 hover:opacity-90 transition-opacity group flex-shrink-0 min-w-0">
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
              {/* Country badge — flag only, raised above the wordmark
                  baseline like a superscript (matches YouTube's placement).
                  Tiny footprint, safe even in the already-tight mobile
                  header budget. */}
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

          {/* Search bar */}
<div className="hidden md:block md:flex-1 min-w-0" ref={searchRef}>
            <div className="relative w-full max-w-full md:max-w-2xl">
              <form onSubmit={onSubmit}>
                <div className={`flex items-center transition-all ${searchFocused ? "ring-2 ring-red-500 shadow-lg shadow-red-500/30" : ""} rounded-full overflow-hidden`}>
                  <SearchIcon className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    onFocus={() => { setSearchFocused(true); setShowSearchSuggestions(true); }}
                    onBlur={() => setSearchFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={isListening ? "Listening…" : "Search"}
                    className="flex-1 h-10 pl-11 pr-4 text-sm bg-[#0a0000]/50 border border-gray-700 rounded-l-full focus:outline-none placeholder:text-gray-400 focus:border-red-500/50 transition-all"
                    disabled={isListening}
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="absolute right-24 pointer-events-none">
                      <Loader2 size={16} className="text-gray-400 animate-spin" />
                    </div>
                  )}
                  {q && !isListening && (
                    <button type="button" onClick={handleClear} className="absolute right-20 p-1 hover:bg-white/10 rounded-full transition">
                      <X size={16} className="text-gray-400" />
                    </button>
                  )}
                  <button type="submit" aria-label="Search" className="h-10 px-5 flex items-center justify-center bg-[#110000]/50 border border-l-0 border-gray-700 rounded-r-full hover:bg-red-600 hover:border-red-600 transition-all group">
                    <SearchIcon className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </form>

              {/* Voice search */}
              <button
                onClick={handleVoiceSearch}
                disabled={!voiceSupported}
                aria-label={isListening ? "Stop listening" : "Voice search"}
                className={`hidden md:flex absolute right-[-52px] top-0 h-10 w-10 items-center justify-center rounded-full transition-all group ${isListening
                  ? "bg-red-500 shadow-lg shadow-red-500/50 animate-pulse"
                  : voiceSupported
                    ? "bg-[#110000]/50 hover:bg-red-600 hover:shadow-lg hover:shadow-red-500/50"
                    : "bg-[#110000]/30 cursor-not-allowed opacity-50"
                  }`}
              >
                {isListening
                  ? <MicOff className="w-5 h-5 text-white" />
                  : <Mic className={`w-5 h-5 transition-colors ${voiceSupported ? "text-gray-300 group-hover:text-white" : "text-gray-600"}`} />}
              </button>

              {/* Listening indicator */}
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-lg px-4 py-2 shadow-lg z-50"
                  >
                    <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                      <div className="flex gap-1">
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
                {showSearchSuggestions && combinedSuggestions.length > 0 && !isListening && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-[#181818] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    {!q && searchHistory.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-xs text-gray-400 font-medium">Recent searches</span>
                        <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 transition">Clear all</button>
                      </div>
                    )}
                    <div className="max-h-[400px] overflow-y-auto">
                      {combinedSuggestions.map((s, i) => (
                        <button
                          key={`${s.type}-${s.text}-${i}`}
                          onClick={() => onSuggestionClick(s.text)}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${selectedIndex === i ? "bg-white/10" : "hover:bg-white/5"}`}
                        >
                          <div className="flex-shrink-0 text-gray-400">
                            {s.type === "history" && <Clock size={18} />}
                            {s.type === "trending" && <TrendingUp size={18} />}
                            {s.type === "suggestion" && <SearchIcon size={18} />}
                          </div>
                          <span className="flex-1 text-white truncate text-sm">{s.text}</span>
                          <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
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
          </div>

          {/* ── Right actions ──────────────────────── */}
<div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* + Create dropdown
                ─────────────────────────────────────────────────────────
                [FIX 1] openCreate state controls open/close
                [FIX 2] createRef enables click-outside-to-close
                [FIX 3] createAction() closes dropdown + enforces auth
                [FIX 4] Styled with glass morphism + AnimatePresence
            ───────────────────────────────────────────────────────── */}
            <div className="relative" ref={createRef}>
              <button
                onClick={() => setOpenCreate(prev => !prev)}
                className={`ml-auto flex items-center gap-1.5 px-2.5 sm:px-4 h-8 sm:h-9 rounded-full text-white text-sm font-medium transition-all hover:scale-105 active:scale-95 justify-center ${openCreate
                  ? "bg-gradient-to-r from-red-600 to-red-600 shadow-lg shadow-red-500/40"
                  : "bg-gradient-to-r from-red-500 to-red-500 hover:shadow-lg hover:shadow-red-500/40"
                  }`}
              >
                {/* Plus icon rotates to × when open */}
                <Plus className={`w-4 h-4 transition-transform duration-200 ${openCreate ? "rotate-45" : "rotate-0"}`} />
                <span className="hidden sm:inline">Create</span>
              </button>

              <AnimatePresence>
                {openCreate && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-52 bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {/* Section label */}
                    <div className="px-4 py-2.5 border-b border-white/5">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Create</p>
                    </div>

                    <div className="p-2 space-y-0.5">

                      {/* AI Clips */}
                      <button
                        onClick={() => createAction(() => navigate("/clip-generator"))}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/15 group-hover:bg-violet-500/25 transition-colors flex-shrink-0">
                          <Scissors className="w-4 h-4 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-red-400 transition-colors">AI Clips</p>
                          <p className="text-[11px] text-gray-400">Generate viral short clips</p>
                        </div>
                      </button>

                      {/* Upload Video */}
                      <button
                        onClick={() => createAction(() => handleUploadClick())}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/15 group-hover:bg-red-500/25 transition-colors flex-shrink-0">
                          <Upload className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-red-400 transition-colors">Upload video</p>
                          <p className="text-[11px] text-gray-400">Share a video</p>
                        </div>
                      </button>

                      {/* Go Live */}
                      <button
                        onClick={() => createAction(() => navigate("/go-live"))}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/15 group-hover:bg-red-500/25 transition-colors flex-shrink-0">
                          <Radio className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-red-400 transition-colors">Go Live</p>
                          <p className="text-[11px] text-gray-400">Start a live stream</p>
                        </div>
                      </button>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setOpenNotifications(!openNotifications)}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                className="relative h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-white/10 border border-white/25 text-white hover:bg-white/20 hover:border-white/50 transition-all hover:scale-110 active:scale-95"
              >
                <Bell className="w-5 h-5 text-white" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-black px-0.5 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {openNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-4 border-b border-red-500/20">
                      <h3 className="font-semibold">Notifications</h3>
                      <div className="flex items-center gap-3">
                        {notifications.some(n => !n.read) && (
                          <button
                            onClick={() => notifications.forEach(n => markAsRead(n.id))}
                            className="text-xs text-gray-400 hover:text-red-300 transition-colors"
                          >
                            Mark all read
                          </button>
                        )}
                        <button onClick={clearAllNotifications} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear All</button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onClick={() => {
                              markAsRead(n.id);
                              if (n.href) { navigate(n.href); setOpenNotifications(false); }
                            }}
                            className={`p-4 border-b border-white/5 transition-all ${n.href ? "cursor-pointer hover:bg-red-500/5" : "cursor-default"} ${!n.read ? "bg-red-500/10 border-l-2 border-l-red-500" : ""}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${n.type === "success" ? "bg-red-500" :
                                n.type === "error" ? "bg-red-500" :
                                  n.type === "warning" ? "bg-yellow-500" :
                                    "bg-red-400"
                                } ${n.read ? "opacity-30" : ""}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white leading-snug">{n.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{n.message}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-xs text-gray-400">{n.time}</p>
                                  {n.href && <span className="text-xs text-red-400 hover:text-red-300">Watch now →</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-gray-400">
                          <Bell className="w-12 h-12 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User menu */}
            <div className="relative" ref={menuRef}>
              {user ? (
                <>
                  <button
                    onClick={() => setOpenMenu(!openMenu)}
                    className="relative hover:ring-2 ring-red-500 rounded-full transition-all hover:scale-105 active:scale-95 p-1"
                  >
                    {user.photoURL ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={user.photoURL}
                        alt="Profile"
                        className="w-8 h-8 rounded-full border-2 border-red-500/30 object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }}
                      />
                    ) : null}
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-500/30 flex items-center justify-center text-white text-sm font-bold ${user.photoURL ? "hidden" : ""}`}>
                      {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 border-2 border-black rounded-full" />
                  </button>
                  <AnimatePresence>
                    {openMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-64 bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl overflow-hidden z-50"
                      >
                        <div className="p-4 border-b border-red-500/20 flex items-center gap-3">
                          {user.photoURL ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={user.photoURL}
                              alt="Profile"
                              className="w-12 h-12 rounded-full border-2 border-red-500/30 object-cover flex-shrink-0"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }}
                            />
                          ) : null}
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-500/30 flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${user.photoURL ? "hidden" : ""}`}>
                            {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{user.displayName ?? "User"}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email}</p>
                          </div>
                        </div>
                        <div className="p-2">
                          {/* Your Channel — uses channelUrl() which produces /@handle URLs */}
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
                            onClick={logout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all"
                          >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <button
                  onClick={login}
                  className="px-3 sm:px-5 h-8 sm:h-9 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-xs sm:text-sm font-medium hover:shadow-lg hover:shadow-red-500/50 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                >
                  Sign in
                </button>
              )}
            </div>

          </div>
        </div>
      </header>
{/* Mobile search bar */}
<div className="md:hidden px-4 py-2 bg-black/90 border-b border-white/10" ref={searchRef}>
  <form onSubmit={onSubmit} className="flex items-center bg-[#0a0000]/50 border border-gray-700 rounded-full px-4 h-10">
    <SearchIcon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
    <input
      ref={inputRef}
      value={q}
      onChange={e => setQ(e.target.value)}
      placeholder="Search"
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
    </>
  );
}