import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export function usePageRefresh(refresh: () => Promise<void> | void, deps: any[] = []) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let inFlight = false;
    let lastRunAt = 0;

    const run = async () => {
      const now = Date.now();
      if (inFlight || now - lastRunAt < 700) return;
      inFlight = true;
      lastRunAt = now;

      try {
        await refreshRef.current();
      } catch (error) {
        console.error("Page refresh failed", error);
      } finally {
        inFlight = false;
      }
    };

    const onFocus = () => {
      void run();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    const onPageShow = () => {
      void run();
    };

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void run();
    });

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, deps);
}
