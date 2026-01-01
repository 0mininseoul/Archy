"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AudioRecorder } from "@/components/recorder/audio-recorder";
import { getFileExtension } from "@/hooks/useAudioRecorder";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { useI18n } from "@/lib/i18n";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [isUploading, setIsUploading] = useState(false);
  const [notionConnected, setNotionConnected] = useState(true);
  const [slackConnected, setSlackConnected] = useState(true);

  useEffect(() => {
    const fetchConnectionStatus = async () => {
      try {
        const response = await fetch("/api/user/data");
        if (response.ok) {
          const data = await response.json();
          setNotionConnected(data.notionConnected);
          setSlackConnected(data.slackConnected);
        }
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
      }
    };
    fetchConnectionStatus();
  }, []);

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
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

      const data = await response.json();

      // Redirect to history page
      router.push("/history");
    } catch (error) {
      console.error("Error uploading recording:", error);
      alert(t.errors.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
            F
          </div>
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
              <div className="space-y-4">
                {/* Integration Warnings */}
                {(!notionConnected || !slackConnected) && (
                  <div className="space-y-2">
                    {!notionConnected && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-start gap-2 text-xs text-amber-800">
                          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>{t.dashboard.notionNotConnected}</span>
                        </div>
                      </div>
                    )}
                    {!slackConnected && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-start gap-2 text-xs text-amber-800">
                          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="leading-relaxed">
                            Slack이 연결되지 않았습니다.<br />
                            완료 알림이 발송되지 않습니다.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <AudioRecorder
                  onRecordingComplete={handleRecordingComplete}
                  format="meeting"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
