"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AudioRecorder } from "@/components/recorder/audio-recorder";

export default function DashboardPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    setIsUploading(true);

    try {
      // Convert blob to File
      const file = new File([blob], `recording-${Date.now()}.webm`, {
        type: "audio/webm",
      });

      // Create form data
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("duration", duration.toString());
      formData.append("format", "meeting"); // This should come from the recorder

      // Upload to API
      const response = await fetch("/api/recordings", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Image
              src="/logo.png"
              alt="Flownote"
              width={40}
              height={40}
              className="w-10 h-10"
            />

            <div className="flex items-center gap-6">
              {/* Usage Indicator */}
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-800">245분</span> /{" "}
                350분
              </div>

              {/* Navigation */}
              <button
                onClick={() => router.push("/history")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="히스토리"
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>

              <button
                onClick={() => router.push("/settings")}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="설정"
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {isUploading ? (
          <div className="glass-card p-12 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-800">
              녹음을 처리하고 있습니다...
            </h2>
            <p className="text-gray-600">
              STT 변환 및 AI 문서 정리 중입니다. 잠시만 기다려주세요.
            </p>
          </div>
        ) : (
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            format="meeting"
          />
        )}
      </main>
    </div>
  );
}
