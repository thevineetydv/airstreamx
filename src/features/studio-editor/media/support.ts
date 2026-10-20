// Small check kept out of the export engine so the editor can show a
// warning without loading the encoder code.
export function isWebCodecsSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}
