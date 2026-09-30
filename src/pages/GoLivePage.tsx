// ============================================================
// GoLivePage.tsx — proper page wrapper around GoLiveButton
// ============================================================
//
// GoLiveButton.tsx is just a button + its setup modal, not a full
// page — the /go-live route was rendering it directly with no
// surrounding layout, which is why it looked like a broken/empty
// page with a button floating in the top-left corner. This wraps it
// with actual page context (heading, explanation, centered layout).

import { Radio, Video, Users, Zap } from "lucide-react";
import GoLiveButton from "../components/GoLiveButton";

export default function GoLivePage() {
  return (
    <div className="min-h-screen px-4 py-10 sm:py-16">
      <div className="max-w-xl mx-auto text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/30">
          <Radio className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">Go Live</h1>
        <p className="text-zinc-400 mb-10 leading-relaxed">
          Broadcast to your subscribers in real time using OBS Studio or any
          RTMP-compatible streaming software. Start a stream, share your
          watch link, and your viewers can tune in the moment you go on air.
        </p>

        <div className="flex justify-center mb-12">
          <GoLiveButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <Video className="w-5 h-5 text-red-400 mb-2" />
            <p className="text-white text-sm font-semibold mb-1">Any streaming software</p>
            <p className="text-zinc-500 text-xs">Works with OBS Studio or any tool that supports RTMP.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <Users className="w-5 h-5 text-red-400 mb-2" />
            <p className="text-white text-sm font-semibold mb-1">Shareable watch link</p>
            <p className="text-zinc-500 text-xs">Viewers don't need an account to watch your stream.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <Zap className="w-5 h-5 text-red-400 mb-2" />
            <p className="text-white text-sm font-semibold mb-1">Instant setup</p>
            <p className="text-zinc-500 text-xs">Get your stream key immediately, no waiting or review.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
