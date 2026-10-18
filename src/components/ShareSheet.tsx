// components/ShareSheet.tsx
//
// Every completed share is counted (POST /videos/:id/share) so shared
// videos rise on Trending.
//
// One share dialog for long videos and Shorts:
//   • "Share to Story" — makes a 9:16 story image and opens the phone's
//     share sheet (Instagram / WhatsApp / Facebook Stories); on desktop it
//     downloads the image and copies the link for a link sticker.
//   • WhatsApp, Facebook, X, Telegram, Copy link, and the phone's own
//     share menu ("More apps").
//   • Optional "Start at 2:31" for long videos.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Link2, Check, Loader2, Smartphone, MoreHorizontal } from "lucide-react";
import {
  videoShareUrl, shareTargetUrl, copyText, canNativeShare, createStoryCardSafe,
  downloadBlob, fmtClock, type ShareTarget,
} from "../utils/share";
import { trackShare } from "../utils/trending";

interface Props {
  videoId: string | number;
  title: string;
  channel?: string;
  thumbnail?: string;
  short?: boolean;
  /** Current position (seconds) — enables "Start at" for long videos */
  position?: number;
  onClose: () => void;
}

const TARGETS: { key: ShareTarget; label: string; bg: string; glyph: string }[] = [
  { key: "whatsapp", label: "WhatsApp", bg: "#25D366", glyph: "💬" },
  { key: "facebook", label: "Facebook", bg: "#1877F2", glyph: "f" },
  { key: "x",        label: "X",        bg: "#111",    glyph: "𝕏" },
  { key: "telegram", label: "Telegram", bg: "#2AABEE", glyph: "✈️" },
];

export default function ShareSheet({ videoId, title, channel, thumbnail, short, position, onClose }: Props) {
  const canStartAt = !short && typeof position === "number" && position >= 5;
  const [startAt, setStartAt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const url = videoShareUrl(videoId, { short, startAt: startAt && canStartAt ? position : 0 });
  const text = short ? `Watch this Short on AirStreamX: ${title}` : `Watch "${title}" on AirStreamX`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [onClose]);

  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    if (ok) {
      trackShare(videoId, "copy");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
      trackShare(videoId, "native");
    } catch {
      // user cancelled — nothing to do
    }
  };

  // Build the story image as soon as the sheet opens. Phones only allow
  // navigator.share() right after a tap, so the image must be ready before
  // the "Share to Story" tap — not generated after it.
  const storyRef = useRef<Promise<Blob> | null>(null);
  useEffect(() => {
    storyRef.current = createStoryCardSafe({ title, channel, thumbnail, short });
    storyRef.current.catch(() => {});
  }, [title, channel, thumbnail, short]);

  const shareStory = async () => {
    setStoryBusy(true);
    setNotice("");
    try {
      const blob = await (storyRef.current ?? createStoryCardSafe({ title, channel, thumbnail, short }));
      const file = new File([blob], "airstreamx-story.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text: `${text}\n${url}` });
          trackShare(videoId, "story");
          const copiedOk = await copyText(url);
          setNotice(copiedOk
            ? "Link copied — paste it with the Link sticker in your story 🔗"
            : `Add this link with the Link sticker: ${url}`);
        } catch (e) {
          // NotAllowedError = the browser needs a fresh tap; anything else = cancelled
          if ((e as Error)?.name === "NotAllowedError") setNotice("Tap “Share to Story” once more.");
        }
      } else {
        downloadBlob(blob, "airstreamx-story.png");
        await copyText(url);
        trackShare(videoId, "story");
        setNotice("Story image downloaded and link copied. Post the image to your story and add the link with the Link sticker 🔗");
      }
    } catch {
      setNotice("Could not create the story image. Please try again.");
    } finally {
      setStoryBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[#1c1c1c] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 id="share-sheet-title" className="text-white font-semibold">Share</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-white/10 text-gray-300">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 px-5 pb-4">
          {thumbnail && (
            <img src={thumbnail} alt="" className={`${short ? "w-10 h-16" : "w-24 aspect-video"} rounded-lg object-cover bg-black flex-shrink-0`} />
          )}
          <div className="min-w-0">
            <p className="text-sm text-white font-medium line-clamp-2">{title}</p>
            {channel && <p className="text-xs text-gray-400 truncate">{channel}</p>}
          </div>
        </div>

        {/* Story — the main action */}
        <div className="px-5">
          <button
            type="button"
            onClick={shareStory}
            disabled={storyBusy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-pink-600 via-red-500 to-orange-500 hover:opacity-95 disabled:opacity-60"
          >
            {storyBusy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Smartphone size={18} aria-hidden="true" />}
            Share to Story
          </button>
          <p className="text-[11px] text-gray-500 text-center mt-1.5">Instagram, WhatsApp & Facebook Stories</p>
        </div>

        {/* Apps */}
        <div className="grid grid-cols-5 gap-2 px-5 pt-4">
          {TARGETS.map((t) => (
            <a
              key={t.key}
              href={shareTargetUrl(t.key, url, text)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackShare(videoId, t.key)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold group-hover:scale-105 transition" style={{ background: t.bg }} aria-hidden="true">
                {t.glyph}
              </span>
              <span className="text-[11px] text-gray-300">{t.label}</span>
            </a>
          ))}
          {canNativeShare() ? (
            <button type="button" onClick={nativeShare} className="flex flex-col items-center gap-1.5 group">
              <span className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 group-hover:scale-105 transition" aria-hidden="true">
                <MoreHorizontal size={20} className="text-white" />
              </span>
              <span className="text-[11px] text-gray-300">More apps</span>
            </button>
          ) : (
            <button type="button" onClick={copy} className="flex flex-col items-center gap-1.5 group">
              <span className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 group-hover:scale-105 transition" aria-hidden="true">
                {copied ? <Check size={20} className="text-emerald-400" /> : <Link2 size={20} className="text-white" />}
              </span>
              <span className="text-[11px] text-gray-300">{copied ? "Copied" : "Copy"}</span>
            </button>
          )}
        </div>

        {/* Link + copy */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl pl-3 pr-1 py-1">
            <input
              readOnly
              value={url}
              aria-label="Video link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-transparent text-xs text-gray-300 outline-none"
            />
            <button type="button" onClick={copy} className="px-3 py-2 rounded-lg text-xs font-semibold bg-white text-black hover:bg-gray-200 flex items-center gap-1">
              {copied ? <><Check size={14} aria-hidden="true" /> Copied</> : "Copy"}
            </button>
          </div>
          {canStartAt && (
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={startAt} onChange={(e) => setStartAt(e.target.checked)} className="accent-red-500 w-4 h-4" />
              Start at {fmtClock(position!)}
            </label>
          )}
          {notice && <p role="status" className="text-xs text-emerald-300 mt-3">{notice}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
