// Beat detection for the music library (runs on the phone, < 0.1 s per track).
//
// 1. Onset strength: how much the sound gets louder every 10 ms (low band for
//    kicks/dhol + full band for claps/snares).
// 2. Tempo: the repeat distance (60–180 BPM) where the onsets line up best
//    (autocorrelation, with a gentle preference for ~110 BPM to avoid half/double).
// 3. Phase: where the beat grid hits the most onsets.
// 4. Bar start (downbeat): which of every 4 beats has the strongest low end.
// Pure maths on samples, so it can be tested outside the browser.

export interface BeatInfo {
  bpm: number;
  /** Beat times in track seconds (one pass through the track). */
  beats: number[];
  /** Index into `beats` of the first bar start; bars are every 4 beats. */
  downbeat: number;
  /** 0..1 — how clearly the track has a beat (ambient tracks are low). */
  confidence: number;
  /** Loudness (RMS) per beat, same length as `beats`. */
  energy: number[];
}

const FPS = 100; // onset frames per second

export function detectBeats(samples: Float32Array, sampleRate: number): BeatInfo {
  const hop = Math.round(sampleRate / FPS);
  const frames = Math.floor(samples.length / hop);
  const duration = samples.length / sampleRate;

  // ── 1. onset strength ──
  const lowE = new Float32Array(frames);
  const allE = new Float32Array(frames);
  const a = Math.exp((-2 * Math.PI * 150) / sampleRate); // one-pole low-pass ~150 Hz
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let sl = 0, sa = 0;
    for (let k = f * hop, end = k + hop; k < end; k++) {
      const x = samples[k];
      lp = (1 - a) * x + a * lp;
      sl += lp * lp;
      sa += x * x;
    }
    lowE[f] = Math.log1p(1000 * sl / hop);
    allE[f] = Math.log1p(1000 * sa / hop);
  }
  const onset = new Float32Array(frames);
  const lowOnset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    lowOnset[f] = Math.max(0, lowE[f] - lowE[f - 1]);
    onset[f] = lowOnset[f] * 1.5 + Math.max(0, allE[f] - allE[f - 1]);
  }
  // Remove the slow trend so only sharp hits count.
  const smooth = movingAverage(onset, 25);
  for (let f = 0; f < frames; f++) onset[f] = Math.max(0, onset[f] - smooth[f]);

  // ── 2. tempo ──
  // Autocorrelation up to 4 beats of the slowest tempo (bars repeat too).
  const minLag = Math.floor((FPS * 60) / 180), maxLag = Math.ceil((FPS * 60) / 60);
  const acLen = Math.min(frames - 1, 4 * maxLag + 2);
  const ac = new Float32Array(acLen + 1);
  for (let lag = minLag; lag <= acLen; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    ac[lag] = s / (frames - lag);
  }
  const acAt = (lag: number) => (lag <= acLen ? ac[lag] : 0);
  let best = minLag, bestScore = -Infinity;
  const raw: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * FPS) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 105) / 1.2) ** 2);
    // A real beat also repeats every 2 and 4 beats (half bar, bar). Syncopated
    // grooves (dhol, lo-fi swing) are strong off the beat but still repeat per bar.
    const comb = (l: number) => Math.max(acAt(l - 1), acAt(l), acAt(l + 1));
    const periodic = comb(lag) + comb(2 * lag) + comb(4 * lag);
    raw.push(periodic);
    const score = periodic * prior;
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  // Sub-frame period (parabolic peak fit).
  const y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1];
  const shift = y0 + y2 - 2 * y1 !== 0 ? (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2) : 0;
  const period = best + Math.max(-0.5, Math.min(0.5, shift)); // frames per beat
  // Clear beat = the winner stands far above a typical tempo's score.
  const sorted = raw.slice().sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  const confidence = Math.max(0, Math.min(1, (bestScore / Math.exp(-0.5 * (Math.log2((60 * FPS) / best / 105) / 1.2) ** 2) / median - 1.5) / 3));

  // ── 3. phase ──
  const at = (arr: Float32Array, x: number) => {
    const i = Math.floor(x), fr = x - i;
    return i + 1 < arr.length ? arr[i] * (1 - fr) + arr[i + 1] * fr : 0;
  };
  let phase = 0, phaseScore = -1;
  for (let p = 0; p < period; p += 0.5) {
    let s = 0;
    for (let x = p; x < frames; x += period) s += Math.max(at(onset, x), at(onset, x - 1), at(onset, x + 1));
    if (s > phaseScore) { phaseScore = s; phase = p; }
  }
  // Fine-tune: pull the grid onto the actual hits (least-squares line through
  // the strongest onset near each grid beat). Fixes slow drift over the song.
  let p0 = phase, per = period;
  for (let pass = 0; pass < 2; pass++) {
    let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
    const win = Math.max(2, Math.round(per * 0.15));
    for (let k = 0, x = p0; x < frames - 1; k++, x = p0 + k * per) {
      let bx = Math.round(x), bv = 0;
      for (let d = -win; d <= win; d++) {
        const v = onset[Math.round(x) + d] ?? 0;
        if (v > bv) { bv = v; bx = Math.round(x) + d; }
      }
      if (bv <= 0) continue;
      sw += bv; sk += bv * k; st += bv * bx; skk += bv * k * k; skt += bv * k * bx;
    }
    const den = sw * skk - sk * sk;
    if (sw > 0 && Math.abs(den) > 1e-9) {
      const slope = (sw * skt - sk * st) / den;
      if (Math.abs(slope / per - 1) < 0.03) { per = slope; p0 = (st - slope * sk) / sw; }
    }
  }
  while (p0 - per >= -0.15 * per) p0 -= per; // first beat as early as possible
  const beats: number[] = [];
  for (let x = Math.max(0, p0); x / FPS < duration - 0.01; x += per) beats.push(x / FPS);
  const finalPeriod = per;

  // ── 4. downbeat ──
  const bar = [0, 0, 0, 0];
  // Bars usually start with a chord change + bass: compare the sound just
  // after each beat with the sound just before it (bigger change = bar start).
  const change = (t: number) => {
    const f = Math.round(t * FPS);
    let after = 0, before = 0;
    for (let d = 1; d <= 8; d++) { after += allE[f + d] ?? 0; before += allE[f - d - 4] ?? 0; }
    return Math.abs(after - before) + 2 * Math.max(at(lowOnset, t * FPS), at(lowOnset, t * FPS + 1));
  };
  beats.forEach((t, i) => { bar[i % 4] += change(t); });
  const downbeat = bar.indexOf(Math.max(...bar));

  // Loudness per beat (for picking the best part of the song).
  const energy = beats.map((t, i) => {
    const s = Math.floor(t * sampleRate), e = Math.min(samples.length, Math.floor((beats[i + 1] ?? duration) * sampleRate));
    let sum = 0;
    for (let k = s; k < e; k += 4) sum += samples[k] * samples[k];
    return Math.sqrt(sum / Math.max(1, (e - s) / 4));
  });

  return { bpm: (60 * FPS) / finalPeriod, beats, downbeat, confidence, energy };
}

function movingAverage(x: Float32Array, half: number): Float32Array {
  const out = new Float32Array(x.length);
  let s = 0, n = 0;
  for (let i = 0; i < Math.min(half, x.length); i++) { s += x[i]; n++; }
  for (let i = 0; i < x.length; i++) {
    if (i + half < x.length) { s += x[i + half]; n++; }
    if (i - half - 1 >= 0) { s -= x[i - half - 1]; n--; }
    out[i] = s / n;
  }
  return out;
}

/**
 * Where in the track the video should start: a bar start whose next stretch
 * (video length, max 8 bars) is the loudest, so the video gets the lively part.
 */
export function bestStart(info: BeatInfo, videoLength: number, trackDuration: number): number {
  const { beats, energy, downbeat } = info;
  if (!beats.length) return 0;
  const beatLen = 60 / info.bpm;
  const span = Math.max(4, Math.min(32, Math.round(Math.min(videoLength, trackDuration) / beatLen)));
  let bestT = beats[downbeat] ?? 0, bestE = -1;
  for (let i = downbeat; i < beats.length; i += 4) {
    if (beats[i] + Math.min(videoLength, 8 * 4 * beatLen) > trackDuration + 0.01 && i !== downbeat) break;
    let e = 0;
    for (let k = i; k < i + span; k++) e += energy[k % energy.length];
    if (e > bestE * 1.03) { bestE = e; bestT = beats[i]; } // prefer earlier when about equal
  }
  return bestT;
}

/**
 * Beat times on the TIMELINE: the track starts at `offset` and loops.
 * `bar` marks bar starts.
 */
export function timelineBeats(info: Pick<BeatInfo, "beats" | "downbeat">, offset: number, trackDuration: number, total: number): { t: number; bar: boolean }[] {
  const out: { t: number; bar: boolean }[] = [];
  if (!info.beats.length || trackDuration <= 0) return out;
  for (let loop = 0; loop * trackDuration - offset < total + 1; loop++) {
    info.beats.forEach((b, i) => {
      const t = loop * trackDuration + b - offset;
      if (t >= -0.001 && t <= total + 0.6) out.push({ t: Math.max(0, t), bar: (i - info.downbeat) % 4 === 0 });
    });
  }
  return out.sort((x, y) => x.t - y.t);
}
