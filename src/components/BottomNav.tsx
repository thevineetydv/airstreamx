// src/components/BottomNav.tsx
import { Link, useLocation } from "react-router-dom";

interface BottomNavProps {
  onUploadClick: () => void;
}

export default function BottomNav({ onUploadClick }: BottomNavProps) {
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden z-50"
      style={{
        background: "rgba(8,8,8,0.97)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around px-2 h-16">

        {/* ── HOME ── */}
        <Link to="/" className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-all active:scale-90">
          <svg
            className={`w-6 h-6 transition-colors ${isActive("/") ? "text-red-500" : "text-gray-400"}`}
            fill={isActive("/") ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className={`text-[10px] font-medium ${isActive("/") ? "text-red-500" : "text-gray-400"}`}>
            Home
          </span>
        </Link>

        {/* ── SHORTS ── */}
        <Link to="/shorts" className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-all active:scale-90">
          <svg
            className={`w-6 h-6 transition-colors ${isActive("/shorts") ? "text-red-500" : "text-gray-400"}`}
            fill={isActive("/shorts") ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className={`text-[10px] font-medium ${isActive("/shorts") ? "text-red-500" : "text-gray-400"}`}>
            Shorts
          </span>
        </Link>

        {/* ── UPLOAD (centre pill button) ── */}
        <div className="flex flex-col items-center flex-1 py-2">
          <button
            onClick={onUploadClick}
            className="w-12 h-12 -mt-5 rounded-2xl flex items-center justify-center shadow-xl active:scale-90 transition-all"
            style={{
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              boxShadow: "0 4px 20px rgba(239,68,68,0.5)",
            }}
            aria-label="Upload video"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* ── LIVE ── */}
        <Link to="/live" className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-all active:scale-90">
          <div className="relative">
            <svg
              className={`w-6 h-6 transition-colors ${isActive("/live") ? "text-red-500" : "text-gray-400"}`}
              fill={isActive("/live") ? "currentColor" : "none"}
              stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01" />
            </svg>
            {/* Live dot */}
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </div>
          <span className={`text-[10px] font-medium ${isActive("/live") ? "text-red-500" : "text-gray-400"}`}>
            Live
          </span>
        </Link>

        {/* ── PROFILE / DASHBOARD ── */}
        <Link to="/dashboard" className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-all active:scale-90">
          <svg
            className={`w-6 h-6 transition-colors ${isActive("/dashboard") ? "text-red-500" : "text-gray-400"}`}
            fill={isActive("/dashboard") ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className={`text-[10px] font-medium ${isActive("/dashboard") ? "text-red-500" : "text-gray-400"}`}>
            Profile
          </span>
        </Link>

      </div>
    </nav>
  );
}
