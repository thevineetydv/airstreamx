// Records the microphone with MediaRecorder and returns the decoded audio.

import { useCallback, useRef, useState } from "react";
import { getAudioContext } from "./context";

/** First recording format this browser supports (Chrome: webm/opus, Safari: mp4/aac). */
function pickMimeType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

export function isRecordingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Ask for the mic and start recording. Resolves once recording has really started. */
  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorderRef.current = rec;
    await new Promise<void>((resolve, reject) => {
      rec.onstart = () => resolve();
      rec.onerror = () => reject(new Error("Recording failed to start"));
      rec.start();
    });
    setRecording(true);
  }, []);

  /** Stop and return the recording as an AudioBuffer (null if nothing was recorded). */
  const stop = useCallback(async (): Promise<AudioBuffer | null> => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!rec) return null;
    const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    if (rec.state !== "inactive") rec.stop();
    await stopped;
    rec.stream.getTracks().forEach((t) => t.stop()); // turn the mic light off
    const blob = new Blob(chunksRef.current, { type: rec.mimeType });
    chunksRef.current = [];
    if (!blob.size) return null;
    return getAudioContext().decodeAudioData(await blob.arrayBuffer());
  }, []);

  return { recording, start, stop };
}
