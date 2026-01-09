"use client";

import { useEffect, useState, useCallback } from "react";
import { Recording } from "@/types";
import { useI18n } from "@/lib/i18n";
import { RecordingCard, FilterChips, EmptyState } from "./sections";

// =============================================================================
// Types
// =============================================================================

type FilterValue = "all" | "processing" | "completed" | "failed";

interface HistoryClientProps {
  initialRecordings: Recording[];
  pushEnabled: boolean;
  slackConnected: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function HistoryClient({ initialRecordings, pushEnabled, slackConnected }: HistoryClientProps) {
  const { t } = useI18n();
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings);
  const [filter, setFilter] = useState<FilterValue>("all");

  // Polling for processing recordings
  useEffect(() => {
    const hasProcessing = recordings.some((r) => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/recordings");
        const data = await response.json();
        setRecordings(data.data?.recordings || data.recordings || []);
      } catch (error) {
        console.error("Failed to fetch recordings:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [recordings]);

  const handleHideRecording = useCallback(async (id: string) => {
    if (!confirm("이 녹음을 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: true }),
      });

      if (response.ok) {
        setRecordings((prev) => prev.filter((r) => r.id !== id));
      } else {
        throw new Error("Hide failed");
      }
    } catch (error) {
      console.error("Failed to hide recording:", error);
      alert("녹음을 숨기는데 실패했습니다.");
    }
  }, []);

  const handleTitleUpdate = useCallback((id: string, newTitle: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, title: newTitle } : r))
    );
  }, []);

  const filteredRecordings = recordings.filter((recording) => {
    if (filter === "all") return true;
    return recording.status === filter;
  });

  return (
    <>
      {/* Filter Chips */}
      <FilterChips value={filter} onChange={setFilter} />

      {/* Recordings List */}
      <div className="px-4 py-4">
        {filteredRecordings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {filteredRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                pushEnabled={pushEnabled}
                slackConnected={slackConnected}
                onHide={handleHideRecording}
                onTitleUpdate={handleTitleUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
