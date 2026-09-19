// pages/TermsOfServicePage.tsx
//
// Route this at /terms.
//
// ⚠️ LEGAL DRAFT — NOT LEGAL ADVICE
// Covers user-generated content licensing, UPI tipping, copyright
// takedown, live streaming conduct, and the Grievance Officer /
// intermediary-safe-harbor language required under India's IT Act, 2000
// (Section 79) and the IT Rules, 2021. Fill in every [PLACEHOLDER] and
// have an actual lawyer review this before launch — payments and
// user-generated content both carry real legal exposure.

import { motion } from "framer-motion";
import { FileText, Mail } from "lucide-react";

const SECTIONS = [
  {
    heading: "1. Acceptance of Terms",
    body: [
      "By accessing or using AirStreamX, you agree to be bound by these Terms of Service and our Privacy Policy. If you don't agree, please don't use the Service.",
    ],
  },
  {
    heading: "2. Eligibility",
    body: [
      "You must be at least 18 years old, or the age of legal majority in your jurisdiction, to create an account. By signing up, you confirm you meet this requirement.",
    ],
  },
  {
    heading: "3. Your Account",
    body: [
      "You're responsible for maintaining the security of your account and for all activity that happens under it. Sign in is handled through Google via Firebase Authentication — we never see or store your Google password.",
    ],
  },
  {
    heading: "4. Your Content",
    body: [
      "You retain ownership of everything you upload — videos, Shorts, thumbnails, comments, and posts.",
      "By uploading content, you grant AirStreamX a worldwide, non-exclusive, royalty-free license to host, store, reproduce, adapt (e.g. generating thumbnails or clips via our AI Clip Generator), and display your content solely for the purpose of operating and promoting the Service.",
      "You confirm that you own or have the necessary rights to everything you upload, and that it doesn't infringe anyone else's copyright, trademark, privacy, or other rights.",
    ],
  },
  {
    heading: "5. Prohibited Content & Conduct",
    body: [
      "You may not upload or share content that: infringes someone else's intellectual property; is defamatory, obscene, or hateful; harasses or threatens any person or group; promotes violence or illegal activity; or violates any applicable Indian law, including the IT Act, 2000.",
      "You may not use bots, scrapers, or other automated means to access the Service without our written permission, or attempt to interfere with the platform's normal operation.",
    ],
  },
  {
    heading: "6. Copyright & Takedown Requests",
    body: [
      "AirStreamX respects intellectual property rights. If you believe content on the Service infringes your copyright, send a written notice to copyright@airstreamx.com including: (a) identification of the copyrighted work, (b) the URL of the infringing content, (c) your contact details, and (d) a statement of good-faith belief that the use is unauthorized.",
      "We will act on valid takedown requests and, where required by an order from a court or government authority, remove or disable access to content within 36 hours as mandated by the IT Rules, 2021.",
      "Repeat infringers' accounts may be suspended or terminated.",
    ],
  },
  {
    heading: "7. Creator Tipping (UPI)",
    body: [
      "AirStreamX allows viewers to send optional tips to creators via UPI, processed through our third-party payment gateway partner. Tips are a transaction between the viewer and the creator — AirStreamX facilitates the payment but is not a party to it and is not responsible for disputes between viewers and creators.",
      "Creators are solely responsible for any tax obligations arising from tips received. AirStreamX does not provide tax advice.",
      "Tips are generally non-refundable except where required by law or at the creator's discretion.",
    ],
  },
  {
    heading: "8. Live Streaming",
    body: [
      "The same content and conduct rules that apply to uploaded videos apply to live streams. We reserve the right to end a live stream immediately, without notice, if it violates these Terms.",
    ],
  },
  {
    heading: "9. Termination",
    body: [
      "You may delete your account at any time from Settings. We may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or for any other reason at our reasonable discretion, with notice where practicable.",
    ],
  },
  {
    heading: "10. Disclaimers & Limitation of Liability",
    body: [
      "AirStreamX is provided \"as is\" without warranties of any kind. We don't guarantee uninterrupted or error-free service.",
      "To the maximum extent permitted by law, AirStreamX and its team are not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including content posted by other users.",
    ],
  },
  {
    heading: "11. Intermediary Status",
    body: [
      "AirStreamX is an intermediary as defined under Section 2(1)(w) of the Information Technology Act, 2000, and observes the due diligence requirements under Section 79 of the Act and the IT Rules, 2021. We do not endorse or take responsibility for user-generated content, and we act on valid legal requests and complaints as required by law.",
    ],
  },
  {
    heading: "12. Grievance Officer",
    body: [
      "In accordance with the IT Rules, 2021, grievances regarding content on AirStreamX may be directed to:",
      "Name: Vineet Yadav\nEmail: legal@airstreamx.com\nAddress: Lucknow, Uttar Pradesh, India",
      "Complaints will be acknowledged within 24 hours and resolved within 15 days.",
    ],
  },
  {
    heading: "13. Governing Law",
    body: [
      "These Terms are governed by the laws of India. Any disputes will be subject to the exclusive jurisdiction of the courts in Lucknow, Uttar Pradesh.",
    ],
  },
  {
    heading: "14. Changes to These Terms",
    body: [
      "We may update these Terms from time to time. Continued use of AirStreamX after changes take effect means you accept the revised Terms.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, #ef4444, transparent 70%)" }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <p className="inline-flex items-center gap-2 text-red-400 text-xs font-bold tracking-[0.2em] uppercase mb-5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
            <FileText size={13} />
            Terms of Service
          </p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4 tracking-tight text-white">
            The rules that keep AirStreamX fair
          </h1>
          <p className="text-gray-400 text-sm">
            Last updated: 19 September 2026
          </p>
          <p className="text-gray-300 text-base leading-relaxed mt-6">
            These Terms govern your use of AirStreamX. Please read them carefully — they cover
            your content, your conduct, and how tipping and copyright complaints work.
          </p>
        </motion.div>

        <div className="space-y-10">
          {SECTIONS.map((s, i) => (
            <motion.div
              key={s.heading}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.5 }}
            >
              <h2 className="text-white font-bold text-lg mb-3">{s.heading}</h2>
              <div className="space-y-3">
                {s.body.map((p, j) => (
                  <p key={j} className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-16 rounded-2xl border border-white/10 p-6 flex items-start gap-4"
          style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(20,20,20,0.6))" }}
        >
          <Mail className="text-red-400 flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="text-white font-bold mb-1">Copyright or legal concern?</h3>
            <p className="text-gray-400 text-sm">
              Contact our Grievance Officer at <span className="text-white">legal@airstreamx.com</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
