import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  CheckCircle,
  Loader2,
  X,
  Play,
  Film,
  AlertCircle,
  FileVideo,
  Clock,
  HardDrive,
} from "lucide-react";
import { API_URL } from "../utils/constants";
import { getAuth } from "firebase/auth";


type Status = "idle" | "uploading" | "processing" | "ready" | "error";

// Single source of truth for the client-side size check AND the label
// shown in the dropzone — these had drifted apart (check said 100MB,
// label said "Max 2GB"), so a mid-size file would look accepted by the
// UI and then get rejected with a confusing error right after selection.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_UPLOAD_LABEL = "Max 100MB";

interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  thumbnail?: File;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Metadata
  const [metadata, setMetadata] = useState<VideoMetadata>({
    title: "",
    description: "",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [thumbnailPreview, setThumbnailPreview] = useState<string>("");

  const fileRef = useRef<HTMLInputElement>(null);
  const thumbnailRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const lastLoadedRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // ======================
  // File utilities
  // ======================
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ======================
  // File selection
  // ======================
  const handleFileSelect = (f: File) => {
    setError(null);

    if (!f.type.startsWith("video/")) {
      setError("Only video files are allowed");
      return;
    }

    const maxSize = MAX_UPLOAD_BYTES;
    if (f.size > maxSize) {
      setError(`Maximum file size is ${formatFileSize(maxSize)}`);
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);

    // Auto-fill title from filename
    if (!metadata.title) {
      const filename = f.name.replace(/\.[^/.]+$/, ""); // Remove extension
      setMetadata(prev => ({ ...prev, title: filename }));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // ======================
  // Metadata management
  // ======================
  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !metadata.tags.includes(tag) && metadata.tags.length < 10) {
      setMetadata(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setMetadata(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      setMetadata(prev => ({ ...prev, thumbnail: selectedFile }));
      // Create preview URL for the thumbnail
      const previewUrl = URL.createObjectURL(selectedFile);
      setThumbnailPreview(previewUrl);
    }
  };

  // ======================
  // Upload logic
  // ======================
  const startUpload = async () => {
    if (!file) return;

    // Validate metadata
    if (!metadata.title.trim()) {
      setError("Please enter a video title");
      return;
    }

    // Get Firebase token properly — localStorage.getItem("firebaseToken") is unreliable
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      setError("Please log in before uploading.");
      return;
    }
    const token = await user.getIdToken();

    setStatus("uploading");
    setError(null);
    lastLoadedRef.current = 0;
    lastTimeRef.current = Date.now();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", metadata.title.trim());
    formData.append("description", metadata.description.trim());
    formData.append("tags", JSON.stringify(metadata.tags));

    // Convert thumbnail to base64 with resize to stay under multer fieldSize limit
    if (metadata.thumbnail) {
      const toResizedBase64 = (imgFile: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(imgFile);
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const MAX_W = 1280, MAX_H = 720;
              let w = img.naturalWidth, h = img.naturalHeight;
              if (w > MAX_W || h > MAX_H) {
                const ratio = Math.min(MAX_W / w, MAX_H / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
              }
              const canvas = document.createElement("canvas");
              canvas.width = w;
              canvas.height = h;
              canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = reject;
            img.src = reader.result as string;
          };
          reader.onerror = reject;
        });
      };
      const base64 = await toResizedBase64(metadata.thumbnail);
      formData.append("thumbnail_base64", base64);
    }

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    // IMPORTANT: open() must be called BEFORE setRequestHeader()
    xhr.open("POST", `${API_URL}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setProgress(percent);

        // Calculate upload speed and time remaining
        const now = Date.now();
        const timeDiff = (now - lastTimeRef.current) / 1000; // seconds
        const bytesDiff = e.loaded - lastLoadedRef.current;

        if (timeDiff > 0.5) {
          const speed = bytesDiff / timeDiff; // bytes per second
          setUploadSpeed(speed);

          const remaining = (e.total - e.loaded) / speed;
          setTimeRemaining(remaining);

          lastLoadedRef.current = e.loaded;
          lastTimeRef.current = now;
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = JSON.parse(xhr.responseText);
        setVideoId(res.videoId);
        setStatus("processing");
        startPolling(res.videoId);
      } else {
        const errorMsg = xhr.responseText || "Upload failed";
        setError(errorMsg);
        setStatus("error");
      }
    };

    xhr.onerror = () => {
      setError("Network error occurred during upload");
      setStatus("error");
    };

    xhr.onabort = () => {
      setStatus("idle");
    };

    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (window.confirm("Are you sure you want to cancel this upload?")) {
      xhrRef.current?.abort();
      resetAll();
    }
  };

  // ======================
  // Polling
  // ======================
  const startPolling = (id: string) => {
    let done = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/videos/${id}`);
        const data = await res.json();

        if (data.status === "ready") {
          done = true;
          setStatus("ready");
          clearInterval(interval);
        } else if (data.status === "error") {
          done = true;
          setStatus("error");
          setError("Video processing failed");
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Polling failed", err);
      }
    }, 3000);

    // Auto-clear after 5 minutes to prevent endless polling — but the
    // user needs to know it stopped, not just watch a spinner forever.
    setTimeout(() => {
      if (done) return;
      clearInterval(interval);
      setStatus("error");
      setError("Processing is taking longer than expected. Please check back shortly, or try uploading again.");
    }, 300000);
  };

  // ======================
  // Reset
  // ======================
  const resetAll = () => {
    if (preview) URL.revokeObjectURL(preview);

    setFile(null);
    setPreview("");
    setProgress(0);
    setStatus("idle");
    setVideoId(null);
    setError(null);
    setUploadSpeed(0);
    setTimeRemaining(0);
    setMetadata({ title: "", description: "", tags: [] });
    setTagInput("");
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview("");
  };

  // ======================
  // UI
  // ======================
  return (
    <div className="h-screen overflow-y-auto bg-black text-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-red-500 to-red-500 bg-clip-text text-transparent">
            Upload Video
          </h1>
          <p className="text-gray-400">Share your content with the world</p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#181818] border border-gray-800 rounded-2xl overflow-y-auto max-h-[80vh]"
        >
          <AnimatePresence mode="wait">
            {/* Error Alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border-b border-red-500/30 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Drag & Drop Zone */}
            {status === "idle" && !file && (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 md:p-10 pb-24"
              >
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all ${dragOver
                    ? "border-red-500 bg-red-500/10 scale-105"
                    : "border-gray-600 hover:border-pink-400 hover:bg-red-500/5"
                    }`}
                  onClick={() => fileRef.current?.click()}
                >
                  <motion.div
                    animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Upload className="text-red-500 w-20 h-20 mb-6" />
                  </motion.div>

                  <h3 className="text-2xl font-bold mb-2">
                    {dragOver ? "Drop it!" : "Choose a video to upload"}
                  </h3>
                  <p className="text-gray-400 mb-6">
                    or drag and drop it here
                  </p>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-400 justify-center">
                    <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                      <FileVideo size={16} />
                      <span>MP4, MOV, AVI, MKV</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
                      <HardDrive size={16} />
                      <span>{MAX_UPLOAD_LABEL}</span>
                    </div>
                  </div>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) =>
                      e.target.files && handleFileSelect(e.target.files[0])
                    }
                  />
                </div>
              </motion.div>
            )}

            {/* File Selected - Metadata Form */}
            {file && status === "idle" && (
              <motion.div
                key="metadata"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 md:p-10 pb-24"
              >
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Video Preview */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Preview</h3>
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-700">
                      <video
                        src={preview}
                        controls
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between text-gray-400">
                        <span>Filename:</span>
                        <span className="text-white truncate ml-2 max-w-[200px]">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Size:</span>
                        <span className="text-white">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview("");
                      }}
                      className="mt-4 w-full py-2 border border-gray-700 hover:border-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-red-400"
                    >
                      Remove Video
                    </button>
                  </div>

                  {/* Metadata Form */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Details</h3>

                    <div className="space-y-4">
                      {/* Title */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Title <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Enter video title"
                          value={metadata.title}
                          onChange={(e) =>
                            setMetadata(prev => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg focus:outline-none focus:border-red-500 transition-colors"
                          maxLength={100}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          {metadata.title.length}/100
                        </p>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Description
                        </label>
                        <textarea
                          placeholder="Tell viewers about your video"
                          value={metadata.description}
                          onChange={(e) =>
                            setMetadata(prev => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg focus:outline-none focus:border-red-500 transition-colors resize-none"
                          rows={4}
                          maxLength={500}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          {metadata.description.length}/500
                        </p>
                      </div>

                      {/* Tags */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Tags (max 10)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add tag"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addTag();
                              }
                            }}
                            className="flex-1 px-4 py-2 bg-black/50 border border-gray-700 rounded-lg focus:outline-none focus:border-red-500 transition-colors text-sm"
                            disabled={metadata.tags.length >= 10}
                          />
                          <button
                            onClick={addTag}
                            disabled={metadata.tags.length >= 10}
                            className="px-4 py-2 bg-red-600 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            Add
                          </button>
                        </div>

                        {metadata.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {metadata.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-sm"
                              >
                                {tag}
                                <button
                                  onClick={() => removeTag(tag)}
                                  className="hover:text-red-400 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Custom Thumbnail */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Custom Thumbnail (optional)
                        </label>
                        <input
                          ref={thumbnailRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={handleThumbnailSelect}
                        />
                        <button
                          onClick={() => thumbnailRef.current?.click()}
                          className="w-full py-2 border border-gray-700 hover:border-red-500 rounded-lg transition-colors text-sm"
                        >
                          {metadata.thumbnail
                            ? metadata.thumbnail.name
                            : "Choose thumbnail image"}
                        </button>
                        {/* Thumbnail Preview */}
                        {thumbnailPreview && (
                          <div className="mt-3 relative">
                            <img
                              src={thumbnailPreview}
                              alt="Thumbnail preview"
                              className="w-full h-32 object-cover rounded-lg border border-gray-700"
                            />
                            <button
                              onClick={() => {
                                setMetadata(prev => ({ ...prev, thumbnail: undefined }));
                                setThumbnailPreview("");
                              }}
                              className="absolute top-2 right-2 p-1 bg-black/70 rounded-full hover:bg-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Upload Button */}
                    <button
                      onClick={startUpload}
                      className="w-full mt-6 bg-gradient-to-r from-red-600 to-red-600 hover:from-red-600 hover:to-red-700 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Upload size={18} />
                      Upload Video
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Uploading */}
            {status === "uploading" && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-10 text-center"
              >
                <Loader2 className="w-16 h-16 animate-spin text-red-500 mx-auto mb-6" />

                <h3 className="text-2xl font-bold mb-2">Uploading...</h3>
                <p className="text-gray-400 mb-8">
                  Please don't close this window
                </p>

                {/* Progress Bar */}
                <div className="max-w-md mx-auto mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Progress</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <div className="h-2 bg-[#1a0000] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-red-500 to-red-500"
                    />
                  </div>

                  {/* Upload Stats */}
                  <div className="flex justify-between text-sm text-gray-400 mt-3">
                    <span>
                      Speed: {formatFileSize(uploadSpeed)}/s
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {formatTime(timeRemaining)} remaining
                    </span>
                  </div>
                </div>

                <button
                  onClick={cancelUpload}
                  className="px-6 py-2 border border-red-500/30 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                >
                  Cancel Upload
                </button>
              </motion.div>
            )}

            {/* Processing */}
            {status === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-10 text-center"
              >
                <Loader2 className="w-16 h-16 animate-spin text-yellow-400 mx-auto mb-6" />

                <h3 className="text-2xl font-bold mb-2">Processing Video</h3>
                <p className="text-gray-400 mb-4">
                  We're preparing your video for streaming
                </p>
                <p className="text-sm text-gray-400">
                  This may take a few minutes depending on video length
                </p>
              </motion.div>
            )}

            {/* Ready/Success */}
            {status === "ready" && videoId && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="p-10 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                >
                  <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-6" />
                </motion.div>

                <h3 className="text-3xl font-bold mb-2">Upload Complete!</h3>
                <p className="text-gray-400 mb-8">
                  Your video is now live and ready to watch
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
                  <button
                    onClick={() => navigate(`/watch?v=${videoId}`)}
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-600 hover:from-red-600 hover:to-red-700 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Play size={18} />
                    Watch Now
                  </button>

                  <button
                    onClick={resetAll}
                    className="flex-1 border border-gray-700 hover:border-red-500 hover:bg-red-500/10 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Upload Another
                  </button>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {status === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-10 text-center"
              >
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />

                <h3 className="text-2xl font-bold mb-2">Upload Failed</h3>
                <p className="text-gray-400 mb-8">
                  {error || "Something went wrong. Please try again."}
                </p>

                <button
                  onClick={resetAll}
                  className="px-8 py-3 bg-red-600 hover:bg-red-600 rounded-lg font-semibold transition-colors"
                >
                  Try Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Tips */}
        {status === "idle" && !file && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 bg-[#181818] border border-gray-800 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Film className="text-red-500" size={20} />
              Upload Tips
            </h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Higher quality videos get better engagement</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Add descriptive titles and tags to help viewers find your content</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Custom thumbnails can increase click-through rates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span>
                <span>Processing time varies based on video length and quality</span>
              </li>
            </ul>
          </motion.div>
        )}
      </div>
    </div>
  );
}