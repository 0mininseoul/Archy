"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChunkedAudioRecorder } from "@/components/recorder/chunked-audio-recorder";
import { ChunkedRecordingResult } from "@/hooks/useChunkedRecorder";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { useI18n } from "@/lib/i18n";
import { DashboardPWAInstallModal } from "@/components/pwa/dashboard-install-modal";
import { useUserStore } from "@/lib/stores/user-store";
import { useRecordingsStore } from "@/lib/stores/recordings-store";

// =============================================================================
// Component
// =============================================================================

export function DashboardClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [showPWAModal, setShowPWAModal] = useState(false);

  // Use cached data from store
  const { connectionStatus, fetchUserData, isLoaded: userLoaded } = useUserStore();
  const { invalidate: invalidateRecordings } = useRecordingsStore();

  // Fetch user data on mount if not already loaded
  useEffect(() => {
    if (!userLoaded) {
      fetchUserData();
    }
  }, [userLoaded, fetchUserData]);

  // Show settings tooltip when integrations not configured
  const showSettingsTooltip = connectionStatus
    ? (!connectionStatus.notionConnected && !connectionStatus.googleConnected) || !connectionStatus.slackConnected
    : false;

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
    async (result: ChunkedRecordingResult) => {
      const { transcripts, totalDuration, totalChunks } = result;

      // 전사된 청크가 없으면 에러
      if (transcripts.length === 0) {
        alert("전사된 내용이 없습니다. 다시 녹음해주세요.");
        return;
      }

      // 녹음 시간이 너무 짧으면 에러
      if (totalDuration < 1) {
        alert("녹음 시간이 너무 짧습니다. 다시 녹음해주세요.");
        return;
      }

      setIsProcessing(true);
      setProcessingStatus(t.dashboard.finalizingRecording);

      try {
        console.log(
          `[Dashboard] Finalizing recording: ${transcripts.length}/${totalChunks} chunks, ${totalDuration}s`
        );

        // finalize API 호출
        const response = await fetch("/api/recordings/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcripts,
            totalDurationSeconds: totalDuration,
            format: "meeting",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Finalize failed");
        }

        // 성공
        invalidateRecordings();
        router.push("/history");
      } catch (error) {
        console.error("Error finalizing recording:", error);
        alert(t.errors.uploadFailed);
        setIsProcessing(false);
        setProcessingStatus("");
      }
    },
    [router, t, invalidateRecordings]
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="flex items-center gap-2">
          <Image
            src="/icons/archy logo.png"
            alt="Archy"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-bold text-slate-900">Archy</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main flex flex-col items-center justify-center min-h-[calc(100vh-56px-64px)] px-4">
        {isProcessing ? (
          <div className="w-full max-w-sm mx-auto">
            <div className="card p-8 text-center space-y-6 animate-fade-in">
              <div className="flex justify-center">
                <div className="w-14 h-14 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">
                  {processingStatus || t.dashboard.processing}
                </h2>
                <p className="text-sm text-slate-500">{t.dashboard.processingDescription}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto animate-slide-up">
            <div className="card p-6 shadow-lg">
              <ChunkedAudioRecorder
                onRecordingComplete={handleRecordingComplete}
                format="meeting"
              />
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
