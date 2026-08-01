// ============================================================
// LiveStreamsBrowser.tsx — Browse and join active live streams
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Eye, Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "../utils/constants";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface LiveStream {
  id: string;
  title: string;
  description: string;
  username: string;
  thumbnail?: string;
  viewers: number;
  startedAt: string;
  status: "live" | "starting" | "ended";
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTimeAgo(timestamp: string): string {
  try {
    const diffMin = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  } catch {
    return "Recently";
  }
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const LiveStreamsBrowser: React.FC = () => {
  const navigate = useNavigate();

  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStreams = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/live/active`);
      if (!res.ok) throw new Error("Failed to fetch live streams");
      const data = await res.json();
      setStreams(data.streams ?? []);
      setError(null);
    } catch {
      setError("Failed to load live streams. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 30_000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  // ── Loading ──────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading live streams…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <p className="text-white font-semibold mb-2">{error}</p>
          <button
            onClick={() => fetchStreams()}
            className="px-6 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────
  if (streams.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <Radio size={64} className="mx-auto mb-6 opacity-20 text-gray-400" />
          <h3 className="text-2xl font-bold text-white mb-2">No Live Streams</h3>
          <p className="text-gray-400 mb-6">
            No one is streaming right now. Check back later or be the first to go live!
          </p>
          <button
            onClick={() => navigate("/go-live")}
            className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-red-500/50 transition-all"
          >
            Start Your Stream
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Live Now</h2>
          <p className="text-gray-400 text-sm">
            {streams.length} {streams.length === 1 ? "stream" : "streams"} active
          </p>
        </div>
        <button
          onClick={() => fetchStreams(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          <span className="text-sm font-medium text-white">Refresh</span>
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {streams.map((stream, i) => (
          <motion.div
            key={stream.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <button
              onClick={() => navigate(`/live/watch/${stream.id}`)}
              className="group relative bg-[#0a0000]/50 rounded-2xl overflow-hidden border border-white/10 hover:border-red-500/50 transition-all hover:scale-105 w-full text-left"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-gradient-to-br from-red-500/20 to-red-700/20">
                {stream.thumbnail ? (
                  <img src={stream.thumbnail} alt={stream.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Radio size={48} className="text-red-500/30" />
                  </div>
                )}
                {/* Live badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg">
                  <Radio size={12} className="animate-pulse" /> LIVE
                </div>
                {/* Viewer count */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm text-white text-xs font-semibold rounded-full">
                  <Eye size={12} /> {stream.viewers.toLocaleString()}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="text-white font-bold">Watch Now</div>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-white font-bold mb-2 line-clamp-2 group-hover:text-red-500 transition-colors">
                  {stream.title}
                </h3>
                {stream.description && (
                  <p className="text-gray-400 text-sm mb-3 line-clamp-1">{stream.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-xs font-bold">
                      {stream.username?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    <span className="font-medium">{stream.username}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTimeAgo(stream.startedAt)}</span>
                </div>
              </div>
            </button>
          </motion.div>
        ))}
      </div>

      {/* Go Live CTA */}
      <div className="mt-12 text-center bg-gradient-to-br from-red-500/10 to-red-700/10 border border-red-500/20 rounded-2xl p-8">
        <Radio size={48} className="mx-auto mb-4 text-red-500" />
        <h3 className="text-xl font-bold text-white mb-2">Want to go live?</h3>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">Share your passion with the world.</p>
        <button
          onClick={() => navigate("/go-live")}
          className="px-8 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-red-500/50 transition-all inline-flex items-center gap-2"
        >
          <Radio size={20} /> Start Broadcasting
        </button>
      </div>
    </div>
  );
};

export default LiveStreamsBrowser;

