"use client";

import { useEffect, useCallback, useRef } from "react";
import { RecordingCard, EmptyState } from "./sections";
import { useRecordingsStore } from "@/lib/stores/recordings-store";
import { useUserStore } from "@/lib/stores/user-store";

// =============================================================================
// Component
// =============================================================================

export function HistoryClient() {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Use cached data from stores
  const {
    recordings,
    isLoaded,
    isLoading,
    isLoadingMore,
    hasMore,
    fetchRecordings,
    fetchMoreRecordings,
    updateRecording,
    removeRecording,
  } = useRecordingsStore();

  const { connectionStatus, settings, fetchUserData, isLoaded: userLoaded } = useUserStore();

  // Fetch data on mount if not already loaded
  useEffect(() => {
    if (!isLoaded) {
      fetchRecordings();
    }
    if (!userLoaded) {
      fetchUserData();
    }
  }, [isLoaded, fetchRecordings, userLoaded, fetchUserData]);

  // Infinite scroll using Intersection Observer
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          fetchMoreRecordings();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, isLoading, fetchMoreRecordings]);

  // Polling for processing recordings
  useEffect(() => {
    const hasProcessing = recordings.some((r) => r.status === "processing");

    if (hasProcessing) {
      // Start polling
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch("/api/recordings");
          const data = await response.json();
          const freshRecordings = data.data?.recordings || data.recordings || [];
          useRecordingsStore.getState().setRecordings(freshRecordings);
        } catch (error) {
          console.error("Failed to poll recordings:", error);
        }
      }, 3000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [recordings]);

  const handleHideRecording = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/recordings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_hidden: true }),
        });

        if (response.ok) {
          removeRecording(id);
        } else {
          throw new Error("Hide failed");
        }
      } catch (error) {
        console.error("Failed to hide recording:", error);
        alert("녹음을 숨기는데 실패했습니다.");
      }
    },
    [removeRecording]
  );

  const handlePinRecording = useCallback(
    async (id: string, isPinned: boolean) => {
      // Optimistic update
      updateRecording(id, { is_pinned: isPinned });

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
        // Revert optimistic update
        updateRecording(id, { is_pinned: !isPinned });
      }
    },
    [updateRecording]
  );

  // Show loading state only on initial load
  if (!isLoaded && isLoading) {
    return (
      <div className="px-4 py-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-3/4 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const pushEnabled = settings?.pushEnabled ?? false;
  const slackConnected = connectionStatus?.slackConnected ?? false;

  return (
    <div className="px-4 py-4">
      {recordings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {recordings.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              pushEnabled={pushEnabled}
              slackConnected={slackConnected}
              onHide={handleHideRecording}
              onPin={handlePinRecording}
            />
          ))}

          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="py-4 flex justify-center">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>불러오는 중...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
