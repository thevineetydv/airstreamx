// Audio settings: original sound, background music (built-in library only), voice-over.

import { useEffect, useRef, useState } from "react";
import { Mic, Music, Pause, Play, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import type { AudioSettings, MusicTrackInfo, VoiceOver } from "../model/audio";
import { voiceOverEnd } from "../model/audio";
import { formatTime } from "../model/timeline";
import { loadLibrary } from "./library";
import { isRecordingSupported } from "./useVoiceRecorder";

interface Props {
  audio: AudioSettings;
  time: number;
  recording: boolean;
  selectedVoiceId: string | null;
  onChange: (patch: Partial<AudioSettings>) => void;
  /** Line the edit up with the music. Resolves to the BPM, or null (no clear beat). */
  onBeatSync: () => Promise<number | null>;
  onVoiceChange: (id: string, patch: Partial<Pick<VoiceOver, "volume">>) => void;
  onVoiceDelete: (id: string) => void;
  onRecord: () => void;
  onStopRecord: () => void;
  onDone: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function AudioPanel(props: Props) {
  const { audio, time, recording, selectedVoiceId, onChange, onBeatSync, onVoiceChange, onVoiceDelete, onRecord, onStopRecord, onDone } = props;
  const [syncState, setSyncState] = useState<"idle" | "busy" | "none" | "error">("idle");
  const beatSync = async () => {
    setSyncState("busy");
    try {
      setSyncState((await onBeatSync()) === null ? "none" : "idle");
    } catch {
      setSyncState("error");
    }
  };
  const [tracks, setTracks] = useState<MusicTrackInfo[] | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const [picking, setPicking] = useState(!audio.music);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const sampleRef = useRef<HTMLAudioElement | null>(null);
  const voiceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLibrary().then(setTracks).catch((e: Error) => setLibError(e.message));
  }, []);

  // Stop the sample player when the panel closes.
  useEffect(() => () => sampleRef.current?.pause(), []);

  // Scroll the panel (only the panel, not the page) to the voice-over picked on the timeline.
  useEffect(() => {
    const panel = panelRef.current;
    const item = selectedVoiceId ? voiceRefs.current[selectedVoiceId] : null;
    if (!panel || !item) return;
    const top = item.offsetTop; // panel is the offsetParent (position: relative)
    if (top < panel.scrollTop || top + item.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = Math.max(0, top - 8);
    }
  }, [selectedVoiceId]);

  const toggleSample = (t: MusicTrackInfo) => {
    sampleRef.current?.pause();
    if (sampleId === t.id) { setSampleId(null); return; }
    const el = new Audio(t.url);
    el.onended = () => setSampleId(null);
    sampleRef.current = el;
    setSampleId(t.id);
    void el.play().catch(() => setSampleId(null));
  };

  const pickTrack = (t: MusicTrackInfo) => {
    sampleRef.current?.pause();
    setSampleId(null);
    onChange({ music: { track: t, volume: audio.music?.volume ?? 0.6, fadeOut: audio.music?.fadeOut ?? true } });
    setPicking(false);
  };

  return (
    <div ref={panelRef} className="relative max-h-[46vh] space-y-4 overflow-y-auto px-3 py-3 text-sm" data-testid="audio-panel">
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex items-center justify-between bg-[#0b0b0b] px-3 py-2">
        <h3 className="font-bold text-white">Audio</h3>
        <button onClick={onDone} disabled={recording} className="rounded-full bg-white/10 px-4 py-1.5 font-semibold disabled:opacity-40" data-testid="audio-done">
          Done
        </button>
      </div>

      {/* ── Original sound ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Original sound</span>
          <button
            onClick={() => onChange({ originalMuted: !audio.originalMuted })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${audio.originalMuted ? "bg-red-600 text-white" : "bg-white/10"}`}
            data-testid="audio-mute-original"
          >
            {audio.originalMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {audio.originalMuted ? "Muted" : "Mute"}
          </button>
        </div>
        <label className="flex items-center gap-3 text-xs text-gray-400">
          Volume
          <input
            type="range" min={0} max={1} step={0.05}
            value={audio.originalVolume}
            disabled={audio.originalMuted}
            onChange={(e) => onChange({ originalVolume: Number(e.target.value) })}
            className="flex-1 accent-red-500 disabled:opacity-30"
            data-testid="audio-original-volume"
          />
          <span className="w-9 text-right tabular-nums">{pct(audio.originalVolume)}</span>
        </label>
      </section>

      {/* ── Music ── */}
      <section className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Background music</span>

        {audio.music && !picking && (
          <div className="space-y-2 rounded-2xl bg-white/5 p-3" data-testid="audio-music-current">
            <div className="flex items-center gap-2">
              <Music size={16} className="text-emerald-400" />
              <span className="flex-1 truncate font-semibold">{audio.music.track.title}</span>
              <button onClick={() => setPicking(true)} className="rounded-full border border-white/15 px-3 py-1 text-xs" data-testid="audio-music-change">Change</button>
              <button onClick={() => onChange({ music: null })} className="rounded-full p-1.5 text-red-400" aria-label="Remove music" data-testid="audio-music-remove">
                <Trash2 size={16} />
              </button>
            </div>
            <label className="flex items-center gap-3 text-xs text-gray-400">
              Volume
              <input
                type="range" min={0} max={1} step={0.05}
                value={audio.music.volume}
                onChange={(e) => audio.music && onChange({ music: { ...audio.music, volume: Number(e.target.value) } })}
                className="flex-1 accent-emerald-500"
                data-testid="audio-music-volume"
              />
              <span className="w-9 text-right tabular-nums">{pct(audio.music.volume)}</span>
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              <Toggle on={audio.music.fadeOut} onClick={() => audio.music && onChange({ music: { ...audio.music, fadeOut: !audio.music.fadeOut } })} label="Fade out at end" />
              <Toggle on={audio.duckMusic} onClick={() => onChange({ duckMusic: !audio.duckMusic })} label="Lower during voice-over" />
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 pt-2">
              <button
                onClick={() => void beatSync()}
                disabled={syncState === "busy"}
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                data-testid="beat-sync"
              >
                🥁 {syncState === "busy" ? "Finding beats…" : audio.music.beat ? "Sync again" : "Beat sync"}
              </button>
              <span className="flex-1 text-[11px] leading-tight text-gray-400" data-testid="beat-sync-status">
                {syncState === "none"
                  ? "This track has no clear beat (calm music), so nothing was moved."
                  : syncState === "error"
                    ? "Could not read the music. Try again."
                    : audio.music.beat
                      ? `Synced · ${Math.round(audio.music.beat.bpm)} BPM — cuts, text and ending are on the beat.`
                      : "Puts cuts, text and the ending on the music's beat."}
              </span>
            </div>
          </div>
        )}

        {picking && (
          <div className="space-y-1.5" data-testid="audio-library">
            {libError && <p className="text-xs text-red-400">{libError}</p>}
            {!tracks && !libError && <p className="text-xs text-gray-500">Loading music…</p>}
            {tracks?.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
                <button
                  onClick={() => toggleSample(t)}
                  className="rounded-full bg-white/10 p-2"
                  aria-label={sampleId === t.id ? `Stop ${t.title}` : `Listen to ${t.title}`}
                >
                  {sampleId === t.id ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.title}</div>
                  <div className="truncate text-[11px] text-gray-400">{t.mood} · {t.goodFor}</div>
                </div>
                <button
                  onClick={() => pickTrack(t)}
                  className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold"
                  data-testid={`audio-use-${t.id}`}
                >
                  Use
                </button>
              </div>
            ))}
            {audio.music && (
              <button onClick={() => setPicking(false)} className="text-xs text-gray-400 underline">Cancel</button>
            )}
            <p className="text-[11px] text-gray-500">All tracks are original and free to use in AirStreamX videos.</p>
          </div>
        )}
      </section>

      {/* ── Voice-over ── */}
      <section className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Voice-over</span>
        {!isRecordingSupported() ? (
          <p className="text-xs text-yellow-400">This browser cannot record audio.</p>
        ) : recording ? (
          <button onClick={onStopRecord} className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-3 font-bold" data-testid="audio-stop-record">
            <Square size={16} /> Stop recording
          </button>
        ) : (
          <button onClick={onRecord} className="flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-3 font-bold" data-testid="audio-record">
            <Mic size={18} className="text-red-500" /> Record from {formatTime(time)}
          </button>
        )}
        <p className="text-[11px] text-gray-500">The video plays while you speak. Use earphones for the cleanest sound.</p>

        {audio.voiceOvers.map((v, i) => (
          <div
            key={v.id}
            ref={(el) => { voiceRefs.current[v.id] = el; }}
            className={`space-y-1 rounded-xl p-2 ${v.id === selectedVoiceId ? "bg-violet-600/25 ring-1 ring-violet-400" : "bg-white/5"}`}
            data-testid="audio-voice-item"
          >
            <div className="flex items-center gap-2 text-xs">
              <Mic size={14} className="text-violet-300" />
              <span className="flex-1 tabular-nums">
                Voice {i + 1} · {formatTime(v.start)} → {formatTime(voiceOverEnd(v))}
              </span>
              <button onClick={() => onVoiceDelete(v.id)} className="rounded-full p-1.5 text-red-400" aria-label="Delete voice-over" data-testid="audio-voice-delete">
                <Trash2 size={14} />
              </button>
            </div>
            <label className="flex items-center gap-3 text-xs text-gray-400">
              Volume
              <input
                type="range" min={0} max={1.5} step={0.05}
                value={v.volume}
                onChange={(e) => onVoiceChange(v.id, { volume: Number(e.target.value) })}
                className="flex-1 accent-violet-500"
                aria-label="Voice-over volume"
              />
              <span className="w-10 text-right tabular-nums">{pct(v.volume)}</span>
            </label>
          </div>
        ))}
      </section>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 ${on ? "bg-emerald-600/80 text-white" : "bg-white/10 text-gray-300"}`}>
      {on ? "✓ " : ""}{label}
    </button>
  );
}
