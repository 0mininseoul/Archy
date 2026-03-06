"use client";

import dynamic from "next/dynamic";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { AmplitudeAuthSync } from "@/components/amplitude-auth-sync";
import { RegisterServiceWorker } from "./register-sw";

// Dynamic imports for analytics - loaded after initial render
const AmplitudeAnalytics = dynamic(
    () => import("@/components/AmplitudeAnalytics"),
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
            <ClientErrorReporter />
            <RegisterServiceWorker />
            <AmplitudeAnalytics />
            <AmplitudeAuthSync />
            <PWAInstaller />
        </>
    );
}
