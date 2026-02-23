"use client";

import { useEffect } from "react";
import * as amplitude from "@amplitude/analytics-browser";

/**
 * 현재 실행 환경 감지 (PWA vs Browser)
 */
function getAppContext(): "pwa" | "browser" {
    if (typeof window === "undefined") return "browser";

    // PWA (standalone) 모드 확인
    const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;

    return isStandalone ? "pwa" : "browser";
}

export default function AmplitudeAnalytics() {
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
        if (!apiKey) return;

        try {
            amplitude.init(apiKey, {
                defaultTracking: true,
            });

            // Set app_context User Property for PWA/browser distinction
            const appContext = getAppContext();
            const identify = new amplitude.Identify().set("app_context", appContext);
            amplitude.identify(identify);
        } catch (error) {
            console.warn("[Amplitude] Initialization failed:", error);
        }
    }, []);

    return null;
}
