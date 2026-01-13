"use client";

import { create } from "zustand";
import { Recording } from "@/types";

// =============================================================================
// Types
// =============================================================================

interface RecordingsStore {
    recordings: Recording[];
    isLoaded: boolean;
    isLoading: boolean;
    lastFetchedAt: number | null;

    // Actions
    setRecordings: (recordings: Recording[]) => void;
    fetchRecordings: () => Promise<void>;
    invalidate: () => void;
    updateRecording: (id: string, updates: Partial<Recording>) => void;
    removeRecording: (id: string) => void;
    getRecordingById: (id: string) => Recording | undefined;
}

// =============================================================================
// Store
// =============================================================================

export const useRecordingsStore = create<RecordingsStore>((set, get) => ({
    recordings: [],
    isLoaded: false,
    isLoading: false,
    lastFetchedAt: null,

    setRecordings: (recordings) => {
        // Sort: pinned first, then by created_at desc
        const sorted = [...recordings].sort((a, b) => {
            if (a.is_pinned === b.is_pinned) {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            return a.is_pinned ? -1 : 1;
        });
        set({ recordings: sorted, isLoaded: true, lastFetchedAt: Date.now() });
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
            const response = await fetch("/api/recordings");
            if (!response.ok) throw new Error("Failed to fetch recordings");

            const data = await response.json();
            const recordings = data.data?.recordings || data.recordings || [];

            get().setRecordings(recordings);
        } catch (error) {
            console.error("Failed to fetch recordings:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    invalidate: () => {
        set({ isLoaded: false, lastFetchedAt: null });
    },

    updateRecording: (id, updates) => {
        set((state) => {
            const updated = state.recordings.map((r) =>
                r.id === id ? { ...r, ...updates } : r
            );
            // Re-sort if pin status changed
            const sorted = updated.sort((a, b) => {
                if (a.is_pinned === b.is_pinned) {
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }
                return a.is_pinned ? -1 : 1;
            });
            return { recordings: sorted };
        });
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
