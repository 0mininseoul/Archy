"use client";

import { create } from "zustand";
import { RecordingListItem } from "@/lib/types/database";

// =============================================================================
// Types
// =============================================================================

interface RecordingsStore {
    recordings: RecordingListItem[];
    isLoaded: boolean;
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    nextOffset: number | null;
    lastFetchedAt: number | null;

    // Actions
    setRecordings: (recordings: RecordingListItem[]) => void;
    appendRecordings: (recordings: RecordingListItem[]) => void;
    fetchRecordings: () => Promise<void>;
    fetchMoreRecordings: () => Promise<void>;
    invalidate: () => void;
    updateRecording: (id: string, updates: Partial<RecordingListItem>) => void;
    removeRecording: (id: string) => void;
    getRecordingById: (id: string) => RecordingListItem | undefined;
    setPaginationState: (hasMore: boolean, nextOffset: number | null) => void;
}

// =============================================================================
// Store
// =============================================================================

// Helper function to sort recordings (pinned first, then by created_at desc)
const sortRecordings = (recordings: RecordingListItem[]): RecordingListItem[] => {
    return [...recordings].sort((a, b) => {
        if (a.is_pinned === b.is_pinned) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.is_pinned ? -1 : 1;
    });
};

export const useRecordingsStore = create<RecordingsStore>((set, get) => ({
    recordings: [],
    isLoaded: false,
    isLoading: false,
    isLoadingMore: false,
    hasMore: true,
    nextOffset: null,
    lastFetchedAt: null,

    setRecordings: (recordings) => {
        set({
            recordings: sortRecordings(recordings),
            isLoaded: true,
            lastFetchedAt: Date.now(),
        });
    },

    appendRecordings: (newRecordings) => {
        set((state) => {
            // Avoid duplicates by filtering out existing IDs
            const existingIds = new Set(state.recordings.map((r) => r.id));
            const uniqueNew = newRecordings.filter((r) => !existingIds.has(r.id));
            return {
                recordings: sortRecordings([...state.recordings, ...uniqueNew]),
            };
        });
    },

    setPaginationState: (hasMore, nextOffset) => {
        set({ hasMore, nextOffset });
    },

    fetchRecordings: async () => {
        const state = get();

        // Skip if already loading
        if (state.isLoading) return;

        // Skip if data is fresh (less than 30 seconds old)
        if (state.isLoaded && state.lastFetchedAt) {
            const age = Date.now() - state.lastFetchedAt;
            if (age < 30000) return;
        }

        set({ isLoading: true });

        try {
            const response = await fetch("/api/recordings?offset=0");
            if (!response.ok) throw new Error("Failed to fetch recordings");

            const data = await response.json();
            const recordings = data.data?.recordings || data.recordings || [];
            const hasMore = data.data?.hasMore ?? data.hasMore ?? false;
            const nextOffset = data.data?.nextOffset ?? data.nextOffset ?? null;

            get().setRecordings(recordings);
            get().setPaginationState(hasMore, nextOffset);
        } catch (error) {
            console.error("Failed to fetch recordings:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchMoreRecordings: async () => {
        const state = get();

        // Skip if already loading or no more data
        if (state.isLoadingMore || state.isLoading || !state.hasMore || state.nextOffset === null) {
            return;
        }

        set({ isLoadingMore: true });

        try {
            const response = await fetch(`/api/recordings?offset=${state.nextOffset}`);
            if (!response.ok) throw new Error("Failed to fetch more recordings");

            const data = await response.json();
            const recordings = data.data?.recordings || data.recordings || [];
            const hasMore = data.data?.hasMore ?? data.hasMore ?? false;
            const nextOffset = data.data?.nextOffset ?? data.nextOffset ?? null;

            get().appendRecordings(recordings);
            get().setPaginationState(hasMore, nextOffset);
        } catch (error) {
            console.error("Failed to fetch more recordings:", error);
        } finally {
            set({ isLoadingMore: false });
        }
    },

    invalidate: () => {
        set({ isLoaded: false, lastFetchedAt: null, hasMore: true, nextOffset: null });
    },

    updateRecording: (id, updates) => {
        set((state) => ({
            recordings: sortRecordings(
                state.recordings.map((r) => (r.id === id ? { ...r, ...updates } : r))
            ),
        }));
    },

    removeRecording: (id) => {
        set((state) => ({
            recordings: state.recordings.filter((r) => r.id !== id),
        }));
    },

    getRecordingById: (id) => {
        return get().recordings.find((r) => r.id === id);
    },
}));
