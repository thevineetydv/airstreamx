// pages/AboutPage.tsx
//
// Route this at /about.

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Zap, Smartphone, Wallet, Languages, ArrowRight } from "lucide-react";

const PRINCIPLES = [
  {
    icon: Smartphone,
    title: "Built for the phone in your hand",
    text: "Most of India watches on a mid-range Android over patchy 4G, not a laptop on fibre. So that's what we design and test for first — not the other way around.",
  },
  {
    icon: Wallet,
    title: "Small creators get paid too",
    text: "Big platforms make you cross thousands of subscribers before you can earn a rupee. On AirStreamX, viewers can tip any creator directly, from their very first video.",
  },
  {
    icon: Languages,
    title: "Every language is a first language",
    text: "We're not building a Hindi-and-English platform with everything else as an afterthought. Regional creators deserve the same discovery as anyone else.",
  },
  {
    icon: Zap,
    title: "Editing shouldn't need an editor",
    text: "Our AI Clip Generator turns a long recording — a lecture, an event, a livestream — into shareable highlights automatically. No editing skills, no editing software, no cost.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient glow orbs — fixed to viewport, sit behind everything */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, #ef4444, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full opacity-15 blur-[140px]"
          style={{ background: "radial-gradient(circle, #dc2626, transparent 70%)" }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-20"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 text-red-400 text-xs font-bold tracking-[0.2em] uppercase mb-5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Our mission
          </motion.p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] mb-8 tracking-tight">
            <span className="text-white">A voice</span>
            <span className="text-white"> — and an </span>
            <span className="bg-gradient-to-r from-red-400 via-red-500 to-orange-400 bg-clip-text text-transparent">
              income
            </span>
            <span className="text-white"> — for every creator,</span>
            <br />
            <span className="text-white/40">not just the ones who go viral.</span>
          </h1>

          <p className="text-gray-300 text-lg leading-relaxed max-w-2xl">
            Most video platforms were built somewhere else, for someone else's phone, someone
            else's language, and someone else's bank account — then brought to India as-is.
            AirStreamX started from the opposite direction: what does a creator with a decent
            idea and a mid-range phone actually need to be seen, and to earn something from it?
          </p>
        </motion.div>

        {/* ── Principles ── */}
        <div className="grid sm:grid-cols-2 gap-5 mb-20">
          {PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="group relative bg-[#141414] rounded-2xl border border-white/10 p-6 overflow-hidden transition-colors hover:border-red-500/30"
            >
              {/* Glow that appears on hover */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-red-500/0 group-hover:bg-red-500/10 blur-2xl transition-all duration-500" />

              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/5 border border-red-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <p.icon size={22} className="text-red-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{p.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{p.text}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Where we are today ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative rounded-3xl border border-white/10 p-8 md:p-10 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(20,20,20,0.6))",
          }}
        >
          <div
            className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full opacity-20 blur-[100px]"
            style={{ background: "radial-gradient(circle, #ef4444, transparent 70%)" }}
          />
          <div className="relative">
            <h2 className="text-2xl font-black text-white mb-4">Where we are today</h2>
            <p className="text-gray-300 text-base leading-relaxed mb-6 max-w-2xl">
              AirStreamX is early. It's built and run by a small team who also has a day job —
              so we're honest that we're not the biggest platform out there yet. What we do have
              is a working product: long-form and short-form video, live streaming, an AI clip
              generator that already saves creators real editing time, and direct creator tipping
              via UPI. We're building the rest carefully and one piece at a time, because we'd
              rather ship something that works than something that just looks finished.
            </p>
            <Link
              to="/how-it-works"
              className="group inline-flex items-center gap-2 text-white font-bold text-sm px-5 py-3 rounded-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 transition-all shadow-lg shadow-red-900/30"
            >
              See how it works
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}