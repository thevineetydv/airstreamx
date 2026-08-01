import { ENV } from "./env";

export const API_URL = ENV.API_BASE;

export const VIDEOS_ENDPOINT = `${API_URL}/videos`;
export const UPLOAD_ENDPOINT = `${API_URL}/upload`; // base
export const UPLOAD_VIDEO_ENDPOINT = `${API_URL}/upload/video`;
export const UPLOAD_THUMBNAIL_ENDPOINT = `${API_URL}/upload/thumbnail`;

export const LS = {
  LIKES: "vh_likes_v1",
  COMMENTS: "vh_comments_v1",
  THEME: "vh_theme_v1",
  VOLUME: "vh_volume_v1",
  SPEED: "vh_speed_v1",
  AUTOPLAY_NEXT: "vh_autoplay_next_v1",
  WATCHPOS: "vh_watchpos_v1",
  AMBIENT: "vh_ambient_mode_v1",
  REDUCE_MOTION: "vh_reduce_motion_v1",
  CINEMATIC_BLUR: "vh_cinematic_blur_v1",
  FOCUS_MODE: "vh_focus_mode_v1",
};

