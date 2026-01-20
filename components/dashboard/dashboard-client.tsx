"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChunkedAudioRecorder } from "@/components/recorder/chunked-audio-recorder";
import { ChunkedRecordingResult } from "@/hooks/useChunkedRecorder";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { DashboardPWAInstallModal } from "@/components/pwa/dashboard-install-modal";
import { useUserStore } from "@/lib/stores/user-store";
import { useRecordingsStore } from "@/lib/stores/recordings-store";

// =============================================================================
// Component
// =============================================================================

export function DashboardClient() {
  const router = useRouter();
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
      const { transcripts, totalDuration, totalChunks, sessionId } = result;

      // 녹음 시간이 너무 짧으면 에러
      if (totalDuration < 1) {
        alert("녹음 시간이 너무 짧습니다. 다시 녹음해주세요.");
        return;
      }

      // 즉시 history 페이지로 이동
      invalidateRecordings();
      router.push("/dashboard/history");

      // 백그라운드에서 finalize 처리 (await 하지 않음)
      const finalizeInBackground = async () => {
        try {
          // 세션 기반인 경우
          if (sessionId) {
            console.log(
              `[Dashboard] Finalizing session in background: ${sessionId}, ${totalDuration}s`
            );

            const response = await fetch("/api/recordings/finalize", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sessionId,
                totalDurationSeconds: totalDuration,
                format: "meeting",
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              console.error("Error finalizing session:", errorData.error);
            } else {
              console.log(`[Dashboard] Session ${sessionId} finalized successfully`);
              invalidateRecordings();
            }
            return;
          }

          // 레거시: transcripts 배열 기반
          if (transcripts.length === 0) {
            console.error("No transcripts to finalize");
            return;
          }

          console.log(
            `[Dashboard] Finalizing recording in background: ${transcripts.length}/${totalChunks} chunks, ${totalDuration}s`
          );

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
            console.error("Error finalizing recording:", errorData.error);
          } else {
            console.log("[Dashboard] Recording finalized successfully");
            invalidateRecordings();
          }
        } catch (error) {
          console.error("Error in background finalize:", error);
        }
      };

      // 백그라운드 처리 시작
      finalizeInBackground();
    },
    [router, invalidateRecordings]
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
        <div className="w-full max-w-sm mx-auto animate-slide-up">
          <div className="card p-6 shadow-lg">
            <ChunkedAudioRecorder
              onRecordingComplete={handleRecordingComplete}
              format="meeting"
            />
          </div>
        </div>
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab showSettingsTooltip={showSettingsTooltip} />

      {/* PWA Install Modal */}
      {showPWAModal && <DashboardPWAInstallModal onClose={() => setShowPWAModal(false)} />}
    </div>
  );
}
