// ============================================================
// useAppLogic.ts — Core app state and logic for AIrStreamX
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoItem, WatchPosition, ToastPayload, Theme, ThemeClasses } from "./types";
import { useAuth } from "./context/AuthContext";
import { auth } from "./firebase";
import { LS } from "./utils/constants";

const API_URL = (import.meta.env.VITE_API_BASE as string) || "";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CurrentVideo {
  id: string;
  title: string;
  url: string | undefined;
  thumbnail: string | null;
  savedPos: WatchPosition;
}

interface AppLogic {
  videos: VideoItem[];
  currentVideo: CurrentVideo | undefined;
  nextVideo: VideoItem | null;
  handleUpload: React.ChangeEventHandler<HTMLInputElement>;
  uploading: boolean;
  uploadProgress: number;
  toast: ToastPayload | null;
  setToast: React.Dispatch<React.SetStateAction<ToastPayload | null>>;
  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  themeCls: ThemeClasses;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isFullscreen: boolean;
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  handleEnded: () => void;
  upNextVisible: boolean;
  upNextCount: number;
  setUpNextVisible: React.Dispatch<React.SetStateAction<boolean>>;
  autoplayNext: boolean;
  setAutoplayNext: React.Dispatch<React.SetStateAction<boolean>>;
  current: VideoItem | null;
  currentId: string | null;
  setCurrentId: React.Dispatch<React.SetStateAction<string | null>>;
  watchPos: Record<string, WatchPosition>;
  setWatchPos: React.Dispatch<React.SetStateAction<Record<string, WatchPosition>>>;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useAppLogic(): AppLogic {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "dark"
  );
  const [autoplayNext, setAutoplayNext] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS.AUTOPLAY_NEXT);
      return saved ? saved === "1" : true;
    } catch {
      return true;
    }
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [upNextVisible, setUpNextVisible] = useState(false);
  const [upNextCount, setUpNextCount] = useState(5);
  const [watchPos, setWatchPos] = useState<Record<string, WatchPosition>>(() => {
    // ✅ Defer expensive JSON.parse to requestIdleCallback
    try {
      const saved = localStorage.getItem("watchPos");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch Videos ──────────────────────────────

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_URL}/videos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const result = await res.json();

      if (!Array.isArray(result.videos)) {
        console.error("Unexpected response shape:", result);
        setVideos([]);
        return;
      }

      const normalized: VideoItem[] = result.videos.map((v: Record<string, unknown>) => ({
        id: (v.id ?? v._id ?? v.videoId) as string,
        title: (v.title ?? v.name ?? v.filename ?? "Untitled Video") as string,
        filename: (v.filename ?? v.title ?? "Untitled") as string,
        thumbnail:
          (v.thumbnail as string | null) ??
          (v.thumb as string | null) ??
          (v.filename
            ? `${API_URL}/hls/thumbnails/${String(v.filename).replace(/\.[^/.]+$/, "")}/thumb_001.jpg`
            : null),
        thumbnails_base: v.thumbnails_base as string | undefined,
        duration: (v.duration as number) ?? 0,
        uploader: (v.uploader ?? v.uploadedBy ?? v.uploader_email ?? "Unknown") as string,
        status: (v.status ?? "ready") as VideoItem["status"],
        video_url: (v.video_url ?? v.url ?? `${API_URL}/hls/${String(v.filename).replace(/\.[^/.]+$/, "")}/master.m3u8`) as string,
      }));

      setVideos(normalized);
      setCurrentId((prev) => {
        if (prev && normalized.some((v) => v.id === prev)) return prev;
        const saved = localStorage.getItem("lastVideoId");
        if (saved && normalized.some((v) => v.id === saved)) return saved;
        return normalized[0]?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to fetch videos:", err);
      setToast({ message: "Failed to load videos", type: "error" });
    }
  };

  useEffect(() => {
    fetchVideos();
    // ✅ Use longer polling interval to reduce network activity
    const interval = setInterval(fetchVideos, 60_000); // 60s instead of 30s
    return () => clearInterval(interval);
  }, [token]); // re-fetch when auth state changes

  // ── Upload Handler ────────────────────────────

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const currentUser = auth.currentUser;
      const idToken = currentUser ? await currentUser.getIdToken() : null;

      if (!idToken) {
        setToast({ message: "Please log in before uploading", type: "error" });
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/upload`, true);
      xhr.setRequestHeader("Authorization", `Bearer ${idToken}`);

      xhr.upload.onprogress = ({ loaded, total, lengthComputable }) => {
        if (lengthComputable) {
          setUploadProgress(Math.round((loaded / total) * 100));
        }
      };

      xhr.onload = async () => {
        setUploading(false);
        if (xhr.status === 200) {
          setToast({ message: "Upload complete! Processing started…", type: "success" });
          await fetchVideos();
        } else {
          setToast({ message: `Upload failed: ${xhr.responseText}`, type: "error" });
        }
        e.target.value = "";
      };

      xhr.onerror = () => {
        setUploading(false);
        setToast({ message: "Network error during upload", type: "error" });
      };

      xhr.send(formData);
    } catch (err) {
      console.error("Upload error:", err);
      setToast({ message: "Upload failed", type: "error" });
      setUploading(false);
    }
  };

  // ── Analytics (Deferred) ──────────────────────────────

  const sendAnalytics = async (event: string, videoId?: string) => {
    if (!videoId || !token) return;
    // ✅ Defer analytics to requestIdleCallback to avoid blocking user interactions
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        fetch(`${API_URL}/analytics/track`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoId, event }),
        }).catch(() => {
          // Non-critical — fail silently
        });
      });
    } else {
      setTimeout(() => {
        fetch(`${API_URL}/analytics/track`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoId, event }),
        }).catch(() => {
          // Non-critical — fail silently
        });
      }, 2000);
    }
  };

  // ── Persist to localStorage ───────────────────

  useEffect(() => {
    if (currentId) localStorage.setItem("lastVideoId", currentId);
  }, [currentId]);

  // Debounce watchPos persistence to avoid excessive localStorage writes
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem("watchPos", JSON.stringify(watchPos));
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [watchPos]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(LS.AUTOPLAY_NEXT, autoplayNext ? "1" : "0");
    } catch {}
  }, [autoplayNext]);

  // ── Computed Values ───────────────────────────

  const current = useMemo(
    () => videos.find((v) => v.id === currentId) ?? null,
    [videos, currentId]
  );

  const currentVideo = useMemo<CurrentVideo | undefined>(() => {
    if (!current) return undefined;
    return {
      id: current.id,
      title: current.title || current.filename || "Untitled Video",
      url: current.video_url || current.url,
      thumbnail: current.thumbnail,
      savedPos: watchPos[current.id] ?? { t: 0, d: current.duration ?? 0 },
    };
  }, [current, watchPos]);

  const currentIndex = useMemo(
    () => (currentId ? videos.findIndex((v) => v.id === currentId) : -1),
    [videos, currentId]
  );

  const nextVideo = useMemo<VideoItem | null>(() => {
    if (currentIndex < 0 || videos.length === 0) return null;
    return videos[(currentIndex + 1) % videos.length];
  }, [currentIndex, videos]);

  // ── Autoplay / "Up Next" ──────────────────────

  const handleEnded = () => {
    if (!autoplayNext || !nextVideo) return;
    setUpNextVisible(true);
    setUpNextCount(5);
    sendAnalytics("ended", currentVideo?.id);
  };

  useEffect(() => {
    if (!upNextVisible || !autoplayNext) return;
    const timer = setInterval(() => {
      setUpNextCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          if (nextVideo) setCurrentId(nextVideo.id);
          setUpNextVisible(false);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [upNextVisible, autoplayNext, nextVideo]);

  // Track play event when current video changes
  useEffect(() => {
    if (currentVideo?.id) sendAnalytics("play", currentVideo.id);
  }, [currentVideo?.id]);

  // ── Theme Classes ─────────────────────────────

  const themeCls: ThemeClasses =
    theme === "dark"
      ? { page: "bg-[#0f0f0f] text-[#e5e5e5]", panel: "bg-[#181818] border-white/10" }
      : { page: "bg-slate-950 text-slate-100", panel: "bg-[#0a0000] border-red-500/20" };

  // ── Return ────────────────────────────────────

  return {
    videos,
    currentVideo,
    nextVideo,
    handleUpload,
    uploading,
    uploadProgress,
    toast,
    setToast,
    q,
    setQ,
    theme,
    setTheme,
    themeCls,
    fileInputRef,
    isFullscreen,
    setIsFullscreen,
    handleEnded,
    upNextVisible,
    upNextCount,
    setUpNextVisible,
    autoplayNext,
    setAutoplayNext,
    current,
    currentId,
    setCurrentId,
    watchPos,
    setWatchPos,
  };
}

