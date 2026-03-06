"use client";

import { useEffect } from "react";
import { bootstrapAmplitudeAnalytics } from "@/lib/analytics/amplitude";

export default function AmplitudeAnalytics() {
    useEffect(() => {
        void bootstrapAmplitudeAnalytics();
    }, []);

    return null;
}
