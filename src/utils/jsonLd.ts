/**
 * Serialize JSON-LD for a <script type="application/ld+json"> tag.
 *
 * JSON.stringify does not escape "<", so a video title or channel name
 * containing "</script><script>…" would close the tag and run as code
 * (stored XSS). Escaping <, > and & as \u escapes keeps the JSON identical
 * for search engines while making it impossible to break out of the tag.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
