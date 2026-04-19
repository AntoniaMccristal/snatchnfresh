import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import Profile from "./pages/Profile";
import ListItem from "./pages/ListItem";
import ItemDetail from "./pages/ItemDetail";
import Booking from "./pages/Booking";
import Discover from "./pages/Discover";
import ClosetProfile from "./pages/ClosetProfile";
import Auth from "./Auth";
import AuthMfa from "./pages/AuthMfa";
import PaymentSuccess from "./pages/PaymentSuccess";
import OnboardingProfile from "./pages/OnboardingProfile";
import Messages from "./pages/Messages";
import Bag from "./pages/Bag";
import About from "./pages/About";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Help from "./pages/Help";
import Contact from "./pages/Contact";
import Reviews from "./pages/Reviews";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./ProtectedRoute";
import BottomNav from "./components/BottomNav";
import SiteFooter from "./components/SiteFooter";
import BrandMark from "./components/BrandMark";
import { Toaster } from "./components/ui/toaster";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const splashTimerRef = useRef<number | null>(null);

  const runSplash = () => {
    setShowSplash(true);

    if (splashTimerRef.current) {
      window.clearTimeout(splashTimerRef.current);
    }

    splashTimerRef.current = window.setTimeout(() => {
      setShowSplash(false);
    }, 900);
  };

  useEffect(() => {
    runSplash();

    const onFlash = () => runSplash();
    window.addEventListener("snatchn:flash-logo", onFlash);

    return () => {
      window.removeEventListener("snatchn:flash-logo", onFlash);
      if (splashTimerRef.current) {
        window.clearTimeout(splashTimerRef.current);
      }
    };
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <div style={{ paddingBottom: "80px" }}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/mfa" element={<AuthMfa />} />
          <Route
            path="/messages"
            element={
              <ProtectedRoute requireOnboarding>
                <Messages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bag"
            element={
              <ProtectedRoute requireOnboarding>
                <Bag />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute requireOnboarding>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/list/:id?"
            element={
              <ProtectedRoute requireOnboarding>
                <ListItem />
              </ProtectedRoute>
            }
          />

          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/closet/:userId" element={<ClosetProfile />} />
          <Route
            path="/booking/:itemId"
            element={
              <ProtectedRoute requireOnboarding>
                <Booking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingProfile />
              </ProtectedRoute>
            }
          />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/help" element={<Help />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/:userId" element={<Reviews />} />
          <Route
            path="/connections"
            element={
              <ProtectedRoute requireOnboarding>
                <Connections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/connections/:userId"
            element={
              <ProtectedRoute requireOnboarding>
                <Connections />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <SiteFooter />
      </div>

      {/* Bottom nav always visible except on auth */}
      <BottomNav />
      <Toaster />

      {showSplash && (
        <div className="fixed inset-0 z-[200] bg-primary-gradient flex items-center justify-center">
          <div className="text-center text-primary-foreground animate-pulse">
            <div className="w-16 h-16 rounded-2xl border border-white/40 bg-white/10 backdrop-blur-sm mx-auto mb-3 flex items-center justify-center">
              <BrandMark size={40} />
            </div>
            <p className="text-xl font-display font-bold tracking-wide">Snatch'n</p>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}
