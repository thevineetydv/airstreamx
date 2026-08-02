// pages/HowItWorksPage.tsx
//
// Route this at /how-it-works.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass, PlaySquare, Heart, Radio,
  UploadCloud, Wand2, Palette, Gift,
} from "lucide-react";

const VIEWER_STEPS = [
  {
    icon: Compass,
    title: "Discover",
    text: "Your home feed shows videos and Shorts based on what you actually watch — not just what's trending everywhere else.",
  },
  {
    icon: PlaySquare,
    title: "Watch, long or short",
    text: "Full videos, live streams, or quick Shorts — same app, same account, switch anytime.",
  },
  {
    icon: Heart,
    title: "Follow creators you like",
    text: "Subscribe to get their new uploads in your feed. Like, comment, and save videos to watch later.",
  },
  {
    icon: Gift,
    title: "Support creators directly",
    text: "See a video worth paying for? Tip the creator instantly via UPI — no minimum, no waiting for them to hit some subscriber threshold.",
  },
];

const CREATOR_STEPS = [
  {
    icon: UploadCloud,
    title: "Upload in minutes",
    text: "Drag in your video, add a title and thumbnail, and publish. We handle transcoding so it plays smoothly on any device.",
  },
  {
    icon: Wand2,
    title: "Let AI find your highlights",
    text: "Have a long recording — a lecture, event, or livestream? Our AI Clip Generator finds the best moments and turns them into ready-to-post Shorts, automatically.",
  },
  {
    icon: Palette,
    title: "Make your channel yours",
    text: "Custom banner, avatar, description, and links — your channel page is your own space, not a generic template.",
  },
  {
    icon: Radio,
    title: "Go live",
    text: "Stream directly to your audience, no separate software required.",
  },
];

interface HowItWorksPageProps {
  onUploadClick?: () => void;
}

export default function HowItWorksPage({ onUploadClick }: HowItWorksPageProps) {
  const [tab, setTab] = useState<"viewer" | "creator">("viewer");
  const steps = tab === "viewer" ? VIEWER_STEPS : CREATOR_STEPS;

  return (
    <div className="relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] opacity-20 blur-[130px]"
          style={{ background: "radial-gradient(ellipse, #ef4444, transparent 70%)" }}
        />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-16 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
            How <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">AirStreamX</span> works
          </h1>
          <p className="text-gray-400 text-base">Whether you're here to watch or to create — here's the short version.</p>
        </motion.div>

        {/* ── Tab switcher ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="flex justify-center mb-16"
        >
          <div className="relative inline-flex bg-[#141414] border border-white/10 rounded-full p-1.5">
            {(["viewer", "creator"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative px-7 py-2.5 rounded-full text-sm font-bold transition-colors z-10"
                style={{ color: tab === t ? "#fff" : "#9ca3af" }}
              >
                {tab === t && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-red-600 to-red-700 shadow-lg shadow-red-900/40 -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t === "viewer" ? "As a viewer" : "As a creator"}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Timeline ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="relative"
          >
            {/* Connecting line — this genuinely IS a sequence, so a
                timeline is the right structural device here (not just
                decoration). */}
            <div
              className="absolute left-[27px] top-8 bottom-8 w-px"
              style={{ background: "linear-gradient(to bottom, rgba(239,68,68,0.5), rgba(239,68,68,0.05))" }}
            />

            <div className="space-y-8">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="relative flex gap-5"
                >
                  {/* Icon node on the timeline */}
                  <div className="relative flex-shrink-0 z-10">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border-2 border-red-500/30 flex items-center justify-center shadow-lg shadow-black/40">
                      <step.icon size={22} className="text-red-400" />
                    </div>
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-[#141414] rounded-2xl border border-white/10 p-5 pt-4 relative overflow-hidden">
                    {/* Giant ghost numeral */}
                    <span
                      className="absolute -top-2 -right-1 text-7xl font-black select-none pointer-events-none"
                      style={{ color: "rgba(239,68,68,0.06)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="relative">
                      <h3 className="text-white font-bold text-lg mb-1.5">{step.title}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">{step.text}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {tab === "creator" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12 text-center"
          >
            <button
              onClick={onUploadClick}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-8 py-3.5 rounded-full transition-all shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-105"
            >
              Upload your first video
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}