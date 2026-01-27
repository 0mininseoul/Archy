"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RecordingDetailClient } from "@/components/recordings/recording-detail-client";
import { useRecordingsStore } from "@/lib/stores/recordings-store";
import { useUserStore } from "@/lib/stores/user-store";
import { Recording } from "@/types";

export default function RecordingDetailPage() {
  const params = useParams();
  const id = params.id as string;

  // Get cached data for quick initial display (list items don't have full data)
  const { getRecordingById, isLoaded: recordingsLoaded } = useRecordingsStore();
  const { settings } = useUserStore();
  const cachedRecording = recordingsLoaded ? getRecordingById(id) : null;

  const [recording, setRecording] = useState<Recording | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [saveAudioEnabled, setSaveAudioEnabled] = useState(settings?.saveAudioEnabled ?? false);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Always fetch full recording data from API (list cache doesn't have formatted_content)
    const fetchRecording = async () => {
      try {
        const response = await fetch(`/api/recordings/${id}`);

        if (!response.ok) {
          if (response.status === 404) {
            setNotFound(true);
          }
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        const fetchedRecording = data.data || data;

        setRecording(fetchedRecording.recording || fetchedRecording);
        setIsOwner(fetchedRecording.isOwner ?? true);
        setSaveAudioEnabled(fetchedRecording.saveAudioEnabled ?? settings?.saveAudioEnabled ?? false);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch recording:", error);
        setNotFound(true);
        setIsLoading(false);
      }
    };

    fetchRecording();
  }, [id, settings?.saveAudioEnabled]);

  // Show cached data while loading full data (for fast perceived loading)
  if (isLoading && cachedRecording) {
    // Cast to Recording for display - missing fields will be filled by API response
    return (
      <RecordingDetailClient
        recording={cachedRecording as unknown as Recording}
        saveAudioEnabled={settings?.saveAudioEnabled ?? false}
        isOwner={true}
      />
    );
  }

  // Still loading - show minimal loading state (not skeleton)
  if (isLoading) {
    return (
      <div className="app-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !recording) {
    return (
      <div className="app-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-500">녹음을 찾을 수 없습니다</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <RecordingDetailClient
      recording={recording}
      saveAudioEnabled={saveAudioEnabled}
      isOwner={isOwner}
    />
  );
}
