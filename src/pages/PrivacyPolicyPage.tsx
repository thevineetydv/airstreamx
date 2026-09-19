// pages/PrivacyPolicyPage.tsx
//
// Route this at /privacy.
//
// ⚠️ LEGAL DRAFT — NOT LEGAL ADVICE
// This is a comprehensive starting template covering AirStreamX's actual
// features (Firebase/Google auth, video uploads, comments, live streaming,
// UPI creator tipping, notifications) and India's core requirements
// (IT Rules 2021 Grievance Officer, Digital Personal Data Protection Act
// 2023). Every [PLACEHOLDER] below must be filled in, and this should be
// reviewed by an actual lawyer before the site goes live — especially
// because it involves handling payments and user-generated content.

import { motion } from "framer-motion";
import { Shield, Mail } from "lucide-react";

const SECTIONS = [
  {
    heading: "1. Information We Collect",
    body: [
      "Account information: when you sign in with Google (via Firebase Authentication), we receive your name, email address, and profile photo from Google. We do not receive or store your Google password.",
      "Content you provide: videos and Shorts you upload, thumbnails, titles, descriptions, comments, posts, and any other content you submit.",
      "Usage data: watch history, likes, saves, subscriptions, search queries, and interactions we use to power recommendations and the Trending page.",
      "Device and log data: IP address, browser type, device type, and approximate location (city/region level), collected automatically for security and analytics.",
      "Payment-related data: if you tip a creator via UPI, the transaction is processed by our payment gateway partner. AirStreamX does not store your UPI ID, PIN, or full payment credentials — only a transaction reference and amount, for the creator's records.",
    ],
  },
  {
    heading: "2. How We Use Your Information",
    body: [
      "To operate and improve the Service — hosting and streaming your content, powering search and the recommendation engine, and processing likes, comments, and subscriptions.",
      "To communicate with you — real-time notifications (new subscriber, comment, milestone), and important service updates.",
      "To keep the platform safe — detecting spam, abuse, and content that violates our Terms of Service.",
      "We do not sell your personal information to third parties.",
    ],
  },
  {
    heading: "3. Sharing of Information",
    body: [
      "With service providers who help us run AirStreamX: Firebase/Google Cloud (authentication, hosting), our payment gateway (processing UPI tips), and our CDN/storage provider (delivering video).",
      "When required by law — in response to a valid legal request from an Indian court, government, or law enforcement authority.",
      "With other users, as intended by the Service's design — your channel name, avatar, and public content are visible to anyone using AirStreamX.",
    ],
  },
  {
    heading: "4. Cookies & Similar Technologies",
    body: [
      "We use cookies and local storage to keep you signed in, remember your preferences (like autoplay or theme), and understand aggregate usage patterns. You can control cookies through your browser settings, though some features may not work correctly if you disable them.",
    ],
  },
  {
    heading: "5. Data Retention & Deletion",
    body: [
      "We retain your account and content data for as long as your account is active. You may delete individual videos, comments, or your entire account at any time from Settings. When you delete your account, we delete your personal information and content within 30 days, except where we're required to retain it by law (e.g. transaction records for tax purposes).",
    ],
  },
  {
    heading: "6. Children's Privacy",
    body: [
      "AirStreamX is not directed at children under 18. We do not knowingly collect personal information from anyone under 18. If you believe a child has created an account, contact us using the details below and we will take appropriate action.",
    ],
  },
  {
    heading: "7. Your Rights",
    body: [
      "You can access, correct, or delete your personal information at any time through Settings, or by contacting our Grievance Officer below.",
      "Under the Digital Personal Data Protection Act, 2023, you have the right to request a summary of the personal data we hold about you and to withdraw consent for its processing, subject to the terms of this policy.",
    ],
  },
  {
    heading: "8. Security",
    body: [
      "We use industry-standard measures — including Firebase Authentication and HTTPS encryption for data in transit — to protect your information. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "9. Grievance Officer",
    body: [
      "In accordance with the Information Technology Act, 2000 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, the details of our Grievance Officer are:",
      "Name: Vineet Yadav\nEmail: privacy@airstreamx.com\nAddress: Lucknow, Uttar Pradesh, India",
      "We will acknowledge your complaint within 24 hours and resolve it within 15 days, as required by law.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. We'll notify you of material changes by posting a notice on AirStreamX or via email. The \"Last updated\" date below reflects the most recent revision.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
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
            <Shield size={13} />
            Privacy Policy
          </p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4 tracking-tight text-white">
            Your privacy, plainly explained
          </h1>
          <p className="text-gray-400 text-sm">
            Last updated: 19 September 2026
          </p>
          <p className="text-gray-300 text-base leading-relaxed mt-6">
            This policy explains what information AirStreamX ("we", "us") collects when you use
            our website and app, how we use it, and the choices you have. By using AirStreamX,
            you agree to the collection and use of information as described here.
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
            <h3 className="text-white font-bold mb-1">Questions about your data?</h3>
            <p className="text-gray-400 text-sm">
              Contact us at <span className="text-white">privacy@airstreamx.com</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
