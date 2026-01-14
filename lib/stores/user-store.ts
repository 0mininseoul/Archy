"use client";

import { create } from "zustand";

// =============================================================================
// Types
// =============================================================================

interface ConnectionStatus {
    notionConnected: boolean;
    slackConnected: boolean;
    googleConnected: boolean;
}

interface UserSettings {
    name: string | null;
    avatar_url: string | null;
    email: string;
    pushEnabled: boolean;
    saveAudioEnabled: boolean;
    monthlyMinutesUsed: number;
    bonusMinutes: number;
    notionDatabaseId: string | null;
    notionSaveTargetType: "database" | "page" | null;
    notionSaveTargetTitle: string | null;
    googleFolderId: string | null;
    googleFolderName: string | null;
}

interface UserStore {
    connectionStatus: ConnectionStatus | null;
    settings: UserSettings | null;
    isLoaded: boolean;
    isLoading: boolean;
    lastFetchedAt: number | null;

    // Actions
    fetchUserData: () => Promise<void>;
    setConnectionStatus: (status: ConnectionStatus) => void;
    setSettings: (settings: UserSettings) => void;
    updateConnectionStatus: (updates: Partial<ConnectionStatus>) => void;
    invalidate: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useUserStore = create<UserStore>((set, get) => ({
    connectionStatus: null,
    settings: null,
    isLoaded: false,
    isLoading: false,
    lastFetchedAt: null,

    fetchUserData: async () => {
        const state = get();

        // Skip if already loading
        if (state.isLoading) return;

        // Skip if data is fresh (less than 60 seconds old)
        if (state.isLoaded && state.lastFetchedAt) {
            const age = Date.now() - state.lastFetchedAt;
            if (age < 60000) return;
        }

        set({ isLoading: true });

        try {
            const response = await fetch("/api/user");
            if (!response.ok) throw new Error("Failed to fetch user data");

            const data = await response.json();
            const userData = data.data || data;

            set({
                connectionStatus: {
                    notionConnected: !!userData.notion_access_token,
                    slackConnected: !!userData.slack_access_token,
                    googleConnected: !!userData.google_access_token,
                },
                settings: {
                    name: userData.name || null,
                    avatar_url: userData.avatar_url || null,
                    email: userData.email || "",
                    pushEnabled: userData.push_enabled || false,
                    saveAudioEnabled: userData.save_audio_enabled || false,
                    monthlyMinutesUsed: userData.monthly_minutes_used || 0,
                    bonusMinutes: userData.bonus_minutes || 0,
                    notionDatabaseId: userData.notion_database_id || null,
                    notionSaveTargetType: userData.notion_save_target_type || null,
                    notionSaveTargetTitle: userData.notion_save_target_title || null,
                    googleFolderId: userData.google_folder_id || null,
                    googleFolderName: userData.google_folder_name || null,
                },
                isLoaded: true,
                lastFetchedAt: Date.now(),
            });
        } catch (error) {
            console.error("Failed to fetch user data:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    setConnectionStatus: (status) => {
        set({ connectionStatus: status, isLoaded: true, lastFetchedAt: Date.now() });
    },

    setSettings: (settings) => {
        set({ settings, isLoaded: true, lastFetchedAt: Date.now() });
    },

    updateConnectionStatus: (updates) => {
        set((state) => ({
            connectionStatus: state.connectionStatus
                ? { ...state.connectionStatus, ...updates }
                : null,
        }));
    },

    invalidate: () => {
        set({ isLoaded: false, lastFetchedAt: null });
    },
}));
