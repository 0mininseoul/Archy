"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => undefined)
        .catch((registrationError) => {
          console.error("SW registration failed:", registrationError);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
