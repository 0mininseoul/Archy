"use client";

import { useEffect } from "react";

export function ViewportHandler() {
    useEffect(() => {
        const setAppHeight = () => {
            const doc = document.documentElement;
            // window.innerHeight provides the correct visible height in iOS Safari/PWA
            doc.style.setProperty("--app-height", `${window.innerHeight}px`);
        };

        // Set initial height
        setAppHeight();

        // Update on resize
        window.addEventListener("resize", setAppHeight);

        // Some iOS versions need a slight delay to settle the layout
        setTimeout(setAppHeight, 100);

        return () => {
            window.removeEventListener("resize", setAppHeight);
        };
    }, []);

    return null;
}
