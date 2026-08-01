// ============================================================
// Sidebar.tsx — Desktop navigation sidebar
// ============================================================

import React from "react";
import {
  ChevronRight, Home, Zap, TrendingUp, Library, History, ThumbsUp, PlaySquare,
  type LucideProps,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

type IconComponent = React.ComponentType<LucideProps>;

interface SideItemProps {
  icon: IconComponent;
  label: string;
  to: string;
  badge?: number;
}

function SideItem({ icon: Icon, label, to, badge }: SideItemProps) {
  return (
    <li>
      <NavLink
        to={to}
        aria-label={label}
        className={({ isActive }) =>
          `group relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${isActive
            ? "bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-400 shadow-lg shadow-red-500/10 border border-red-500/30"
            : "text-gray-300 hover:bg-red-500/5 hover:text-red-400 border border-transparent"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`}>
              <Icon size={20} />
            </span>
            <span className="text-sm font-medium flex-1">{label}</span>
            {badge != null && badge > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-black text-xs font-bold rounded-full shadow-lg shadow-red-500/50">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {isActive && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-red-500 to-red-600 rounded-r-full shadow-lg shadow-red-500/50"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <ChevronRight
              className={`w-4 h-4 transition-all duration-300 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0"
                }`}
            />
          </>
        )}
      </NavLink>
    </li>
  );
}

// ─────────────────────────────────────────────
// Nav items — same set/order as Header's mobile drawer
// ─────────────────────────────────────────────

const NAV_ITEMS: { icon: IconComponent; label: string; to: string }[] = [
  { icon: Home, label: "Home", to: "/" },
  { icon: Zap, label: "Shorts", to: "/shorts" },
  { icon: TrendingUp, label: "Trending", to: "/trending" },
  { icon: Library, label: "Library", to: "/library" },
  { icon: History, label: "History", to: "/history" },
  { icon: ThumbsUp, label: "Liked Videos", to: "/liked" },
  { icon: PlaySquare, label: "Watch Later", to: "/watch-later" },
];

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface SidebarProps {
  themeCls: { panel: string };
}

export default function Sidebar({ themeCls }: SidebarProps) {
  return (
    <aside
      className={`hidden md:block w-64 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto sidebar-scroll ${themeCls.panel}`}
    >
      <nav className="p-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <SideItem key={item.to} icon={item.icon} label={item.label} to={item.to} />
          ))}
        </ul>
      </nav>

      <style>{`
        .sidebar-scroll::-webkit-scrollbar       { width: 6px; }
        .sidebar-scroll::-webkit-scrollbar-track  { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb  { background: rgba(239,68,68,0.3); border-radius: 10px; }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(239,68,68,0.5); }
      `}</style>
    </aside>
  );
}