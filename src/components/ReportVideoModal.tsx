// components/ReportVideoModal.tsx
//
// 🚩 Report a video — like Netflix's "Report a problem" flag, plus content
// complaints (copyright, abuse…). Used from the Watch page "⋯" menu and the
// Shorts "more" sheet. Sends POST /videos/:id/report.
//
// Playback reports automatically include a few diagnostics (position in the
// video, network type, device class) so problems can be reproduced.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import { Flag, X, Loader2, CheckCircle2 } from "lucide-react";
import { API_URL } from "../utils/constants";

type Kind = "playback" | "content";

const REASONS: Record<Kind, { id: string; label: string }[]> = {
  playback: [
    { id: "buffering", label: "Video keeps buffering / stuck" },
    { id: "wont_play", label: "Video won't play" },
    { id: "no_audio", label: "No sound" },
    { id: "av_sync", label: "Sound and picture out of sync" },
    { id: "poor_quality", label: "Blurry / poor quality" },
    { id: "subtitles", label: "Subtitles wrong or missing" },
    { id: "other", label: "Something else" },
  ],
  content: [
    { id: "copyright", label: "Copyright — uses my content without permission" },
    { id: "sexual", label: "Sexual or nude content" },
    { id: "violence", label: "Violent or dangerous content" },
    { id: "hate", label: "Hateful or abusive content" },
    { id: "harassment", label: "Harassment or bullying" },
    { id: "child_safety", label: "Child safety concern" },
    { id: "misleading", label: "Misleading or fake" },
    { id: "spam", label: "Spam or scam" },
    { id: "other", label: "Something else" },
  ],
};

interface Props {
  /** Video id or public_id */
  videoId: string | number;
  videoTitle?: string;
  onClose: () => void;
  /** Current playback position in seconds (for playback reports) */
  getPosition?: () => number | undefined;
  /** Open on the content tab instead of playback */
  initialKind?: Kind;
}

function diagnostics(position?: number) {
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number };
  }).connection;
  return {
    position,
    network: conn?.effectiveType,
    downlink: conn?.downlink,
    device: typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop",
  };
}

export default function ReportVideoModal({ videoId, videoTitle, onClose, getPosition, initialKind = "playback" }: Props) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Position when the dialog opened (the video is usually paused by then)
  const positionRef = useRef<number | undefined>(getPosition?.());

  // Close on Escape, focus the dialog, restore focus on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [onClose]);

  const signedIn = !!getAuth().currentUser;

  const submit = async () => {
    if (!reason || sending) return;
    const user = getAuth().currentUser;
    if (!user) { setError("Please sign in to report a video."); return; }
    setSending(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_URL}/videos/${encodeURIComponent(String(videoId))}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind,
          reason,
          details: details.trim() || undefined,
          playback: kind === "playback" ? diagnostics(positionRef.current) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not send report. Please try again.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-video-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#1c1c1c] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <h2 id="report-video-title" className="flex items-center gap-2 text-white font-semibold">
            <Flag size={18} className="text-red-400" aria-hidden="true" /> Report a problem
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-white/10 text-gray-300">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center" role="status">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" aria-hidden="true" />
            <p className="text-white font-semibold">Thanks — report received</p>
            <p className="text-sm text-gray-400 mt-1">
              {kind === "content"
                ? "Our team will review this video. Serious issues are acted on within 24–36 hours."
                : "This helps us fix playback problems faster."}
            </p>
            <button type="button" onClick={onClose} className="mt-5 px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm">
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            {videoTitle && <p className="text-xs text-gray-400 mb-3 line-clamp-1">{videoTitle}</p>}

            {/* Kind switch */}
            <div role="tablist" aria-label="Report type" className="grid grid-cols-2 gap-1 p-1 bg-white/5 rounded-xl mb-4">
              {(["playback", "content"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => { setKind(k); setReason(""); }}
                  className={`py-2 rounded-lg text-sm font-medium transition ${kind === k ? "bg-white/15 text-white" : "text-gray-400 hover:text-gray-200"}`}
                >
                  {k === "playback" ? "Playback problem" : "Content problem"}
                </button>
              ))}
            </div>

            <fieldset>
              <legend className="sr-only">Reason</legend>
              <div className="space-y-1">
                {REASONS[kind].map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm ${reason === r.id ? "bg-red-500/10 text-white" : "text-gray-300 hover:bg-white/5"}`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="accent-red-500 w-4 h-4"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block mt-4">
              <span className="text-xs text-gray-400">
                {kind === "content" && reason === "copyright"
                  ? "Tell us what is yours (link to your original, your name/channel)"
                  : "More details (optional)"}
              </span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                rows={3}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 resize-none"
              />
            </label>

            {kind === "content" && reason === "copyright" && (
              <p className="text-xs text-gray-400 mt-2">
                For a formal takedown notice you can also email{" "}
                <a href="mailto:copyright@airstreamx.com" className="text-red-400 underline">copyright@airstreamx.com</a>.
              </p>
            )}

            {!signedIn && <p className="text-xs text-yellow-400 mt-3">Please sign in to send a report.</p>}
            {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-sm text-gray-300 hover:bg-white/10">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!reason || sending || !signedIn}
                className="px-5 py-2 rounded-full text-sm font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Send report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
