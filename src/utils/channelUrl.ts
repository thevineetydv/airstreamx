export function registerHandle() {
  return null;
}

/**
 * getChannelCustomization — accepts the already-fetched DB object (or null).
 * NEVER reads localStorage. PostgreSQL is the single source of truth.
 */
export function getChannelCustomization(data?: ChannelCustomization | null): ChannelCustomization | null {
  return data ?? null;
}

/**
 * channelUrl — builds a clean /@handle URL (YouTube style).
 *
 *   channelUrl("vineetsitm09")           → /@vineetsitm09
 *   channelUrl("@vineetsitm09")          → /@vineetsitm09
 *   channelUrl("vineetsitm09@gmail.com") → /@vineetsitm09
 */
export function channelUrl(handleOrEmail: string): string {
  if (!handleOrEmail) return "/";

  // Already a handle (no @domain part) — clean and prefix with @
  if (!handleOrEmail.includes("@") || handleOrEmail.startsWith("@")) {
    const clean = handleOrEmail.replace(/^@/, "").trim();
    return `/@${encodeURIComponent(clean)}`;
  }

  // It's an email — derive handle from local part
  const handle = handleOrEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "");
  return `/@${encodeURIComponent(handle)}`;
}

/**
 * buildChannelUrl — preferred when you have both handle and email.
 * Uses handle when available, falls back to email-derived handle.
 *
 * Usage: buildChannelUrl(video.handle, video.uploader_email)
 */
export function buildChannelUrl(handle?: string | null, email?: string | null): string {
  const h = handle?.replace(/^@/, "").trim();
  if (h) return `/@${encodeURIComponent(h)}`;
  if (email) return channelUrl(email);
  return "/";
}

/**
 * Resolve channel param safely — handles both @handle and email formats.
 * Returns the raw handle string (no @ prefix, no encoding).
 */
export function resolveChannelParam(param: string): string {
  if (!param) return "";
  try {
    const decoded = decodeURIComponent(param).replace(/^@/, "").trim();
    return decoded;
  } catch {
    return param.replace(/^@/, "").trim();
  }
}

export interface ChannelCustomization {
  id?: number;
  email: string;
  channel_name: string;
  handle: string;
  description?: string;
  contact_email?: string;
  avatar_url?: string;
  banner_url?: string;
  watermark_url?: string;
  links?: {
    id: string;
    label: string;
    url: string;
  }[];
  created_at?: string;
  updated_at?: string;
}

export function getChannelDisplayName(
  channel: ChannelCustomization | null | undefined
): string {
  if (!channel) return "";
  return channel.channel_name || channel.handle || channel.email?.split("@")[0] || "Creator";
}

export function getChannelHandle(
  channel: ChannelCustomization | null | undefined
): string {
  if (!channel) return "creator";
  return channel.handle || "creator";
}

export function getChannelAvatar(
  channel: ChannelCustomization | null | undefined
): string {
  if (!channel) return "";
  return channel.avatar_url || "";
}

export function getChannelBanner(
  channel: ChannelCustomization | null | undefined
): string {
  if (!channel) return "";
  return channel.banner_url || "";
}

export function getChannelWatermark(
  channel: ChannelCustomization | null | undefined
): string {
  if (!channel) return "";
  return channel.watermark_url || "";
}