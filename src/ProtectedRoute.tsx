import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { useEffect, useState } from "react";
import { hasCompletedPostalProfile } from "./lib/profileCompletion";
import { getMfaRequirement } from "./lib/mfa";
import { ensureProfileIdentity } from "./lib/profileIdentity";

const PROFILE_COMPLETION_CACHE_PREFIX = "profile-complete:";

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

    const getCachedProfileCompletion = (userId: string) => {
      try {
        return window.sessionStorage.getItem(`${PROFILE_COMPLETION_CACHE_PREFIX}${userId}`) === "true";
      } catch {
        return false;
      }
    };

    const cacheProfileCompletion = (userId: string, done: boolean) => {
      try {
        window.sessionStorage.setItem(
          `${PROFILE_COMPLETION_CACHE_PREFIX}${userId}`,
          done ? "true" : "false",
        );
      } catch {
        // ignore storage failures
      }
    };

    const clearProfileCompletionCache = (userId?: string | null) => {
      if (!userId) return;
      try {
        window.sessionStorage.removeItem(`${PROFILE_COMPLETION_CACHE_PREFIX}${userId}`);
      } catch {
        // ignore storage failures
      }
    };

    const resolveProfileCompletion = async (userId: string) => {
      const cachedDone = getCachedProfileCompletion(userId);
      if (cachedDone) return true;

      const done = await withTimeout(hasCompletedPostalProfile(userId), 2500, true);
      cacheProfileCompletion(userId, done);
      return done;
    };

    const resolveSessionState = async (session: any) => {
      setAuthenticated(!!session);

      if (!session?.user) {
        setNeedsMfa(false);
        setNeedsOnboarding(false);
        return;
      }

      await syncProfileIdentity(session.user);

      const [done, mfa] = await Promise.all([
        requireOnboarding
          ? resolveProfileCompletion(session.user.id)
          : Promise.resolve(true),
        withTimeout(
          getMfaRequirement(),
          2500,
          { needsChallenge: false, factorId: null, verifiedTotpCount: 0 },
        ),
      ]);

      if (!mounted) return;
      setNeedsOnboarding(requireOnboarding ? !done : false);
      setNeedsMfa(mfa.needsChallenge);
    };

    const handleAuthStateChange = async (event: string, session: any) => {
      if (event === "SIGNED_OUT") {
        clearProfileCompletionCache(session?.user?.id ?? null);
      }

      await resolveSessionState(session);
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
        await handleAuthStateChange(_event, session);
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
