/**
 * hls.js ships type declarations only for its main "hls.js" entry point,
 * not for the "hls.js/light" subpath we use to cut ~180KB off the
 * ShortsPage/VideoPlayer bundles (light build drops subtitle/EME support
 * this app never uses). The light build's public API is otherwise
 * identical to the full build, so we re-export the real types onto the
 * light subpath rather than letting it silently fall back to `any` —
 * that would've quietly undone every parameter type this file used to
 * get for free (Hls.Events, Level, error data, etc).
 */
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
