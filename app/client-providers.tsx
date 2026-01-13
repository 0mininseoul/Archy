"use client";

import dynamic from "next/dynamic";

// Dynamic imports for analytics - loaded after initial render
const AmplitudeAnalytics = dynamic(
    () => import("@/components/AmplitudeAnalytics"),
    { ssr: false }
);

// Dynamic import for service worker registration
const RegisterServiceWorkerComponent = dynamic(
    () => import("./register-sw").then((mod) => ({ default: mod.RegisterServiceWorker })),
    { ssr: false }
);

// Dynamic import for PWA installation tracking
const PWAInstaller = dynamic(
    () => import("@/components/pwa/pwa-installer").then((mod) => ({ default: mod.PWAInstaller })),
    { ssr: false }
);

export function ClientProviders() {
    return (
        <>
            <RegisterServiceWorkerComponent />
            <AmplitudeAnalytics />
            <PWAInstaller />
        </>
    );
}

