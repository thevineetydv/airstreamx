// components/CreatePostModal.tsx
//
// Quick "create a post" modal — a flexible mix of caption text, images,
// and/or a short video. Lighter-weight than the full video-upload flow;
// posts show up on the channel's "Posts" tab.

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Image as ImageIcon, Video as VideoIcon, Loader2, Trash2, Sparkles, BarChart3, Plus, Film, Search, Link as LinkIcon } from "lucide-react";
import { getAuth } from "firebase/auth";
import { API_URL } from "../utils/constants";
import { useAuth } from "../context/AuthContext";

interface CreatePostModalProps {
  onClose: () => void;
  onPosted: () => void; // called after a successful post, so the caller can refresh its list
}

interface PendingFile {
  file: File;
  previewUrl: string;
  type: "image" | "video";
}

const MAX_FILES = 6;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — matches the backend limit

export default function CreatePostModal({ onClose, onPosted }: CreatePostModalProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPollInputs, setShowPollInputs] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // ── Share an existing AirStreamX video ──
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [videoQuery, setVideoQuery] = useState("");
  const [videoResults, setVideoResults] = useState<any[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<{ id: string; title: string; thumbnail: string } | null>(null);
  const [videoPickerError, setVideoPickerError] = useState<string | null>(null);

  // Default view: the person's own recent videos. Debounced search takes
  // over once they start typing (either a keyword, or a pasted watch URL).
  useEffect(() => {
    if (!showVideoPicker) return;
    const query = videoQuery.trim();

    // A pasted AirStreamX link — resolve it directly instead of searching.
    const urlMatch = query.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      setLoadingVideos(true);
      setVideoPickerError(null);
      fetch(`${API_URL}/videos/${urlMatch[1]}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.video?.id) setVideoResults([data.video]);
          else { setVideoResults([]); setVideoPickerError("Couldn't find that video."); }
        })
        .catch(() => setVideoPickerError("Couldn't load that link."))
        .finally(() => setLoadingVideos(false));
      return;
    }

    const t = setTimeout(() => {
      setLoadingVideos(true);
      setVideoPickerError(null);
      const params = query
        ? `search=${encodeURIComponent(query)}&limit=12`
        : `uploader=${encodeURIComponent(user?.email || "")}&limit=12`;
      fetch(`${API_URL}/videos?${params}`)
        .then((r) => r.json())
        .then((data) => setVideoResults(data.videos || []))
        .catch(() => setVideoPickerError("Couldn't load videos."))
        .finally(() => setLoadingVideos(false));
    }, query ? 350 : 0);

    return () => clearTimeout(t);
  }, [showVideoPicker, videoQuery, user?.email]);

  const pickVideo = (v: any) => {
    setSelectedVideo({
      id: String(v.id),
      title: v.title,
      thumbnail: v.thumbnail_url || v.thumbnail || "",
    });
    setShowVideoPicker(false);
    setVideoQuery("");
  };

  // Accessibility: Escape closes the modal, matching standard dialog behavior
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !posting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [posting, onClose]);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);

    const incoming = Array.from(fileList);
    const room = MAX_FILES - pendingFiles.length;
    if (incoming.length > room) {
      setError(`You can attach up to ${MAX_FILES} files per post.`);
    }

    const accepted: PendingFile[] = [];
    for (const file of incoming.slice(0, room)) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" is over the 50MB limit for a post.`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setError(`"${file.name}" isn't an image or video.`);
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file), type: isImage ? "image" : "video" });
    }
    setPendingFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };
  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions((prev) => [...prev, ""]);
  };
  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) setPollOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    const hasPoll = showPollInputs && pollQuestion.trim();
    if (hasPoll && validPollOptions.length < 2) {
      setError("A poll needs at least 2 filled-in options.");
      return;
    }
    if (!caption.trim() && pendingFiles.length === 0 && !selectedVideo && !hasPoll) {
      setError("Write something, attach media, share a video, or create a poll first.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("Please log in to post.");
        setPosting(false);
        return;
      }

      const formData = new FormData();
      formData.append("caption", caption.trim());
      for (const pf of pendingFiles) formData.append("media", pf.file);
      if (selectedVideo) formData.append("existing_video_id", selectedVideo.id);
      if (hasPoll) {
        formData.append("poll_question", pollQuestion.trim());
        formData.append("poll_options", JSON.stringify(validPollOptions));
      }

      const res = await fetch(`${API_URL}/api/posts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to create post.");
        return;
      }

      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      onPosted();
      onClose();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPosting(false);
    }
  };

  const canPost = (
    caption.trim().length > 0 || pendingFiles.length > 0 || !!selectedVideo ||
    (showPollInputs && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2)
  ) && !posting;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        onClick={() => !posting && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 14 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-post-title"
          className="relative bg-[#212121] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Ambient glow, matching the app's card language elsewhere */}
          <div
            className="absolute -top-24 -right-16 w-64 h-64 rounded-full opacity-25 blur-[90px] pointer-events-none"
            style={{ background: "radial-gradient(circle, #ef4444, transparent 70%)" }}
          />

          {/* Header */}
          <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/20 to-red-600/5 border border-red-500/20 flex items-center justify-center">
                <Sparkles size={15} className="text-red-400" />
              </div>
              <h2 id="create-post-title" className="text-lg font-bold text-white">Create post</h2>
            </div>
            <button
              onClick={() => !posting && onClose()}
              aria-label="Close create post dialog"
              className="p-2 hover:bg-white/10 rounded-full transition text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="relative px-6 py-5 overflow-y-auto">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="What's on your mind?"
              aria-label="Post caption"
              autoFocus
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500/40 focus:bg-black/40 transition-colors resize-none mb-1"
            />
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] text-gray-600">Tip: use #hashtags so people can discover this post</p>
              <p className="text-[11px] text-gray-600 flex-shrink-0 ml-3">{caption.length}/2000</p>
            </div>

            {/* Media previews */}
            <AnimatePresence>
              {pendingFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-3 gap-2 mb-4 overflow-hidden"
                >
                  {pendingFiles.map((pf, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 22, delay: i * 0.04 }}
                      className="relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/5 group"
                    >
                      {pf.type === "image" ? (
                        <img src={pf.previewUrl} alt={`Preview of attached image ${i + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <video src={pf.previewUrl} className="w-full h-full object-cover" muted />
                      )}
                      {/* Subtle vignette for visual depth, matching cinematic media framing elsewhere */}
                      <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.4)] pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        onClick={() => removeFile(i)}
                        aria-label={`Remove attached ${pf.type} ${i + 1}`}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-black/70 hover:bg-red-500 rounded-full transition opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400"
                      >
                        <Trash2 size={12} className="text-white" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Poll creation inputs */}
            <AnimatePresence>
              {showPollInputs && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="bg-black/30 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={15} className="text-violet-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        placeholder="Ask a question…"
                        aria-label="Poll question"
                        maxLength={200}
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none font-medium"
                      />
                      <button
                        onClick={() => { setShowPollInputs(false); setPollQuestion(""); setPollOptions(["", ""]); }}
                        aria-label="Remove poll"
                      >
                        <X size={14} className="text-gray-500 hover:text-white" />
                      </button>
                    </div>
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2 pl-6">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updatePollOption(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          aria-label={`Poll option ${i + 1}`}
                          maxLength={200}
                          className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/40"
                        />
                        {pollOptions.length > 2 && (
                          <button onClick={() => removePollOption(i)} aria-label={`Remove option ${i + 1}`}>
                            <Trash2 size={13} className="text-gray-600 hover:text-red-400" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 4 && (
                      <button
                        onClick={addPollOption}
                        className="flex items-center gap-1 pl-6 text-xs text-violet-400 hover:text-violet-300 font-medium"
                      >
                        <Plus size={12} /> Add option
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Selected AirStreamX video preview */}
            <AnimatePresence>
              {selectedVideo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="relative flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl p-2.5">
                    <div className="relative w-24 h-14 rounded-lg overflow-hidden bg-black/50 flex-shrink-0">
                      {selectedVideo.thumbnail && (
                        <img src={selectedVideo.thumbnail} alt="" className="w-full h-full object-cover" />
                      )}
                      <Film size={16} className="absolute inset-0 m-auto text-white/70" />
                    </div>
                    <p className="text-sm text-gray-200 line-clamp-2 flex-1">{selectedVideo.title}</p>
                    <button
                      onClick={() => setSelectedVideo(null)}
                      aria-label="Remove shared video"
                      className="p-1.5 hover:bg-white/10 rounded-full transition text-gray-500 hover:text-white flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AirStreamX video picker */}
            <AnimatePresence>
              {showVideoPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="bg-black/30 border border-white/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Search size={14} className="text-gray-500 flex-shrink-0" />
                      <input
                        type="text"
                        value={videoQuery}
                        onChange={(e) => setVideoQuery(e.target.value)}
                        placeholder="Search all of AirStreamX, or paste a video link…"
                        aria-label="Search AirStreamX videos or paste a link"
                        autoFocus
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
                      />
                      {videoQuery.trim() && (
                        <LinkIcon size={13} className="text-gray-600 flex-shrink-0" aria-hidden="true" />
                      )}
                      <button
                        onClick={() => { setShowVideoPicker(false); setVideoQuery(""); }}
                        aria-label="Close video picker"
                      >
                        <X size={14} className="text-gray-500 hover:text-white" />
                      </button>
                    </div>

                    {!videoQuery.trim() && (
                      <p className="text-[11px] text-gray-600 mb-2">Your videos</p>
                    )}

                    {loadingVideos && (
                      <p className="text-sm text-gray-500 text-center py-6">Loading…</p>
                    )}

                    {!loadingVideos && videoPickerError && (
                      <p className="text-sm text-red-400 text-center py-6">{videoPickerError}</p>
                    )}

                    {!loadingVideos && !videoPickerError && videoResults.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-6">
                        {videoQuery.trim() ? "No videos found." : "You haven't uploaded any videos yet."}
                      </p>
                    )}

                    {!loadingVideos && videoResults.length > 0 && (
                      <div className="max-h-64 overflow-y-auto space-y-1.5">
                        {videoResults.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => pickVideo(v)}
                            className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-red-400 transition text-left"
                          >
                            <div className="relative w-20 h-12 rounded-md overflow-hidden bg-black/50 flex-shrink-0">
                              {(v.thumbnail_url || v.thumbnail) && (
                                <img src={v.thumbnail_url || v.thumbnail} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <p className="text-sm text-gray-200 line-clamp-2">{v.title}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Attach buttons */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingFiles.length >= MAX_FILES}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-full text-sm text-emerald-400 font-medium transition disabled:opacity-30"
              >
                <ImageIcon size={15} /> Photo
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingFiles.length >= MAX_FILES}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-full text-sm text-blue-400 font-medium transition disabled:opacity-30"
              >
                <VideoIcon size={15} /> Video
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowPollInputs((v) => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-full text-sm font-medium transition ${
                  showPollInputs
                    ? "bg-violet-500/20 border-violet-500/30 text-violet-400"
                    : "bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20 text-violet-400"
                }`}
              >
                <BarChart3 size={15} /> Poll
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowVideoPicker((v) => !v)}
                disabled={!!selectedVideo}
                className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-full text-sm font-medium transition disabled:opacity-30 ${
                  showVideoPicker
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                    : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400"
                }`}
              >
                <Film size={15} /> AirStreamX Video
              </motion.button>
              <span className="text-xs text-gray-600 ml-auto font-medium">{pendingFiles.length}/{MAX_FILES}</span>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-red-400 mt-3"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="relative flex justify-end gap-2 px-6 py-4 border-t border-white/5 bg-black/20">
            <button
              onClick={() => !posting && onClose()}
              disabled={posting}
              className="px-4 py-2.5 text-sm font-medium text-gray-300 hover:text-white transition disabled:opacity-50"
            >
              Cancel
            </button>
            <motion.button
              whileHover={canPost ? { scale: 1.03 } : {}}
              whileTap={canPost ? { scale: 0.97 } : {}}
              onClick={handlePost}
              disabled={!canPost}
              className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-40 disabled:hover:from-red-600 disabled:hover:to-red-700 text-white text-sm font-bold rounded-full transition-all shadow-lg shadow-red-900/30 flex items-center gap-2"
            >
              {posting && <Loader2 size={14} className="animate-spin" />}
              {posting ? "Posting…" : "Post"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}