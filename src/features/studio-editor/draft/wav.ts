// Voice-overs are stored in drafts as plain 16-bit WAV: exact, simple to
// decode again, no encoder needed. (~94 KB per second for mono 48 kHz.)

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const out = new DataView(new ArrayBuffer(44 + dataSize));
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  text(0, "RIFF"); out.setUint32(4, 36 + dataSize, true); text(8, "WAVE");
  text(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, channels, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * channels * 2, true); out.setUint16(32, channels * 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, dataSize, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}
