// components/PostsTab.tsx
//
// The "Posts" tab on a channel/profile page. Shows text + image/video
// posts, newest first, with like and comment support.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Plus, Trash2, FileText, Sparkles, ThumbsUp, PlayCircle } from "lucide-react";
import { getAuth } from "firebase/auth";
import { API_URL } from "../utils/constants";
import { useAuth } from "../context/AuthContext";
import CreatePostModal from "./CreatePostModal";

interface PostMedia {
  type: "image" | "video" | "airstreamx_video";
  url: string;
  thumbnail: string | null;
  title?: string | null;
  duration?: number | null;
}

interface PollOption {
  id: number;
  text: string;
  votes: number;
}

interface Poll {
  poll_id: number;
  question: string;
  options: PollOption[];
}

interface Post {
  id: number;
  caption: string;
  created_at: string;
  comment_count: number;
  media: PostMedia[];
  reactions?: Record<string, number>;
  hashtags: string[];
  poll: Poll | null;
}

interface PostsTabProps {
  channelId: number | string;
  isOwnChannel: boolean;
}

const REACTION_EMOJI: Record<string, string> = {
  like: "👍", love: "❤️", haha: "😂", wow: "😮", sad: "😢", angry: "😡",
};
const REACTION_ORDER = ["like", "love", "haha", "wow", "sad", "angry"];

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [secs, label] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return "just now";
}

function renderCaptionWithHashtags(caption: string) {
  const parts = caption.split(/(#[a-zA-Z0-9_]{2,100})/g);
  return parts.map((part, i) =>
    part.startsWith("#") ? (
      <span key={i} className="text-red-400 font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function PostSkeleton() {
  return (
    <div className="bg-[#141414] border border-white/5 rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-20 bg-white/10 rounded mb-4" />
      <div className="h-3 w-full bg-white/10 rounded mb-2" />
      <div className="h-3 w-2/3 bg-white/10 rounded mb-4" />
      <div className="h-48 w-full bg-white/5 rounded-xl" />
    </div>
  );
}

export default function PostsTab({ channelId, isOwnChannel }: PostsTabProps) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [myReactions, setMyReactions] = useState<Record<number, string>>({});
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  const [myVotes, setMyVotes] = useState<Record<number, number>>({}); // pollId -> optionId

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/posts/channel/${channelId}`);
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } catch {
      // Silently fail — the tab just shows empty state
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const setReaction = async (postId: number, type: string) => {
    if (!user) return;
    setOpenPicker(null);
    const previous = myReactions[postId];
    const isRemoving = previous === type;

    setMyReactions((prev) => {
      const next = { ...prev };
      if (isRemoving) delete next[postId]; else next[postId] = type;
      return next;
    });
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const reactions = { ...p.reactions };
      if (previous) reactions[previous] = Math.max((reactions[previous] || 1) - 1, 0);
      if (!isRemoving) reactions[type] = (reactions[type] || 0) + 1;
      return { ...p, reactions };
    }));

    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (isRemoving) {
        await fetch(`${API_URL}/api/posts/${postId}/react`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`${API_URL}/api/posts/${postId}/react`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reaction_type: type }),
        });
      }
    } catch {
      // Best-effort — a failed reaction isn't worth blocking the UI over
    }
  };

  const vote = async (pollId: number, optionId: number) => {
    if (!user) return;
    setMyVotes((prev) => ({ ...prev, [pollId]: optionId }));
    setPosts((prev) => prev.map((p) => {
      if (!p.poll || p.poll.poll_id !== pollId) return p;
      const prevOptionId = myVotes[pollId];
      const options = p.poll.options.map((o) => {
        if (o.id === optionId) return { ...o, votes: o.votes + 1 };
        if (o.id === prevOptionId) return { ...o, votes: Math.max(o.votes - 1, 0) };
        return o;
      });
      return { ...p, poll: { ...p.poll, options } };
    }));
    try {
      const token = await getAuth().currentUser?.getIdToken();
      await fetch(`${API_URL}/api/posts/poll/${pollId}/vote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId }),
      });
    } catch {
      // Best-effort
    }
  };

  const deletePost = async (postId: number) => {
    if (!confirm("Delete this post?")) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/api/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      // Leave the post in place if the delete failed
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      {isOwnChannel && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setShowCreateModal(true)}
          className="group relative w-full flex items-center gap-3 justify-center py-4 mb-8 rounded-2xl overflow-hidden border border-white/10 hover:border-red-500/30 transition-colors"
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(20,20,20,0.4))" }}
          />
          <div className="relative flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
              <Plus size={16} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Create a post</span>
          </div>
        </motion.button>
      )}

      {loading && (
        <div className="space-y-4">
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-[#141414] border border-white/5 flex items-center justify-center mx-auto mb-4">
            <FileText size={26} className="text-gray-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-300 mb-1.5">No posts yet</h3>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            {isOwnChannel
              ? "Share a quick update, photo, or clip with your subscribers."
              : "This channel hasn't shared any posts yet."}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <AnimatePresence>
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.35 }}
              whileHover={{ y: -2 }}
              className="group relative bg-[#141414] border border-white/5 rounded-2xl p-5 overflow-hidden transition-colors hover:border-white/10"
            >
              {/* Subtle hover glow, matching the app's card language elsewhere */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-red-500/0 group-hover:bg-red-500/[0.06] blur-2xl transition-all duration-500 pointer-events-none" />

              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                    <Sparkles size={11} className="text-gray-600" />
                    {timeAgo(post.created_at)}
                  </span>
                  {isOwnChannel && (
                    <button
                      onClick={() => deletePost(post.id)}
                      aria-label="Delete this post"
                      className="p-1.5 hover:bg-red-500/10 rounded-full transition text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {post.caption && (
                  <p className="text-[15px] text-gray-100 leading-relaxed whitespace-pre-wrap mb-3.5">
                    {renderCaptionWithHashtags(post.caption)}
                  </p>
                )}

                {post.media.length > 0 && (
                  <div className={`grid gap-1.5 mb-4 rounded-xl overflow-hidden ${
                    post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
                  }`}>
                    {post.media.map((m, idx) => (
                      <div key={idx} className="relative bg-black/40 overflow-hidden">
                        {m.type === "image" && (
                          <img
                            src={m.url}
                            alt={post.caption ? `Photo shared with post: ${post.caption.slice(0, 100)}` : `Photo ${idx + 1} shared in post`}
                            className="w-full max-h-[420px] object-cover hover:scale-[1.03] transition-transform duration-500"
                          />
                        )}
                        {m.type === "video" && (
                          <video src={m.url} controls aria-label={`Video ${idx + 1} shared in post`} className="w-full max-h-[420px] object-cover" />
                        )}
                        {m.type === "airstreamx_video" && (
                          <Link
                            to={`/watch?v=${m.url}`}
                            aria-label={`Watch: ${m.title || "shared video"}`}
                            className="group/video relative flex flex-col bg-black/60 hover:bg-black/50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                          >
                            <div className="relative aspect-video w-full overflow-hidden">
                              {m.thumbnail && (
                                <img
                                  src={m.thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover group-hover/video:scale-[1.03] transition-transform duration-500"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                <PlayCircle size={44} className="text-white/90 drop-shadow-lg" />
                              </div>
                              {typeof m.duration === "number" && m.duration > 0 && (
                                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                                  {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, "0")}
                                </span>
                              )}
                            </div>
                            {m.title && (
                              <p className="text-sm text-gray-200 font-medium p-2.5 line-clamp-2">{m.title}</p>
                            )}
                          </Link>
                        )}
                        {/* Subtle vignette for cinematic depth on photos */}
                        {m.type === "image" && (
                          <div className="absolute inset-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.25)] pointer-events-none" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Poll */}
                {post.poll && (() => {
                  const totalVotes = post.poll.options.reduce((sum, o) => sum + o.votes, 0);
                  const myVote = myVotes[post.poll.poll_id];
                  return (
                    <div className="bg-black/25 border border-white/5 rounded-xl p-4 mb-4" role="group" aria-labelledby={`poll-q-${post.poll.poll_id}`}>
                      <p id={`poll-q-${post.poll.poll_id}`} className="text-sm font-semibold text-white mb-3">{post.poll.question}</p>
                      <div className="space-y-2">
                        {post.poll.options.map((opt) => {
                          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                          const isMine = myVote === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => vote(post.poll!.poll_id, opt.id)}
                              disabled={!user}
                              aria-pressed={isMine}
                              aria-label={`${opt.text}${myVote !== undefined ? `, ${pct} percent, ${opt.votes} votes` : ""}${isMine ? ", your vote" : ""}`}
                              className="relative w-full text-left rounded-lg overflow-hidden border border-white/10 hover:border-violet-500/30 focus:outline-none focus:ring-2 focus:ring-violet-400 transition disabled:opacity-60"
                            >
                              {myVote !== undefined && (
                                <div
                                  className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${isMine ? "bg-violet-500/25" : "bg-white/5"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                              <div className="relative flex items-center justify-between px-3 py-2">
                                <span className={`text-sm ${isMine ? "text-violet-300 font-semibold" : "text-gray-200"}`}>
                                  {opt.text}
                                </span>
                                {myVote !== undefined && (
                                  <span className="text-xs text-gray-400 font-medium" aria-hidden="true">{pct}% · {opt.votes}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {totalVotes > 0 && (
                        <p className="text-[11px] text-gray-600 mt-2">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-5 border-t border-white/5 mt-1 pt-3">
                  {/* Reaction picker */}
                  {(() => {
                    // Defensive: older cached data or an un-migrated backend
                    // response might not include `reactions` at all yet.
                    const totalReactions = Object.values(post.reactions || {}).reduce(
                      (a: number, b: number) => a + b, 0
                    );
                    return (
                  <div className="relative">
                    <button
                      onClick={() => setOpenPicker(openPicker === post.id ? null : post.id)}
                      disabled={!user}
                      aria-haspopup="true"
                      aria-expanded={openPicker === post.id}
                      aria-label={
                        myReactions[post.id]
                          ? `You reacted with ${myReactions[post.id]}. ${totalReactions} total reactions. Click to change.`
                          : `React to this post. ${totalReactions} total reactions.`
                      }
                      className={`flex items-center gap-1.5 text-sm font-medium transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400 rounded-lg px-1 ${
                        myReactions[post.id] ? "text-red-400" : "text-gray-400 hover:text-red-400"
                      }`}
                    >
                      {myReactions[post.id] ? (
                        <span className="text-base leading-none" aria-hidden="true">{REACTION_EMOJI[myReactions[post.id]]}</span>
                      ) : (
                        <ThumbsUp size={16} aria-hidden="true" />
                      )}
                      <span aria-hidden="true">{totalReactions}</span>
                    </button>

                    <AnimatePresence>
                      {openPicker === post.id && (
                        <motion.div
                          role="menu"
                          aria-label="Choose a reaction"
                          initial={{ opacity: 0, y: 8, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          onKeyDown={(e) => { if (e.key === "Escape") setOpenPicker(null); }}
                          className="absolute bottom-full left-0 mb-2 flex items-center gap-1 bg-[#1e1e1e] border border-white/10 rounded-full px-2 py-1.5 shadow-2xl z-10"
                        >
                          {REACTION_ORDER.map((type, i) => (
                            <motion.button
                              key={type}
                              role="menuitem"
                              aria-label={`React with ${type}`}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.03 }}
                              whileHover={{ scale: 1.35, y: -4 }}
                              onClick={() => setReaction(post.id, type)}
                              className="text-xl leading-none p-1 focus:outline-none focus:ring-2 focus:ring-white/40 rounded-full"
                            >
                              <span aria-hidden="true">{REACTION_EMOJI[type]}</span>
                            </motion.button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                    );
                  })()}

                  <div
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-400"
                    aria-label={`${post.comment_count} comment${post.comment_count !== 1 ? "s" : ""}`}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    <span aria-hidden="true">{post.comment_count}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onPosted={fetchPosts}
        />
      )}
    </div>
  );
}