#!/usr/bin/env python3
"""
Generates the built-in Studio Editor music library.

Every sound here is synthesised from scratch by this script (oscillators +
noise), so AirStreamX owns the result outright: no samples, no third-party
recordings, no licence to track. Tracks are seamless loops.

USAGE (needs numpy, scipy + ffmpeg with libmp3lame):
    python3 scripts/studio-music/generate.py
Writes public/studio-music/<id>.mp3 and public/studio-music/manifest.json
"""
import json
import os
import subprocess
import tempfile
import wave

import numpy as np
from scipy.signal import lfilter

SR = 44100
TARGET_LUFS = -15.0
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "studio-music")
rng = np.random.default_rng(7)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    """Simple ADSR envelope, times in seconds, n samples long."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.full(n, s, dtype=np.float64)
    a = min(a, n)
    e[:a] = np.linspace(0, 1, a, endpoint=False)
    d = min(d, n - a)
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)
    r = min(r, n)
    if r:
        e[n - r:] *= np.linspace(1, 0, r)
    return e


def one_pole_lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def highpass(x, cutoff):
    return x - one_pole_lowpass(x, cutoff)


# ── instruments ────────────────────────────────────────────────────────────────
def keys(freq, dur):
    """Soft electric-piano style tone."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 3)
    tone += 0.08 * np.sin(2 * np.pi * 7 * freq * t) * np.exp(-t * 12)  # bell attack
    return tone * env_adsr(n, 0.005, 0.6, 0.35, min(0.3, dur / 2))


def pad(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = sum(np.sin(2 * np.pi * freq * k * (1 + 0.002 * k) * t) / k for k in range(1, 6))
    tone += sum(np.sin(2 * np.pi * freq * 1.004 * k * t) / k for k in range(1, 4)) * 0.6  # detune chorus
    return tone * env_adsr(n, min(0.6, dur / 3), 0.3, 0.8, min(0.8, dur / 3)) * 0.35


def pluck(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tri = 2 * np.abs(2 * ((freq * t) % 1) - 1) - 1
    return tri * np.exp(-t * 9) * 0.6


def bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t)
    return tone * env_adsr(n, 0.005, 0.15, 0.6, 0.05) * 0.8


def brass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    saw = 2 * ((freq * t) % 1) - 1
    return one_pole_lowpass(saw, 1800) * env_adsr(n, 0.03, 0.1, 0.7, 0.08) * 0.5


def kick(dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def snare(dur=0.22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1500)
    return (noise * 0.5 + np.sin(2 * np.pi * 190 * t) * 0.5) * np.exp(-t * 22)


def clap(dur=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1200)
    bursts = np.exp(-((t % 0.012) * 300)) * (t < 0.036) + np.exp(-t * 25) * (t >= 0.036)
    return noise * bursts * 0.6


def hat(dur=0.06, open_=False):
    dur = 0.25 if open_ else dur
    n = int(dur * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 7000) * np.exp(-t * (12 if open_ else 60)) * 0.35


def shaker(dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 5000) * np.sin(np.pi * t / dur) * 0.25


def dhol_low(dur=0.45):
    """Deep bass head ("dha")."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 70 + 60 * np.exp(-t * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + 0.2 * np.sin(2 * ph)) * np.exp(-t * 6)


def dhol_high(dur=0.18):
    """Sharp treble head ("tin")."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 420 * t) * 0.6 + highpass(rng.standard_normal(n), 2500) * 0.5
    return tone * np.exp(-t * 28)


# ── arrangement helpers ────────────────────────────────────────────────────────
class Track:
    def __init__(self, bpm, bars, beats_per_bar=4):
        self.bpm = bpm
        self.beat = 60 / bpm
        self.len = int(round(bars * beats_per_bar * self.beat * SR))
        self.buf = np.zeros((2, self.len + SR * 3))  # extra room for tails, wrapped later

    def add(self, sound, at_beat, gain=1.0, pan=0.0):
        start = int(round(at_beat * self.beat * SR))
        end = start + len(sound)
        left = gain * np.cos((pan + 1) * np.pi / 4)
        right = gain * np.sin((pan + 1) * np.pi / 4)
        self.buf[0, start:end] += sound * left
        self.buf[1, start:end] += sound * right

    def finish(self, reverb=0.25):
        x = self.buf
        if reverb:
            # Small stereo reverb from a few feedback delays.
            wet = np.zeros_like(x)
            for ch, delays in enumerate(([1557, 1617, 1491, 1422], [1277, 1356, 1188, 1116])):
                for d in delays:
                    y = np.zeros(x.shape[1])
                    src = x[ch]
                    fb = 0.72
                    for k in range(1, 9):
                        off = d * k * 3
                        if off >= len(y):
                            break
                        y[off:] += src[: len(y) - off] * (fb ** k)
                    wet[ch] += one_pole_lowpass(y, 5000) / len(delays)
            x = x + wet * reverb
        # Wrap the tail into the start so the loop is seamless.
        out = x[:, : self.len].copy()
        tail = x[:, self.len:]
        out[:, : tail.shape[1]] += tail[:, : out.shape[1]]
        out = np.tanh(out / (np.max(np.abs(out)) + 1e-9) * 1.6)  # gentle limiter
        return out / np.max(np.abs(out)) * 0.89


CHORDS = {
    "maj": [0, 4, 7], "min": [0, 3, 7], "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10],
    "sus2": [0, 2, 7], "7": [0, 4, 7, 10],
}


def chord_notes(root, kind, octave_shift=0):
    return [root + i + 12 * octave_shift for i in CHORDS[kind]]


# ── tracks ─────────────────────────────────────────────────────────────────────
def chai_break():
    """Lo-fi, mellow. Good for food / cafe / vlogs."""
    tr = Track(80, 16)
    prog = [(53, "maj7"), (52, "min7"), (50, "min7"), (48, "maj7")]  # F E D C
    for bar in range(16):
        root, kind = prog[bar % 4]
        b0 = bar * 4
        for note in chord_notes(root, kind, 1):
            tr.add(keys(midi_hz(note), tr.beat * 3.8), b0, 0.16, pan=rng.uniform(-0.3, 0.3))
        tr.add(bass(midi_hz(root - 12), tr.beat * 1.5), b0, 0.5)
        tr.add(bass(midi_hz(root - 12), tr.beat * 0.9), b0 + 2.5, 0.4)
        if bar >= 2:  # drums come in after an intro
            tr.add(kick(), b0, 0.8)
            tr.add(kick(), b0 + 2.5, 0.6)
            tr.add(snare(), b0 + 1, 0.35)
            tr.add(snare(), b0 + 3, 0.35)
            for h in range(8):
                swing = 0.08 if h % 2 else 0
                tr.add(hat(), b0 + h * 0.5 + swing, 0.5 if h % 2 else 0.8, pan=0.3)
    return tr.finish(0.35)


def bazaar_bounce():
    """Upbeat pop. Good for shop promos and deals."""
    tr = Track(112, 16)
    prog = [(60, "maj"), (55, "maj"), (57, "min"), (53, "maj")]  # C G Am F
    for bar in range(16):
        root, kind = prog[bar % 4]
        b0 = bar * 4
        notes = chord_notes(root, kind, 0)
        for step in range(8):
            n = notes[[0, 1, 2, 1, 0, 2, 1, 2][step]] + 12
            tr.add(pluck(midi_hz(n), tr.beat * 0.6), b0 + step * 0.5, 0.3, pan=0.25 if step % 2 else -0.25)
        for note in notes:
            tr.add(pad(midi_hz(note), tr.beat * 4), b0, 0.12)
        for beat in range(4):
            tr.add(bass(midi_hz(root - 24), tr.beat * 0.45), b0 + beat + 0.5, 0.5)
            tr.add(kick(), b0 + beat, 0.9)
            tr.add(hat(), b0 + beat + 0.5, 0.6, pan=0.2)
        tr.add(clap(), b0 + 1, 0.55)
        tr.add(clap(), b0 + 3, 0.55)
        if bar % 4 == 3:
            tr.add(hat(open_=True), b0 + 3.5, 0.5)
    return tr.finish(0.2)


def sunrise_ghat():
    """Calm, spacious. Good for travel, temples, morning scenes."""
    tr = Track(70, 12)
    drone = [50, 57, 62]  # D A D
    for bar in range(0, 12, 2):
        for note in drone:
            tr.add(pad(midi_hz(note), tr.beat * 8.2), bar * 4, 0.2)
    # Pentatonic melody (D E F# A B), soft bell tone.
    melody = [74, 76, 78, 81, 78, 76, 74, 71, 74, 78, 81, 83, 81, 78, 76, 74]
    rhythm = [0, 1.5, 2, 3, 4.5, 5, 6, 7, 8, 9.5, 10, 11, 12.5, 13, 14, 15]
    for rep in range(3):
        for note, beat in zip(melody, rhythm):
            tr.add(keys(midi_hz(note), tr.beat * 1.6), rep * 16 + beat, 0.22, pan=rng.uniform(-0.5, 0.5))
    return tr.finish(0.55)


def festive_dhol():
    """Festive, energetic. Good for Diwali / Dussehra / wedding / sale videos."""
    tr = Track(100, 16)
    # Bhangra-style "dha - ge - dha - ge" groove across 8 eighth-notes.
    low = [0, 0.75, 2, 2.75]
    high = [0.5, 1, 1.5, 2.5, 3, 3.5]
    stabs = [(62, "maj"), (60, "maj"), (62, "maj"), (57, "7")]  # D C D A7
    for bar in range(16):
        b0 = bar * 4
        for b in low:
            tr.add(dhol_low(), b0 + b, 0.9)
        for b in high:
            tr.add(dhol_high(), b0 + b, 0.55, pan=0.15)
        for s in range(8):
            tr.add(shaker(), b0 + s * 0.5 + 0.25, 0.6, pan=-0.3)
        root, kind = stabs[bar % 4]
        for beat in (0, 1.5, 3):
            for note in chord_notes(root, kind):
                tr.add(brass(midi_hz(note), tr.beat * 0.45), b0 + beat, 0.12)
        tr.add(bass(midi_hz(root - 24), tr.beat * 0.9), b0, 0.5)
        tr.add(bass(midi_hz(root - 24), tr.beat * 0.9), b0 + 2, 0.45)
    return tr.finish(0.18)


TRACKS = [
    ("chai-break", "Chai Break", "Lo-fi · calm", "Cafe, food, vlogs", chai_break),
    ("bazaar-bounce", "Bazaar Bounce", "Upbeat · pop", "Shop promos, deals", bazaar_bounce),
    ("sunrise-ghat", "Sunrise Ghat", "Calm · ambient", "Travel, temples, mornings", sunrise_ghat),
    ("festive-dhol", "Festive Dhol", "Festive · dhol", "Festivals, weddings, sales", festive_dhol),
]


def write_mp3(path, stereo):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    pcm = (stereo.T * 32767).astype(np.int16)
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    # Measure loudness, then set every track to the same level (-15 LUFS)
    # so switching tracks never makes a sudden jump in volume.
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", wav_path, "-af", "ebur128", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    lufs = float([l for l in probe.splitlines() if l.strip().startswith("I:")][-1].split()[1])
    gain_db = TARGET_LUFS - lufs
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", wav_path, "-af", f"volume={gain_db:.2f}dB,alimiter=limit=0.89",
         "-c:a", "libmp3lame", "-b:a", "96k", path],
        check=True,
    )
    os.remove(wav_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []
    for track_id, title, mood, good_for, fn in TRACKS:
        audio = fn()
        path = os.path.join(OUT_DIR, f"{track_id}.mp3")
        write_mp3(path, audio)
        manifest.append({
            "id": track_id,
            "title": title,
            "mood": mood,
            "goodFor": good_for,
            "url": f"/studio-music/{track_id}.mp3",
            "duration": round(audio.shape[1] / SR, 2),
            "license": "Original — generated for AirStreamX (scripts/studio-music/generate.py). Free to use in any AirStreamX video.",
        })
        print(f"{track_id}: {audio.shape[1] / SR:.1f}s, {os.path.getsize(path) // 1024} KB")
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump({"tracks": manifest}, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
