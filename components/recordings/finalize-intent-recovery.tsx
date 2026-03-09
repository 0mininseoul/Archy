"use client";

import { useEffect } from "react";
import {
  flushPendingFinalizeIntent,
  loadPendingFinalizeIntent,
  sendFinalizeIntentBeacon,
} from "@/lib/services/finalize-intent-client";

export function FinalizeIntentRecovery() {
  useEffect(() => {
    void flushPendingFinalizeIntent();

    const flushIfPending = () => {
      if (loadPendingFinalizeIntent()) {
        void flushPendingFinalizeIntent();
      }
    };

    const sendBeaconIfPending = () => {
      if (loadPendingFinalizeIntent()) {
        sendFinalizeIntentBeacon();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendBeaconIfPending();
      } else if (document.visibilityState === "visible") {
        flushIfPending();
      }
    };

    window.addEventListener("online", flushIfPending);
    window.addEventListener("pagehide", sendBeaconIfPending);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", flushIfPending);
      window.removeEventListener("pagehide", sendBeaconIfPending);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
