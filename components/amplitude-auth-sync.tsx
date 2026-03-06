"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  bootstrapAmplitudeAnalytics,
  resetAmplitudeUser,
  syncAmplitudeUser,
} from "@/lib/analytics/amplitude";

export function AmplitudeAuthSync() {
  const [supabase] = useState(() => createClient());
  const hadAuthenticatedUserRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const syncCurrentSession = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (user) {
          hadAuthenticatedUserRef.current = true;
          await syncAmplitudeUser(user.id);
          return;
        }

        await bootstrapAmplitudeAnalytics();
      } catch (error) {
        console.warn("[AmplitudeAuthSync] Failed to sync current session:", error);
      }
    };

    void syncCurrentSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        hadAuthenticatedUserRef.current = true;
        void syncAmplitudeUser(session.user.id);
        return;
      }

      if (hadAuthenticatedUserRef.current) {
        hadAuthenticatedUserRef.current = false;
        void resetAmplitudeUser();
        return;
      }

      void bootstrapAmplitudeAnalytics();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
