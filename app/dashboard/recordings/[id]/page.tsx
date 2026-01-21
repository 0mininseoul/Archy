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

  // Get cached data immediately on render (before any effects)
  const { getRecordingById, isLoaded: recordingsLoaded } = useRecordingsStore();
  const { settings, isLoaded: userLoaded } = useUserStore();
  const cachedRecording = recordingsLoaded ? (getRecordingById(id) ?? null) : null;

  // Use cached data as initial state for instant rendering
  const [recording, setRecording] = useState<Recording | null>(cachedRecording);
  const [isOwner, setIsOwner] = useState(!!cachedRecording);
  const [saveAudioEnabled, setSaveAudioEnabled] = useState(settings?.saveAudioEnabled ?? false);
  const [isLoading, setIsLoading] = useState(!cachedRecording);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // If already have cached recording, no need to fetch
    if (cachedRecording) {
      setRecording(cachedRecording);
      setIsOwner(true);
      setSaveAudioEnabled(settings?.saveAudioEnabled ?? false);
      setIsLoading(false);
      return;
    }

    // Not in cache - fetch from API
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
  }, [id, getRecordingById, settings?.saveAudioEnabled]);

  // Show nothing (instant) if loading and we have cached data potential
  if (isLoading && recordingsLoaded) {
    // Check cache one more time
    const cachedRecording = getRecordingById(id);
    if (cachedRecording) {
      return (
        <RecordingDetailClient
          recording={cachedRecording}
          saveAudioEnabled={settings?.saveAudioEnabled ?? false}
          isOwner={true}
        />
      );
    }
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
