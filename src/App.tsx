import React, { Suspense, lazy } from "react";
import { Routes, Route, Link, useLocation, Navigate, useParams } from "react-router-dom";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import Toast from "./components/Toast";
import { useAppLogic } from "./useAppLogic";
import UploadModal from "./components/UploadModal";
import { UploadProvider, useUpload } from "./context/UploadContext";
import UploadProgressWidget from "./components/UploadProgressWidget";
import { NotificationProvider } from "./context/NotificationContext";
import { clearStaleChannelCache } from "./utils/clearStaleChannelCache";
import AdminDashboard from "./pages/AdminDashboard";

// ✅ Defer cache clearing to avoid blocking initial load
if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  requestIdleCallback(() => clearStaleChannelCache());
} else {
  setTimeout(clearStaleChannelCache, 1000);
}

// ─── Eager load critical pages (visible on first paint) ───────────────────────
import HomeFeed from "./pages/HomeFeed";
import WatchPage from "./pages/Watch";
const ShortsPage       = lazy(() => import("./pages/ShortsPage"));

// ─── Lazy load non-critical pages ─────────────────────────────────────────────
const Dashboard        = lazy(() => import("./pages/Dashboard"));
const AboutPage        = lazy(() => import("./pages/AboutPage"));
const HowItWorksPage    = lazy(() => import("./pages/HowItWorksPage"));
const ChannelPage      = lazy(() => import("./pages/ChannelPage"));
const MissionConsole   = lazy(() => import("./pages/MissionConsole"));
const SettingsPage     = lazy(() => import("./pages/Settings"));
const LiveStream       = lazy(() => import("./pages/LiveStream"));
const LiveStreamsBrowser = lazy(() => import("./components/LiveStreamsBrowser"));
const GoLiveButton     = lazy(() => import("./components/GoLiveButton"));
const ClipGenerator    = lazy(() => import("./pages/ClipGenerator"));

// ─── Sidebar nav pages (were imported but routes were MISSING — FIX #1) ───────
const Library          = lazy(() => import("./pages/Library"));
const History          = lazy(() => import("./pages/History"));
const Liked            = lazy(() => import("./pages/Liked"));

// ─── SEO / discovery pages ────────────────────────────────────────────────────
// FIX #3: Removed duplicate `Trending` import — only TrendingPage is used
const CategoryPage     = lazy(() => import("./pages/CategoryPage"));
const FAQPage          = lazy(() => import("./pages/FAQPage"));
const TrendingPage     = lazy(() => import("./pages/TrendingPage"));
const CreatorDetailPage = lazy(() => import("./pages/CreatorDetailPage"));


// ─── Watch Later page — was missing entirely (FIX #1) ─────────────────────────
const WatchLaterPage   = lazy(() =>
  import("./pages/WatchLater").catch(() => ({
    default: () => <ComingSoon title="Watch Later" />,
  }))
);

// ─── Shared fallback for pages not yet built ──────────────────────────────────
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <div className="text-5xl">🚧</div>
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      <p className="text-gray-400 text-sm">This page is coming soon.</p>
      <Link
        to="/"
        className="mt-2 px-5 py-2 bg-red-600 hover:bg-red-700 rounded-full text-sm font-medium transition"
      >
        Go Home
      </Link>
    </div>
  );
}

// ─── Loaders ──────────────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4" />
      <p className="text-gray-400">Loading...</p>
    </div>
  </div>
);

const ScrollToTop = () => {
  const location = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);
  return null;
};

// ─── App ──────────────────────────────────────────────────────────────────────
function AppContent() {
  const {
    toast, setToast, q, setQ,
    theme, setTheme, themeCls,
    fileInputRef, uploading, isFullscreen,
  } = useAppLogic();

  const { isModalOpen: showUploadModal, openModal, closeModal } = useUpload();
  const [online, setOnline]                   = React.useState(navigator.onLine);
  const [refreshKey, setRefreshKey]           = React.useState(0);
  const location = useLocation();

  const isWatchPage  = location.pathname === "/watch";
  const isLivePage   = location.pathname.startsWith("/live/watch");
  const isShortsPage = location.pathname.startsWith("/shorts");

  React.useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setToast({ message: "Back online! 🎉", type: "success" });
    };
    const handleOffline = () => {
      setOnline(false);
      setToast({ message: "You're offline. Some features may be limited.", type: "error" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setToast]);

  React.useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  const handleUploadSuccess = React.useCallback(() => {
    closeModal();
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <NotificationProvider>
      <ErrorBoundary>
        <div className={`min-h-screen ${themeCls.page} flex flex-col overflow-x-hidden`}>
          <ScrollToTop />

          {!online && (
            <div className="bg-yellow-500/90 text-black text-center py-2 text-sm font-medium z-50">
              ⚠️ You're currently offline. Some features may not work.
            </div>
          )}

          {!isFullscreen && !isShortsPage && (
            <Header
              theme={theme}
              setTheme={setTheme}
              q={q}
              setQ={setQ}
              themeCls={themeCls}
              fileInputRef={fileInputRef}
              handleUploadClick={() => openModal()}
              uploading={uploading}
            />
          )}

          <main
            className={`flex flex-1 w-full
              ${(isFullscreen || isShortsPage) ? "h-screen" : "h-[calc(100vh-64px)]"}
              ${isWatchPage || isLivePage || isShortsPage ? "px-0 py-0" : "px-4 md:px-6 py-4"}
              ${!isWatchPage && !isLivePage ? "pb-20 md:pb-4" : ""}
              overflow-hidden`}
          >
            <section
              className={`flex-1 min-w-0 ${
                isShortsPage ? "overflow-hidden" : "overflow-y-auto custom-scrollbar"
              }`}
            >
              <Suspense fallback={<PageLoader />}>
                <Routes>

                  {/* ─── HOME ─────────────────────────────────────── */}
                  <Route
                    path="/"
                    element={
                      <div className="w-full">
                        <HomeFeed key={refreshKey} searchQuery={q} />
                      </div>
                    }
                  />

                  {/* ─── WATCH ────────────────────────────────────── */}
                  <Route path="/watch" element={<WatchPage />} />

                  {/* ─── SHORTS ───────────────────────────────────── */}
                  <Route
                    path="/shorts"
                    element={
                      <ShortsPage
                        theme={theme}
                        setTheme={setTheme}
                        q={q}
                        setQ={setQ}
                        themeCls={themeCls}
                        fileInputRef={fileInputRef}
                        handleUploadClick={() => openModal()}
                        uploading={uploading}
                      />
                    }
                  />
                  <Route
                    path="/shorts/:id"
                    element={
                      <ShortsPage
                        theme={theme}
                        setTheme={setTheme}
                        q={q}
                        setQ={setQ}
                        themeCls={themeCls}
                        fileInputRef={fileInputRef}
                        handleUploadClick={() => openModal()}
                        uploading={uploading}
                      />
                    }
                  />

                  {/* ─── SIDEBAR NAV PAGES ────────────────────────── */}
                  {/* FIX #1 + #2: these were either missing or eaten  */}
                  {/* by the /:handle wildcard. Now declared BEFORE it. */}
                  <Route path="/trending"    element={<TrendingPage />} />
                  <Route path="/library"     element={<Library />} />
                  <Route path="/history"     element={<History />} />
                  <Route path="/liked"       element={<Liked />} />
                  <Route path="/watch-later" element={<WatchLaterPage />} />

                  {/* ─── LIVE ─────────────────────────────────────── */}
                  <Route path="/live"                    element={<LiveStreamsBrowser />} />
                  <Route path="/live/watch/:streamId"    element={<LiveStream />} />
                  <Route path="/go-live"                 element={<GoLiveButton />} />

                  {/* ─── CLIP GENERATOR ───────────────────────────── */}
                  <Route path="/clip-generator" element={<ClipGenerator />} />

                  {/* ─── CHANNEL — explicit prefix form ──────────── */}
                  <Route path="/channel/:handle" element={<ChannelPage />} />

                  {/* ─── SETTINGS / DASHBOARD ─────────────────────── */}
                  <Route path="/settings"     element={<SettingsPage />} />
                  <Route path="/dashboard"    element={<Dashboard />} />
                  <Route path="/mission/demo" element={<MissionConsole />} />
<Route path="/mission"      element={<MissionConsole />} />
                  {/* ─── SEO PAGES ────────────────────────────────── */}
                  <Route path="/category/:slug"      element={<CategoryPage />} />
                  <Route path="/faq"                 element={<FAQPage />} />
                  <Route path="/creators/:handle"    element={<CreatorDetailPage />} />

                  {/* ─── ABOUT / HOW IT WORKS ─────────────────────── */}
                  {/* Must also come BEFORE the /:handle wildcard below,
                      same reason as every other named route on this list. */}
                  <Route path="/about"         element={<AboutPage />} />
                  <Route path="/how-it-works"  element={<HowItWorksPage onUploadClick={() => openModal()} />} />

                  {/* ─── MISC ─────────────────────────────────────── */}
                  <Route path="/home-example" element={<HomeFeed searchQuery={q} />} />

                  {/* ─── @HANDLE — must come LAST before 404 ─────── */}
                  {/* FIX #2: wildcard was at line 156, swallowing all */}
                  {/* the routes above it. Now it's the last catch-all. */}
                  <Route path="/:handle" element={<HandleOrNotFound />} />
					<Route path="/admin" element={<AdminDashboard />} />
                  {/* ─── 404 ──────────────────────────────────────── */}
                  <Route
                    path="/404"
                    element={
                      <div className="flex items-center justify-center min-h-[400px]">
                        <div className="text-center">
                          <div className="text-8xl mb-4">😵</div>
                          <h2 className="text-3xl font-bold text-white mb-2">
                            404 — Page Not Found
                          </h2>
                          <p className="text-gray-400 mb-6">
                            The page you're looking for doesn't exist.
                          </p>
                          <Link
                            to="/"
                            className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition"
                          >
                            Go Home
                          </Link>
                        </div>
                      </div>
                    }
                  />

                  <Route path="*" element={<Navigate to="/404" replace />} />

                </Routes>
              </Suspense>
            </section>
          </main>

          {!isFullscreen && !isWatchPage && !isLivePage && (
            <BottomNav onUploadClick={() => openModal()} />
          )}

          {toast && (
            <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
          )}

          {showUploadModal && (
            <UploadModal
              onClose={() => closeModal()}
              onUploaded={handleUploadSuccess}
            />
          )}

          <UploadProgressWidget />
        </div>
      </ErrorBoundary>
    </NotificationProvider>
  );
}

// ─── App — the real default export ─────────────────────────────────────────
// Thin wrapper so AppContent (which calls useUpload()) is a descendant of
// UploadProvider. Upload progress state needs to live above AppContent,
// not inside it, so it survives regardless of what AppContent re-renders.
export default function App() {
  return (
    <UploadProvider>
      <AppContent />
    </UploadProvider>
  );
}

// ─── HandleOrNotFound ─────────────────────────────────────────────────────────
// Catches /:handle — if it starts with @ it's a channel, otherwise 404.
// Safe because all named routes (/library, /history, etc.) are declared above
// this wildcard, so React Router matches them first.
function HandleOrNotFound() {
  const { handle } = useParams<{ handle: string }>();

  if (handle?.startsWith("@")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <ChannelPage />
      </Suspense>
    );
  }

  return <Navigate to="/404" replace />;
}