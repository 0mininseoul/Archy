"use client";

import { useEffect, useRef } from "react";
import * as amplitude from "@amplitude/analytics-browser";

/**
 * PWA 설치 완료 이벤트를 감지하고 DB에 저장 + Amplitude 이벤트 전송
 * - appinstalled 이벤트: Android Chrome에서 PWA 설치 완료 시 발생
 * - iOS는 appinstalled 이벤트를 지원하지 않으므로, standalone 모드 진입 감지로 처리
 */
export function PWAInstaller() {
    const hasRecordedRef = useRef(false);

    useEffect(() => {
        // 이미 기록했으면 스킵
        if (hasRecordedRef.current) return;

        // PWA 설치 완료 이벤트 핸들러
        const handleAppInstalled = async () => {
            if (hasRecordedRef.current) return;
            hasRecordedRef.current = true;

            console.log("[PWA] Installation detected");

            // 1. Amplitude 이벤트 전송
            amplitude.track("PWA_Installed", {
                platform: getPlatform(),
                timestamp: new Date().toISOString(),
            });

            // 2. DB에 설치 시점 저장
            try {
                await fetch("/api/user/pwa-install", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                });
                console.log("[PWA] Installation recorded to DB");
            } catch (error) {
                console.error("[PWA] Failed to record installation:", error);
            }
        };

        // Android/Desktop: appinstalled 이벤트 리스너
        window.addEventListener("appinstalled", handleAppInstalled);

        // iOS: standalone 모드로 처음 진입한 경우 체크
        // (iOS는 appinstalled 이벤트를 지원하지 않음)
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true;

        if (isStandalone) {
            // localStorage로 이미 기록했는지 체크
            const alreadyRecorded = localStorage.getItem("pwa_install_recorded");
            if (!alreadyRecorded) {
                localStorage.setItem("pwa_install_recorded", "true");
                handleAppInstalled();
            }
        }

        return () => {
            window.removeEventListener("appinstalled", handleAppInstalled);
        };
    }, []);

    return null;
}

/**
 * 현재 플랫폼 감지
 */
function getPlatform(): "android" | "ios" | "desktop" {
    if (typeof window === "undefined") return "desktop";

    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    return "desktop";
}
