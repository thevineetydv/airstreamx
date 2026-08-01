import { useState } from "react";
import { useMetaTags } from "../hooks/useMetaTags";
import { FAQSchema } from "../components/FAQSchema";
import { BreadcrumbSchema, getBreadcrumbs } from "../components/BreadcrumbSchema";
import { ChevronDown } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "What is AirStreamX?",
    answer: "AirStreamX is a free, AI-powered video streaming platform designed for creators and viewers. Upload videos, go live, generate AI clips, and reach a global audience.",
  },
  {
    question: "How do I upload a video?",
    answer: "Click the Upload button (mobile: menu), select your video file, add a title and description, choose a category, and click Publish. Videos process and appear in your channel within minutes.",
  },
  {
    question: "Is there a video size limit?",
    answer: "Maximum file size is 10GB. We recommend videos up to 4GB for faster processing. Supported formats: MP4, WebM, AVI, MOV, MKV.",
  },
  {
    question: "How do I start live streaming?",
    answer: "Click \"Go Live\" to start a live stream. You can stream from any browser. Viewers can watch in real-time, and the stream is saved automatically.",
  },
  {
    question: "How does the AI Clip Generator work?",
    answer: "The Clip Generator analyzes your videos to find the best moments, then automatically creates short clips (15-60 seconds) perfect for Shorts. Access it in your Dashboard.",
  },
  {
    question: "Can I monetize my content?",
    answer: "Currently, AirStreamX is a free platform. Monetization features (ad revenue, subscriptions) are coming in Q3 2026.",
  },
  {
    question: "How do I grow my audience?",
    answer: "Use trending categories, create Shorts, collaborate with other creators, optimize your titles and descriptions, and engage with the community. Better SEO helps too!",
  },
  {
    question: "Is my content private?",
    answer: "Yes. You can set videos to public (searchable, shareable) or private (only you). Private videos don't appear in search or recommendations.",
  },
  {
    question: "Can I download my videos?",
    answer: "Yes! Click \"Download\" on any video you uploaded. You can also export statistics and analytics from your Dashboard.",
  },
  {
    question: "What happens if I delete my account?",
    answer: "Your account and all videos are permanently deleted after 30 days. You can cancel deletion by logging back in within this period.",
  },
  {
    question: "How is content moderated?",
    answer: "We use AI moderation and community reports. Content must follow our Community Guidelines: no hate speech, violence, explicit content, or spam.",
  },
  {
    question: "Do you have an API?",
    answer: "Our API documentation is available at https://docs.airstreamx.com. Currently in beta; contact us for API access.",
  },
];

interface ExpandedState {
  [key: number]: boolean;
}

export default function FAQPage() {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const toggleExpanded = (index: number) => {
    setExpanded(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  useMetaTags({
    title: "FAQ - AirStreamX Video Streaming Platform",
    description: "Frequently asked questions about uploading videos, live streaming, AI clip generation, and more on AirStreamX.",
    keywords: ["faq", "help", "how to", "video streaming", "upload", "live streaming"],
    url: "https://airstreamx.com/faq",
    canonicalUrl: "https://airstreamx.com/faq",
    type: "website",
  });

  return (
    <>
      <FAQSchema items={FAQ_ITEMS} />
      <BreadcrumbSchema items={getBreadcrumbs("/faq")} />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-12">
          <h1 className="text-5xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-gray-400 text-lg">
            Find answers to common questions about AirStreamX features, uploading, streaming, and more.
          </p>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <div
              key={index}
              className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleExpanded(index)}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-800/50 transition text-left"
              >
                <h3 className="text-lg font-semibold">{item.question}</h3>
                <ChevronDown
                  size={20}
                  className={`flex-shrink-0 transition-transform ${
                    expanded[index] ? "transform rotate-180" : ""
                  }`}
                />
              </button>

              {expanded[index] && (
                <div className="px-6 pb-6 text-gray-300 border-t border-gray-800">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
          <p className="text-gray-400 mb-6">
            Can't find the answer? Contact our support team.
          </p>
          <a
            href="mailto:support@airstreamx.com"
            className="inline-block bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition"
          >
            Contact Support
          </a>
        </div>
      </div>
    </>
  );
}
