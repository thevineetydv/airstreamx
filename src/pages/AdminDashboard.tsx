/**
 * AirStreamX — Admin Dashboard
 * Full CRUD for videos + Featured spot management
 * Route: /admin  (add to App.tsx routes)
 *
 * Access: Only emails listed in admin_emails table can use this.
 * The backend verifyFirebaseToken middleware enforces this on every
 * mutating request. The frontend does a quick /api/admin/check on
 * mount and redirects non-admins away immediately.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "../utils/constants";

/* ─── Types ─────────────────────────────────────────────────── */

interface Video {
  id: number;
  public_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  views: number;
  likes: number;
  duration: number;
  thumbnail: string;
  uploader_email: string;
  channel_name: string;
  created_at: string;
}

interface FeaturedEntry {
  id: number;
  video_id: number;
  title: string;
  featured_by: string;
  starts_at: string;
  ends_at: string;
  note: string;
  is_active: boolean;
}

type Tab = "videos" | "featured";
type SortKey = "created_at" | "views" | "likes" | "title";

/* ─── Helpers ────────────────────────────────────────────────── */

function fmtViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtDuration(s?: number) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ─── Auth token helper ──────────────────────────────────────── */

async function getToken(): Promise<string | null> {
  try {
    return await getAuth().currentUser?.getIdToken() ?? null;
  } catch {
    return null;
  }
}

/* ─── Toast ──────────────────────────────────────────────────── */

function Toast({ msg, type, onClose }: { msg: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-xl text-sm font-medium shadow-2xl flex items-center gap-2 ${
        type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? "✅" : "❌"} {msg}
    </motion.div>
  );
}

/* ─── Confirm Modal ──────────────────────────────────────────── */

function ConfirmModal({
  message, onConfirm, onCancel, danger = true,
}: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-white text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Edit Video Modal ───────────────────────────────────────── */

function EditModal({
  video, onSave, onClose,
}: {
  video: Video; onSave: (v: Partial<Video>) => Promise<void>; onClose: () => void;
}) {
  const [title, setTitle] = useState(video.title || "");
  const [description, setDescription] = useState(video.description || "");
  const [category, setCategory] = useState(video.category || "");
  const [saving, setSaving] = useState(false);

  const CATEGORIES = [
    "Music", "Gaming", "News", "Sports", "Movies",
    "Tech", "Podcasts", "Education", "Comedy", "Lifestyle", "Travel",
  ];

  const handleSave = async () => {
    setSaving(true);
    await onSave({ title, description, category });
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 20 }}
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Edit Video</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Thumbnail preview */}
        {video.thumbnail && (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full aspect-video object-cover rounded-xl mb-4 opacity-80"
          />
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
              maxLength={255}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none resize-none"
              maxLength={5000}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="">— Select —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-sm font-medium transition"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Featured Modal ─────────────────────────────────────────── */

function FeaturedModal({
  video, onSet, onClose,
}: {
  video: Video; onSet: (days: number, note: string) => Promise<void>; onClose: () => void;
}) {
  const [days, setDays] = useState(7);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 20 }}
        className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-white">⭐ Set as Featured</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          This video will appear as the hero on the homepage.
        </p>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-5">
          <p className="text-yellow-400 text-xs font-medium line-clamp-2">{video.title}</p>
          <p className="text-yellow-600 text-xs mt-0.5">{video.uploader_email}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-2 block">
              Duration: <span className="text-white font-medium">{days} days</span>
            </label>
            <input
              type="range" min={1} max={30} value={days}
              onChange={e => setDays(parseInt(e.target.value))}
              className="w-full accent-yellow-400"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>1 day</span><span>30 days</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Internal note (optional)
            </label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Paid promotion — Creator X"
              className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-400 outline-none"
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/10 text-sm transition hover:bg-white/20">
            Cancel
          </button>
          <button
            onClick={async () => { setSaving(true); await onSet(days, note); setSaving(false); }}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? "Setting…" : `⭐ Feature for ${days} days`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── MAIN DASHBOARD ─────────────────────────────────────────── */

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("videos");

  // Auth state
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Videos state
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Featured state
  const [featuredList, setFeaturedList] = useState<FeaturedEntry[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  // Modals
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [featuringVideo, setFeaturingVideo] = useState<Video | null>(null);
  const [removingFeaturedId, setRemovingFeaturedId] = useState<number | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
  }, []);

  /* ── Admin check on mount ── */
  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(async user => {
      if (!user) { navigate("/"); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_URL}/api/admin/check`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIsAdmin(true);
        } else {
          showToast("Access denied — not an admin", "error");
          setTimeout(() => navigate("/"), 2000);
        }
      } catch {
        navigate("/");
      } finally {
        setChecking(false);
      }
    });
    return unsub;
  }, [navigate, showToast]);

  /* ── Load videos ── */
  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/admin/videos?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setVideos(data.videos || []);
    } catch {
      showToast("Failed to load videos", "error");
    } finally {
      setLoadingVideos(false);
    }
  }, [showToast]);

  /* ── Load featured list ── */
  const loadFeatured = useCallback(async () => {
    setLoadingFeatured(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/featured/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFeaturedList(data.featured || []);
    } catch {
      showToast("Failed to load featured list", "error");
    } finally {
      setLoadingFeatured(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isAdmin) return;
    loadVideos();
    loadFeatured();
  }, [isAdmin, loadVideos, loadFeatured]);

  /* ── Filter + Sort ── */
  const filteredVideos = videos
    .filter(v =>
      !search ||
      v.title?.toLowerCase().includes(search.toLowerCase()) ||
      v.uploader_email?.toLowerCase().includes(search.toLowerCase()) ||
      v.channel_name?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 text-gray-500">
      {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
    </span>
  );

  /* ── Selection ── */
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVideos.map(v => v.id)));
    }
  };

  /* ── CRUD Actions ── */

  // Update
  const handleUpdate = async (id: number, updates: Partial<Video>) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/admin/videos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
      setVideos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
      setEditingVideo(null);
      showToast("Video updated successfully");
    } catch {
      showToast("Failed to update video", "error");
    }
  };

  // Delete single
  const handleDelete = async (id: number) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/admin/videos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      setVideos(prev => prev.filter(v => v.id !== id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      setDeletingId(null);
      showToast("Video deleted");
    } catch {
      showToast("Failed to delete video", "error");
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    try {
      const token = await getToken();
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id =>
        fetch(`${API_URL}/api/admin/videos/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })
      ));
      setVideos(prev => prev.filter(v => !selectedIds.has(v.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      showToast(`${ids.length} videos deleted`);
    } catch {
      showToast("Bulk delete failed", "error");
    }
  };

  // Set featured
  const handleSetFeatured = async (videoId: number, days: number, note: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/featured`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ video_id: videoId, days, note }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeaturingVideo(null);
      await loadFeatured();
      showToast(`Video featured for ${days} days ⭐`);
    } catch {
      showToast("Failed to set featured", "error");
    }
  };

  // Remove featured
  const handleRemoveFeatured = async (featuredId: number) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/api/featured/${featuredId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      setRemovingFeaturedId(null);
      await loadFeatured();
      showToast("Featured spot removed");
    } catch {
      showToast("Failed to remove featured", "error");
    }
  };

  /* ── Loading / Access denied ── */
  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
      </div>
    );
  }

  if (!isAdmin) return null;

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Header */}
      <div className="border-b border-white/5 bg-[#111] px-4 sm:px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-gray-400 hover:text-white transition text-sm">← Home</Link>
        <div className="w-px h-5 bg-white/10" />
        <h1 className="text-sm font-semibold text-white">Admin Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{getAuth().currentUser?.email}</span>
          <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/30">
            ADMIN
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 py-4">
        {[
          { label: "Total Videos", value: videos.length, color: "text-white" },
          { label: "Total Views", value: fmtViews(videos.reduce((s, v) => s + (v.views || 0), 0)), color: "text-blue-400" },
          { label: "Ready", value: videos.filter(v => v.status === "ready").length, color: "text-emerald-400" },
          { label: "Active Featured", value: featuredList.filter(f => f.is_active).length, color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-[#141414] border border-white/5 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-6 flex gap-1 border-b border-white/5">
        {(["videos", "featured"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              tab === t
                ? "border-red-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "featured" ? "⭐ Featured" : "🎬 Videos"}
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6 py-4">

        {/* ══ VIDEOS TAB ══ */}
        {tab === "videos" && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                placeholder="Search by title, email, channel…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-500 outline-none"
              />
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded-lg text-sm transition"
                  >
                    Delete {selectedIds.size} selected
                  </motion.button>
                )}
                <button
                  onClick={loadVideos}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition"
                  title="Refresh"
                >
                  ↺
                </button>
              </div>
            </div>

            {/* Table */}
            {loadingVideos ? (
              <div className="text-center py-16 text-gray-500">Loading videos…</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#141414] border-b border-white/5 text-left">
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filteredVideos.length && filteredVideos.length > 0}
                          onChange={toggleSelectAll}
                          className="accent-red-500"
                        />
                      </th>
                      <th className="px-3 py-3 w-16 text-gray-400 font-medium text-xs">Thumb</th>
                      <th
                        className="px-3 py-3 text-gray-400 font-medium text-xs cursor-pointer hover:text-white"
                        onClick={() => toggleSort("title")}
                      >
                        Title <SortIcon k="title" />
                      </th>
                      <th className="px-3 py-3 text-gray-400 font-medium text-xs hidden md:table-cell">
                        Uploader
                      </th>
                      <th
                        className="px-3 py-3 text-gray-400 font-medium text-xs cursor-pointer hover:text-white hidden sm:table-cell"
                        onClick={() => toggleSort("views")}
                      >
                        Views <SortIcon k="views" />
                      </th>
                      <th
                        className="px-3 py-3 text-gray-400 font-medium text-xs cursor-pointer hover:text-white hidden lg:table-cell"
                        onClick={() => toggleSort("created_at")}
                      >
                        Uploaded <SortIcon k="created_at" />
                      </th>
                      <th className="px-3 py-3 text-gray-400 font-medium text-xs hidden sm:table-cell">
                        Status
                      </th>
                      <th className="px-3 py-3 text-gray-400 font-medium text-xs text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredVideos.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-gray-600">
                          {search ? `No results for "${search}"` : "No videos found"}
                        </td>
                      </tr>
                    ) : (
                      filteredVideos.map(v => (
                        <tr
                          key={v.id}
                          className={`hover:bg-white/[0.02] transition ${
                            selectedIds.has(v.id) ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(v.id)}
                              onChange={() => toggleSelect(v.id)}
                              className="accent-red-500"
                            />
                          </td>

                          {/* Thumbnail */}
                          <td className="px-3 py-3">
                            <div className="w-14 aspect-video rounded-lg overflow-hidden bg-[#222]">
                              {v.thumbnail ? (
                                <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">
                                  No img
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Title */}
                          <td className="px-3 py-3 max-w-[220px]">
                            <p className="text-white text-xs font-medium line-clamp-2 leading-snug">
                              {v.title}
                            </p>
                            <p className="text-gray-600 text-[11px] mt-0.5">
                              {fmtDuration(v.duration)} · ID:{v.id}
                            </p>
                          </td>

                          {/* Uploader */}
                          <td className="px-3 py-3 hidden md:table-cell">
                            <p className="text-gray-400 text-xs truncate max-w-[140px]">
                              {v.channel_name || v.uploader_email}
                            </p>
                            <p className="text-gray-600 text-[11px] truncate max-w-[140px]">
                              {v.uploader_email}
                            </p>
                          </td>

                          {/* Views */}
                          <td className="px-3 py-3 hidden sm:table-cell text-gray-400 text-xs">
                            {fmtViews(v.views || 0)}
                          </td>

                          {/* Date */}
                          <td className="px-3 py-3 hidden lg:table-cell text-gray-500 text-xs">
                            {fmtDate(v.created_at)}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              v.status === "ready"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : v.status === "pending"
                                ? "bg-yellow-500/15 text-yellow-400"
                                : "bg-red-500/15 text-red-400"
                            }`}>
                              {v.status || "—"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Watch */}
                              <Link
                                to={`/watch?v=${v.public_id || v.id}`}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
                                title="Watch"
                                target="_blank"
                              >
                                ▶
                              </Link>

                              {/* Feature */}
                              <button
                                onClick={() => setFeaturingVideo(v)}
                                className="p-1.5 rounded-lg hover:bg-yellow-500/20 text-gray-400 hover:text-yellow-400 transition text-sm"
                                title="Set as Featured"
                              >
                                ⭐
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => setEditingVideo(v)}
                                className="p-1.5 rounded-lg hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition text-sm"
                                title="Edit"
                              >
                                ✏️
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setDeletingId(v.id)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition text-sm"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-600 mt-3">
              {filteredVideos.length} of {videos.length} videos
              {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
            </p>
          </div>
        )}

        {/* ══ FEATURED TAB ══ */}
        {tab === "featured" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">
                Manage which video appears as the hero on the homepage.
              </p>
              <button
                onClick={loadFeatured}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition"
              >
                ↺ Refresh
              </button>
            </div>

            {loadingFeatured ? (
              <div className="text-center py-16 text-gray-500">Loading…</div>
            ) : featuredList.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <p className="text-3xl mb-3">⭐</p>
                <p className="text-sm">No featured videos yet.</p>
                <p className="text-xs mt-1">Go to Videos tab → click ⭐ on any video.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {featuredList.map(f => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition ${
                      f.is_active
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : "bg-[#141414] border-white/5 opacity-50"
                    }`}
                  >
                    <div className="text-xl">{f.is_active ? "⭐" : "☆"}</div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium line-clamp-1">{f.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                        <span>ID: {f.video_id}</span>
                        <span>By: {f.featured_by}</span>
                        <span>{fmtDate(f.starts_at)} → {fmtDate(f.ends_at)}</span>
                        {f.note && <span className="text-yellow-600">"{f.note}"</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.is_active && (
                        <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">
                          LIVE
                        </span>
                      )}
                      {f.is_active && (
                        <button
                          onClick={() => setRemovingFeaturedId(f.id)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {editingVideo && (
          <EditModal
            key="edit"
            video={editingVideo}
            onSave={updates => handleUpdate(editingVideo.id, updates)}
            onClose={() => setEditingVideo(null)}
          />
        )}

        {deletingId !== null && (
          <ConfirmModal
            key="delete"
            message={`Delete "${videos.find(v => v.id === deletingId)?.title}"? This will remove the video and all HLS files from MinIO. This cannot be undone.`}
            onConfirm={() => handleDelete(deletingId)}
            onCancel={() => setDeletingId(null)}
          />
        )}

        {bulkDeleteConfirm && (
          <ConfirmModal
            key="bulk"
            message={`Delete ${selectedIds.size} selected videos? All HLS files will be removed from MinIO. This cannot be undone.`}
            onConfirm={handleBulkDelete}
            onCancel={() => setBulkDeleteConfirm(false)}
          />
        )}

        {featuringVideo && (
          <FeaturedModal
            key="feature"
            video={featuringVideo}
            onSet={(days, note) => handleSetFeatured(featuringVideo.id, days, note)}
            onClose={() => setFeaturingVideo(null)}
          />
        )}

        {removingFeaturedId !== null && (
          <ConfirmModal
            key="remove-featured"
            message="Remove this video from the featured spot? The homepage hero will revert to the latest video."
            onConfirm={() => handleRemoveFeatured(removingFeaturedId)}
            onCancel={() => setRemovingFeaturedId(null)}
            danger={false}
          />
        )}

        {toast && (
          <Toast
            key="toast"
            msg={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
