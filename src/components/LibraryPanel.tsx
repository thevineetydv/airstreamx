import { useState, useMemo } from "react";
import { 
  Trash2, 
  AlertCircle, 
  Play, 
  Eye, 
  Calendar,
  Filter,
  SortAsc,
  SortDesc,
  Search,
  X,
  Download,
  Share2,
  MoreVertical,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "../utils/constants";

// Type definitions
interface Video {
  id: string | number;
  title: string;
  thumbnail?: string;
  url: string;
  duration?: number;
  created_at?: string;
  watched?: boolean;
  views?: number;
  [key: string]: unknown;
}

interface DeleteModalProps {
  video: Video;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

interface VideoActionsMenuProps {
  video: Video;
  onDelete: () => void;
  onClose: () => void;
}

interface LibraryPanelProps {
  videos?: Video[];
  currentId?: string | number | null;
  setCurrentId?: (id: string | number | null) => void;
  themeCls?: Record<string, string>;
  user?: { email: string; getIdToken?: () => Promise<string> } | null;
}

/**
 * Delete Confirmation Modal
 */
function DeleteModal({ video, onClose, onConfirm, isDeleting }: DeleteModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-red-500/10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="text-red-400" size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Delete Video?</h2>
          </div>
          
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            Are you sure you want to delete <span className="text-red-400 font-semibold">"{video.title}"</span>? 
            This action is permanent and cannot be undone.
          </p>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl bg-[#110000] text-white hover:bg-[#1a0000] transition-all text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 transition-all text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Delete
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Video Actions Menu
 */
function VideoActionsMenu({ video, onDelete, onClose }: VideoActionsMenuProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      className="absolute right-2 top-12 z-30 w-48 bg-[#0a0000]/95 backdrop-blur-xl border border-red-500/20 rounded-xl shadow-2xl shadow-red-500/10 overflow-hidden"
    >
      <button
        onClick={() => {
          // Share logic
          navigator.clipboard.writeText(window.location.origin + `/watch/${video.id}`);
          alert("Link copied to clipboard!");
          onClose();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all"
      >
        <Share2 size={16} />
        Share
      </button>
      <button
        onClick={() => {
          // Download logic
          window.open(video.url, '_blank');
          onClose();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-all"
      >
        <Download size={16} />
        Download
      </button>
      <div className="border-t border-red-500/10" />
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-all"
      >
        <Trash2 size={16} />
        Delete
      </button>
    </motion.div>
  );
}

/**
 * Empty State Component
 */
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <Play className="w-10 h-10 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">No Videos Yet</h3>
      <p className="text-gray-400 text-sm text-center max-w-xs">
        Your library is empty. Upload your first video to get started!
      </p>
    </motion.div>
  );
}

/**
 * Main Library Panel Component
 */
export default function LibraryPanel({
  videos = [],
  currentId,
  setCurrentId,
  themeCls = {},
  user
}: LibraryPanelProps) {
  const [deleteVideo, setDeleteVideo] = useState<Video | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [filterBy, setFilterBy] = useState<"all" | "watched" | "unwatched">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null);

  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((v) =>
        v.title?.toLowerCase().includes(query)
      );
    }

    // Watch status filter
    if (filterBy === "watched") {
      result = result.filter((v) => v.watched);
    } else if (filterBy === "unwatched") {
      result = result.filter((v) => !v.watched);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "recent") {
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        return bTime - aTime;
      } else if (sortBy === "oldest") {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      } else if (sortBy === "title") {
        return a.title?.localeCompare(b.title) ?? 0;
      }
      return 0;
    });

    return result;
  }, [videos, searchQuery, sortBy, filterBy]);

  // Delete handler
  const handleDelete = async () => {
    if (!deleteVideo) return;
    setIsDeleting(true);

    try {
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user && typeof user.getIdToken === 'function') {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_URL}/api/videos/${deleteVideo.id}`,
        {
          method: "DELETE",
          headers: headers,
        }
      );

      const data = await res.json();

      if (!data.success) {
        alert("Delete failed: " + (data.message || "Unknown error"));
      } else {
        setDeleteVideo(null);
        window.location.reload();
      }
    } catch (error) {
      console.error("Error deleting video:", error);
      alert("An error occurred while deleting.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`h-full flex flex-col rounded-2xl ${themeCls.panel || 'bg-[#0a0000]/50'} backdrop-blur-xl border border-red-500/10`}>
      {/* Header */}
      <div className="p-4 border-b border-red-500/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Your Library
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-full border border-red-500/30">
                {videos.length}
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Manage your uploaded videos
            </p>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-all ${
              showFilters 
                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                : "bg-[#110000] text-gray-400 hover:bg-[#1a0000] hover:text-red-400"
            }`}
          >
            <Filter size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your videos..."
            className="w-full pl-10 pr-10 py-2.5 bg-[#110000]/50 border border-gray-700 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 p-3 bg-[#110000]/30 rounded-xl space-y-3 border border-red-500/10">
                {/* Sort Options */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                    Sort By
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: "recent", label: "Recent", icon: SortDesc },
                      { value: "oldest", label: "Oldest", icon: SortAsc },
                      { value: "title", label: "Title", icon: Filter }
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setSortBy(value as any)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          sortBy === value
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-[#110000] text-gray-400 hover:bg-[#1a0000] hover:text-red-400"
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Options */}
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                    Filter
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: "all", label: "All" },
                      { value: "watched", label: "Watched" },
                      { value: "unwatched", label: "Unwatched" }
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setFilterBy(value as any)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          filterBy === value
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-[#110000] text-gray-400 hover:bg-[#1a0000] hover:text-red-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredVideos.length === 0 ? (
          searchQuery ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-[#110000] flex items-center justify-center mx-auto mb-3">
                <Search className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm">
                No videos found for "{searchQuery}"
              </p>
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredVideos.map((v) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`relative group flex gap-3 rounded-xl p-3 transition-all duration-200 cursor-pointer border ${
                    currentId === v.id 
                      ? "bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/10" 
                      : "bg-[#110000]/30 border-transparent hover:bg-red-500/5 hover:border-red-500/20"
                  }`}
                  onClick={() => setCurrentId?.(v.id)}
                >
                  {/* Thumbnail */}
                  <div className="relative w-32 h-20 shrink-0 rounded-lg overflow-hidden">
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover"
                    />
                    {currentId === v.id && (
                      <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center">
                          <Play size={16} className="text-white ml-0.5" fill="white" />
                        </div>
                      </div>
                    )}
                    {v.duration && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded backdrop-blur-sm">
                        {v.duration}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug mb-1 group-hover:text-red-400 transition-colors">
                      {v.title}
                    </h4>
                    
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {v.views !== undefined && (
                        <span className="flex items-center gap-1">
                          <Eye size={12} />
                          {v.views} views
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(v.created_at)}
                      </span>
                    </div>

                    {v.watched && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
                        <CheckCircle2 size={12} />
                        Watched
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === v.id ? null : v.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-[#110000]/90 text-gray-400 hover:text-red-400 hover:bg-[#1a0000] transition-all"
                    >
                      <MoreVertical size={16} />
                    </button>

                    <AnimatePresence>
                      {openMenuId === v.id && (
                        <VideoActionsMenu
                          video={v}
                          onDelete={() => setDeleteVideo(v)}
                          onClose={() => setOpenMenuId(null)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {deleteVideo && (
        <DeleteModal
          video={deleteVideo}
          onClose={() => setDeleteVideo(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}