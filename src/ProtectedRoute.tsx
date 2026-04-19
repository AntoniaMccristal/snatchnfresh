import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { useEffect, useState } from "react";
import { hasCompletedPostalProfile } from "./lib/profileCompletion";
import { getMfaRequirement } from "./lib/mfa";
import { ensureProfileIdentity } from "./lib/profileIdentity";

const ProtectedRoute = ({
  children,
  requireOnboarding = false,
}: {
  children: JSX.Element;
  requireOnboarding?: boolean;
}) => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    let mounted = true;

    const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      try {
        return await Promise.race([
          promise,
          new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
        ]);
      } catch {
        return fallback;
      }
    };

    const syncProfileIdentity = async (sessionUser: any) => {
      try {
        await withTimeout(ensureProfileIdentity(sessionUser), 2500, null);
      } catch (error) {
        console.error("Profile identity sync failed", error);
      }
    };

    const resolveSessionState = async (session: any) => {
      setAuthenticated(!!session);

      if (session?.user && requireOnboarding) {
        await syncProfileIdentity(session.user);
        const done = await withTimeout(hasCompletedPostalProfile(session.user.id), 2500, true);
        if (!mounted) return;
        setNeedsOnboarding(!done);
      } else {
        setNeedsOnboarding(false);
      }

      if (session?.user) {
        const mfa = await withTimeout(
          getMfaRequirement(),
          2500,
          { needsChallenge: false, factorId: null, verifiedTotpCount: 0 },
        );
        if (!mounted) return;
        setNeedsMfa(mfa.needsChallenge);
      } else {
        setNeedsMfa(false);
      }
    };

    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        await resolveSessionState(session);
      } catch (error) {
        console.error("Protected route check failed", error);
        if (!mounted) return;
        setAuthenticated(false);
        setNeedsOnboarding(false);
        setNeedsMfa(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!mounted) return;
        await resolveSessionState(session);
      } catch (error) {
        console.error("Auth state handler failed", error);
        if (!mounted) return;
        setAuthenticated(false);
        setNeedsOnboarding(false);
        setNeedsMfa(false);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="app-shell p-6">Checking your session...</div>;
  }

  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (needsMfa && location.pathname !== "/auth/mfa") {
    return <Navigate to="/auth/mfa" replace />;
  }

  if (
    requireOnboarding &&
    needsOnboarding &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

export default ProtectedRoute;
