// ============================================================
// types.ts — Shared TypeScript types for AIrStreamX
// ============================================================

export interface VideoItem {
  id: string;
  title: string;
  filename: string;
  thumbnail: string | null;
  thumbnails_base?: string;
  duration: number;
  uploader: string;
  status: "pending" | "processing" | "ready" | "failed";
  video_url: string;
  url?: string; // alias, for legacy compat
  views?: number;
  likes?: number;
  description?: string;
  category?: string;
  created_at?: string;
}

export interface WatchPosition {
  t: number; // current time in seconds
  d: number; // total duration in seconds
}

export interface ToastPayload {
  message: string;
  type: "success" | "error";
}

export type Theme = "dark" | "neon";

export interface ThemeClasses {
  page: string;
  panel: string;
}

