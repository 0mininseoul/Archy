"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AudioRecorder } from "@/components/recorder/audio-recorder";
import { getFileExtension } from "@/hooks/useAudioRecorder";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { useI18n } from "@/lib/i18n";
import { DashboardPWAInstallModal } from "@/components/pwa/dashboard-install-modal";

// =============================================================================
// Types
// =============================================================================

interface DashboardClientProps {
  initialConnectionStatus: {
    notionConnected: boolean;
    slackConnected: boolean;
    googleConnected: boolean;
  };
}

// =============================================================================
// Component
// =============================================================================

export function DashboardClient({ initialConnectionStatus }: DashboardClientProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [isUploading, setIsUploading] = useState(false);
  const [notionConnected, setNotionConnected] = useState(initialConnectionStatus.notionConnected);
  const [slackConnected, setSlackConnected] = useState(initialConnectionStatus.slackConnected);
  const [googleConnected, setGoogleConnected] = useState(initialConnectionStatus.googleConnected);
  const [showPWAModal, setShowPWAModal] = useState(false);

  // Show settings tooltip when integrations not configured
  const showSettingsTooltip = (!notionConnected && !googleConnected) || !slackConnected;

  useEffect(() => {
    // PWA install modal check
    const checkPWAModal = () => {
      const ua = navigator.userAgent;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile) return;

      if (window.matchMedia("(display-mode: standalone)").matches) return;
      if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return;

      const dismissedTime = localStorage.getItem("pwa_install_dismissed");
      if (dismissedTime) {
        const dismissed = parseInt(dismissedTime, 10);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (now - dismissed < twentyFourHours) return;
      }

      const hasSeenPWAModal = localStorage.getItem("pwa_modal_seen");
      if (!hasSeenPWAModal) {
        setShowPWAModal(true);
        localStorage.setItem("pwa_modal_seen", "true");
      }
    };

    checkPWAModal();
  }, []);

  const handleRecordingComplete = useCallback(
    async (blob: Blob, duration: number) => {
      if (!blob || blob.size === 0) {
        alert("녹음 데이터가 없습니다. 다시 녹음해주세요.");
        return;
      }

      if (duration < 1) {
        alert("녹음 시간이 너무 짧습니다. 다시 녹음해주세요.");
        return;
      }

      setIsUploading(true);

      try {
        const extension = getFileExtension(blob.type);
        const file = new File([blob], `recording-${Date.now()}.${extension}`, {
          type: blob.type,
        });

        const formData = new FormData();
        formData.append("audio", file);
        formData.append("duration", duration.toString());
        formData.append("format", "meeting");

        const response = await fetch("/api/recordings", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }

        router.push("/history");
      } catch (error) {
        console.error("Error uploading recording:", error);
        alert(t.errors.uploadFailed);
        setIsUploading(false);
      }
    },
    [router, t]
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="flex items-center gap-2">
          <Image
            src="/icons/flownote logo.png"
            alt="Flownote"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-bold text-slate-900">Flownote</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main flex flex-col items-center justify-center min-h-[calc(100vh-56px-64px)] px-4">
        {isUploading ? (
          <div className="w-full max-w-sm mx-auto">
            <div className="card p-8 text-center space-y-6 animate-fade-in">
              <div className="flex justify-center">
                <div className="w-14 h-14 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">{t.dashboard.processing}</h2>
                <p className="text-sm text-slate-500">{t.dashboard.processingDescription}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto animate-slide-up">
            <div className="card p-6 shadow-lg">
              <AudioRecorder onRecordingComplete={handleRecordingComplete} format="meeting" />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab showSettingsTooltip={showSettingsTooltip} />

      {/* PWA Install Modal */}
      {showPWAModal && <DashboardPWAInstallModal onClose={() => setShowPWAModal(false)} />}
    </div>
  );
}
