/**
 * Returns the URL only if it is a normal web link (http/https), otherwise
 * undefined. Use for any href built from user-entered data — a stored
 * "javascript:..." link would otherwise run code when clicked.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const v = url.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
