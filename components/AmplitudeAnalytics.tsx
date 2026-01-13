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
        if (process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY) {
            amplitude.init(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY, {
                defaultTracking: true,
            });

            // Set app_context User Property for PWA/browser distinction
            const appContext = getAppContext();
            const identify = new amplitude.Identify().set("app_context", appContext);
            amplitude.identify(identify);
        }
    }, []);

    return null;
}
