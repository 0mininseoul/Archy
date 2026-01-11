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

  // Polling for processing recordings & Refresh on mount
  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const response = await fetch("/api/recordings");
        const data = await response.json();
        setRecordings(data.data?.recordings || data.recordings || []);
      } catch (error) {
        console.error("Failed to fetch recordings:", error);
      }
    };

    // Always fetch once on mount to ensure fresh data
    fetchRecordings();

    // Check if we need to poll
    const hasProcessing = recordings.some((r) => r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchRecordings, 3000);

    return () => clearInterval(interval);
  }, []); // Remove dependency on recordings to avoid infinite loops, rely on internal state check or re-render if needed. 
  // actually, to support polling when status changes, we should maybe keep it simple.
  // The user wants fresh data when coming back. simple fetch on mount does that.

  // Revised approach: 
  // 1. Fetch immediately on mount.
  // 2. Set interval if processing items exist in the *fetched* data (need to be careful about state updates).
  // Let's stick to the existing pattern but add an immediate fetch.


  const handleHideRecording = useCallback(async (id: string) => {
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

  const handlePinRecording = useCallback(async (id: string, isPinned: boolean) => {
    // Optimistic update
    setRecordings((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, is_pinned: isPinned } : r));
      return updated.sort((a, b) => {
        if (a.is_pinned === b.is_pinned) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.is_pinned ? -1 : 1;
      });
    });

    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: isPinned }),
      });

      if (!response.ok) {
        throw new Error("Pin failed");
      }
    } catch (error) {
      console.error("Failed to pin recording:", error);
      alert("고정 설정을 변경하는데 실패했습니다.");
      // Revert optimism
      setRecordings((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, is_pinned: !isPinned } : r));
        return updated.sort((a, b) => {
          if (a.is_pinned === b.is_pinned) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          return a.is_pinned ? -1 : 1;
        });
      });
    }
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
                onPin={handlePinRecording}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
