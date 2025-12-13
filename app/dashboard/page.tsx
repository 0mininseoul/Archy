"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioRecorder } from "@/components/recorder/audio-recorder";
import { getFileExtension } from "@/hooks/useAudioRecorder";

export default function DashboardPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

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
      alert("녹음 업로드에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container-custom h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push("/dashboard")}>
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold">
              F
            </div>
            <span className="text-xl font-bold text-slate-900">Flownote</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/history")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="History"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              title="Settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {isUploading ? (
            <div className="card p-12 text-center space-y-6 animate-fade-in">
              <div className="flex justify-center">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">
                  변환 중...
                </h2>
                <p className="text-slate-500">
                  음성을 텍스트로 변환하고 AI 요약을 생성하고 있습니다. 잠시만 기다려주세요.
                </p>
              </div>
            </div>
          ) : (
            <div className="card p-8 md:p-12 shadow-lg animate-slide-up">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-900">새 녹음</h1>
                <p className="text-slate-500 mt-2">포맷을 선택하고 녹음을 시작하세요</p>
              </div>

              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                format="meeting"
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
