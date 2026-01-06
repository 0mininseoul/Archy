"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AudioRecorder } from "@/components/recorder/audio-recorder";
import { getFileExtension } from "@/hooks/useAudioRecorder";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { useI18n } from "@/lib/i18n";
import { DashboardPWAInstallModal } from "@/components/pwa/dashboard-install-modal";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [isUploading, setIsUploading] = useState(false);
  const [notionConnected, setNotionConnected] = useState(true);
  const [slackConnected, setSlackConnected] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(true);
  const [showPWAModal, setShowPWAModal] = useState(false);

  // 연동 미완료 시 설정 안내 말풍선 표시 조건:
  // (Notion과 Google 모두 미연동) 또는 (Slack 미연동)이면 표시
  const showSettingsTooltip = (!notionConnected && !googleConnected) || !slackConnected;

  useEffect(() => {
    const fetchConnectionStatus = async () => {
      try {
        const response = await fetch("/api/user/data");
        if (response.ok) {
          const data = await response.json();
          setNotionConnected(data.notionConnected);
          setSlackConnected(data.slackConnected);
          setGoogleConnected(data.googleConnected);
        }
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
      }
    };
    fetchConnectionStatus();

    // PWA 설치 모달 표시 조건 체크
    const checkPWAModal = () => {
      // 모바일 디바이스가 아닌 경우 표시하지 않음 (PC 제외)
      const ua = navigator.userAgent;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile) {
        return;
      }

      // 이미 Standalone 모드인 경우 표시하지 않음
      if (window.matchMedia("(display-mode: standalone)").matches) {
        return;
      }
      if ((navigator as any).standalone === true) {
        return;
      }

      // 24시간 내에 dismiss한 경우 표시하지 않음
      const dismissedTime = localStorage.getItem("pwa_install_dismissed");
      if (dismissedTime) {
        const dismissed = parseInt(dismissedTime, 10);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (now - dismissed < twentyFourHours) {
          return;
        }
      }

      // 최초 방문인 경우 표시
      const hasSeenPWAModal = localStorage.getItem("pwa_modal_seen");
      if (!hasSeenPWAModal) {
        setShowPWAModal(true);
        localStorage.setItem("pwa_modal_seen", "true");
      }
    };

    checkPWAModal();
  }, []);

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    // 녹음 데이터가 없는 경우 에러 처리
    if (!blob || blob.size === 0) {
      alert("녹음 데이터가 없습니다. 다시 녹음해주세요.");
      return;
    }

    // 너무 짧은 녹음 (1초 미만) 경고
    if (duration < 1) {
      alert("녹음 시간이 너무 짧습니다. 다시 녹음해주세요.");
      return;
    }

    setIsUploading(true);

    try {
      // Get file extension based on the actual blob type
      const extension = getFileExtension(blob.type);

      // Convert blob to File with correct extension
      const file = new File([blob], `recording-${Date.now()}.${extension}`, {
        type: blob.type,
      });

      // Create form data
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("duration", duration.toString());
      formData.append("format", "meeting"); // Default format

      // Upload to API
      const response = await fetch("/api/recordings", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      // Redirect to history page immediately without resetting state
      // This prevents the brief flash of the recording screen
      router.push("/history");
    } catch (error) {
      console.error("Error uploading recording:", error);
      alert(t.errors.uploadFailed);
      // Only reset uploading state on error
      setIsUploading(false);
    }
  };

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
                <h2 className="text-xl font-bold text-slate-900">
                  {t.dashboard.processing}
                </h2>
                <p className="text-sm text-slate-500">
                  {t.dashboard.processingDescription}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm mx-auto animate-slide-up">
            <div className="card p-6 shadow-lg">
              <AudioRecorder
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
      {showPWAModal && (
        <DashboardPWAInstallModal onClose={() => setShowPWAModal(false)} />
      )}
    </div>
  );
}
