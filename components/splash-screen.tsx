"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const SPLASH_SESSION_KEY = "archy_splash_shown";

interface SplashScreenProps {
    duration?: number;
}

export function SplashScreen({ duration = 1500 }: SplashScreenProps) {
    const [showSplash, setShowSplash] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Check if splash was already shown this session
        const hasShownSplash = sessionStorage.getItem(SPLASH_SESSION_KEY);

        if (!hasShownSplash) {
            setShowSplash(true);
            sessionStorage.setItem(SPLASH_SESSION_KEY, "true");

            // Hide splash after duration
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [duration]);

    if (!showSplash || !isVisible) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] h-[100dvh] w-full bg-[#0f172a] transition-opacity duration-300">
            <Image
                src="/splash-screen.png"
                alt="Archy Splash Screen"
                fill
                className="object-cover"
                priority
            />
        </div>
    );
}
