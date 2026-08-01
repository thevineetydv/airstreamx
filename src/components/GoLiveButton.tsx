// ============================================================
// GoLiveButton.tsx — Start / stop a live stream
// ============================================================

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, X, Copy, Check, Radio, Loader2, Zap, Eye } from "lucide-react";
import { auth } from "../firebase";
import { API_URL } from "../utils/constants";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface StreamData {
  streamId:  string;
  streamKey: string;
  streamUrl: string;
  hlsUrl:    string;
}

interface FormData {
  title:       string;
  description: string;
}

// ─────────────────────────────────────────────
// Copy row helper
// ─────────────────────────────────────────────

function CopyRow({
  label,
  value,
  id,
  type = "text",
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  id:    string;
  type?: "text" | "password";
  copied: string | null;
  onCopy: (value: string, id: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-400 mb-2">{label}</label>
      <div className="flex gap-2">
        <input
          type={type}
          value={value}
          readOnly
          className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono"
        />
        <button
          onClick={() => onCopy(value, id)}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
        >
          {copied === id ? <Check size={18} className="text-green-500" /> : <Copy size={18} className="text-white" />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const GoLiveButton: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [isLive,    setIsLive]    = useState(false);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [copied,     setCopied]     = useState<string | null>(null);
  const [error,      setError]      = useState("");

  const [formData, setFormData] = useState<FormData>({ title: "", description: "" });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const startStream = async () => {
    if (!auth.currentUser) { setError("Please log in to go live"); return; }
    if (!formData.title.trim()) { setError("Please enter a stream title"); return; }

    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res   = await fetch(`${API_URL}/live/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        const normalized: StreamData = {
          streamId: String(data.streamId ?? data.stream_id ?? data.id ?? ""),
          streamKey: String(data.streamKey ?? data.stream_key ?? ""),
          streamUrl: String(data.streamUrl ?? data.stream_url ?? data.ingest_url ?? ""),
          hlsUrl: String(data.hlsUrl ?? data.hls_url ?? ""),
        };
        setStreamData(normalized);
        setIsLive(true);
      } else {
        const err = await res.json();
        setError(err.error ?? "Failed to start stream");
      }
    } catch {
      setError("Failed to start stream. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const stopStream = async () => {
    if (!streamData) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`${API_URL}/live/${streamData.streamId}/stop`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setIsLive(false);
      setStreamData(null);
      setShowModal(false);
      setFormData({ title: "", description: "" });
    } catch {
      setError("Failed to stop stream");
    }
  };

  return (
    <>
      {/* Trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white transition-all ${
          isLive
            ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/50"
            : "bg-gradient-to-r from-red-500 to-red-700 hover:shadow-lg hover:shadow-red-500/50"
        }`}
      >
        {isLive ? <><Radio size={20} className="animate-pulse" /> YOU'RE LIVE</> : <><Video size={20} /> Go Live</>}
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => !isLive && !loading && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-gradient-to-br from-zinc-900 to-black rounded-2xl p-8 max-w-2xl w-full border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Video className="text-red-500" />
                  {isLive ? "You're Live!" : "Start Live Stream"}
                </h2>
                <button
                  onClick={() => !loading && setShowModal(false)}
                  disabled={loading}
                  className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {!isLive ? (
                /* Setup form */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-zinc-400 mb-2">Stream Title *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                      placeholder="My awesome live stream"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zinc-400 mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      placeholder="What's your stream about?"
                      rows={3}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors resize-none"
                      maxLength={500}
                    />
                  </div>
                  <button
                    onClick={startStream}
                    disabled={!formData.title.trim() || loading}
                    className="w-full py-4 bg-gradient-to-r from-red-500 to-red-700 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Starting…</> : <><Radio size={20} /> Start Broadcasting</>}
                  </button>
                </div>
              ) : (
                /* Stream info */
                <div className="space-y-6">
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                    <Radio size={24} className="text-red-500 animate-pulse" />
                    <div>
                      <p className="text-white font-bold">You're broadcasting live!</p>
                      <p className="text-zinc-400 text-sm">Share your stream with viewers</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <CopyRow label="Stream URL (for OBS/Streaming Software)" value={streamData?.streamUrl ?? ""} id="url"   copied={copied} onCopy={copyToClipboard} />
                    <CopyRow label="Stream Key (Keep Private!)"               value={streamData?.streamKey ?? ""} id="key"   type="password" copied={copied} onCopy={copyToClipboard} />
                    <CopyRow label="Watch URL (Share with viewers)"            value={`${import.meta.env.VITE_APP_URL ?? window.location.origin}/live/watch/${streamData?.streamId}`} id="watch" copied={copied} onCopy={copyToClipboard} />
                  </div>

                  {/* OBS setup guide */}
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <h4 className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                      <Zap size={16} /> Quick Setup Guide
                    </h4>
                    <ol className="text-xs text-gray-400 space-y-2">
                      {[
                        "Open OBS Studio (or your streaming software)",
                        "Go to Settings → Stream",
                        'Select "Custom" as service',
                        "Paste the Stream URL and Stream Key above",
                        'Click "Start Streaming" in OBS',
                      ].map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-red-500 font-bold">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <a
                    href={`/live/watch/${streamData?.streamId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye size={20} /> View My Stream
                  </a>

                  <button
                    onClick={stopStream}
                    className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <X size={20} /> End Stream
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GoLiveButton;

