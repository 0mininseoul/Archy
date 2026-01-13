"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { InviteFriends } from "./invite-friends";
import {
  AccountSection,
  IntegrationsSection,
  CustomFormatsSection,
  PushNotificationSection,
  DataManagementSection,
  LanguageSection,
} from "./sections";
import { useUserStore } from "@/lib/stores/user-store";

// =============================================================================
// Types
// =============================================================================

interface NotionSaveTarget {
  type: "database" | "page";
  id: string;
  title: string;
}

interface CustomFormat {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
}

interface SettingsClientProps {
  email: string;
  customFormats: CustomFormat[];
}

// =============================================================================
// Component
// =============================================================================

export function SettingsClient({ email, customFormats }: SettingsClientProps) {
  const router = useRouter();
  const { t } = useI18n();

  // Accordion state (only one section open at a time)
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Push notification support check
  const [pushSupported, setPushSupported] = useState(false);

  // Use cached data from store
  const {
    connectionStatus,
    settings,
    fetchUserData,
    isLoaded: userLoaded,
    invalidate: invalidateUser,
  } = useUserStore();

  // Local state for values that can change after OAuth callbacks
  const [notionConnected, setNotionConnected] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [usage, setUsage] = useState({ used: 0, limit: 350 });
  const [saveTarget, setSaveTarget] = useState<NotionSaveTarget | null>(null);
  const [googleFolder, setGoogleFolder] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [audioStorageEnabled, setAudioStorageEnabled] = useState(false);

  // Fetch user data on mount if not already loaded
  useEffect(() => {
    if (!userLoaded) {
      fetchUserData();
    }
  }, [userLoaded, fetchUserData]);

  // Sync store data to local state
  useEffect(() => {
    if (connectionStatus) {
      setNotionConnected(connectionStatus.notionConnected);
      setGoogleConnected(connectionStatus.googleConnected);
      setSlackConnected(connectionStatus.slackConnected);
    }
    if (settings) {
      setUsage({
        used: settings.monthlyMinutesUsed,
        limit: 350 + settings.bonusMinutes,
      });
      setPushEnabled(settings.pushEnabled);
      setAudioStorageEnabled(settings.saveAudioEnabled);

      if (settings.notionDatabaseId && settings.notionSaveTargetType && settings.notionSaveTargetTitle) {
        setSaveTarget({
          type: settings.notionSaveTargetType,
          id: settings.notionDatabaseId,
          title: settings.notionSaveTargetTitle,
        });
      }

      setGoogleFolder({
        id: settings.googleFolderId,
        name: settings.googleFolderName,
      });
    }
  }, [connectionStatus, settings]);

  // Handle OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNotionJustConnected = params.get("notion") === "connected";
    const isGoogleJustConnected = params.get("google") === "connected";

    if (isNotionJustConnected || isGoogleJustConnected) {
      window.history.replaceState({}, "", "/settings");

      // Invalidate cache and refresh data
      invalidateUser();
      setTimeout(() => {
        fetchUserData();
      }, 800);
    }

    // Check push notification support
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
    }
  }, [invalidateUser, fetchUserData]);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      // Clear all stores on logout
      useUserStore.getState().invalidate();
      router.push("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  }, [router]);

  const toggleSection = useCallback((section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  const handleNotionDisconnect = useCallback(() => {
    setNotionConnected(false);
    setSaveTarget(null);
    invalidateUser();
  }, [invalidateUser]);

  const handleGoogleDisconnect = useCallback(() => {
    setGoogleConnected(false);
    setGoogleFolder({ id: null, name: null });
    invalidateUser();
  }, [invalidateUser]);

  // Show loading skeleton on initial load
  if (!userLoaded && !connectionStatus) {
    return (
      <div className="space-y-4">
        {/* Account Section Skeleton */}
        <div className="card p-4">
          <div className="space-y-3">
            <div className="h-5 w-32 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
            <div className="h-2 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        {/* Integrations Skeleton */}
        <div className="card p-4">
          <div className="space-y-3">
            <div className="h-5 w-24 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Account Info */}
      <AccountSection email={email} usage={usage} />

      {/* 2. Integrations */}
      <IntegrationsSection
        notionConnected={notionConnected}
        slackConnected={slackConnected}
        googleConnected={googleConnected}
        initialSaveTarget={saveTarget}
        initialGoogleFolder={googleFolder}
        onNotionDisconnect={handleNotionDisconnect}
        onGoogleDisconnect={handleGoogleDisconnect}
      />

      {/* 3. Custom Formats */}
      <CustomFormatsSection initialFormats={customFormats} />

      {/* 4. Invite Friends */}
      <InviteFriends />

      {/* 5. Push Notifications (Accordion) */}
      {pushSupported && (
        <PushNotificationSection
          initialEnabled={pushEnabled}
          isOpen={openSection === "push"}
          onToggle={() => toggleSection("push")}
        />
      )}

      {/* 6. Data Management (Accordion) */}
      <DataManagementSection
        isOpen={openSection === "data"}
        onToggle={() => toggleSection("data")}
        initialAudioStorageEnabled={audioStorageEnabled}
      />

      {/* 7. Language (Accordion) */}
      <LanguageSection
        isOpen={openSection === "language"}
        onToggle={() => toggleSection("language")}
      />

      {/* 8. Sign Out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 px-4 border border-slate-200 text-slate-700 rounded-xl font-medium text-sm min-h-[44px]"
      >
        {t.settings.signOut}
      </button>

      {/* 9. Contact */}
      <div className="text-center pt-4">
        <button
          onClick={() => router.push("/settings/contact")}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {t.settings.contact}
        </button>
      </div>

      {/* Bottom spacer for scroll */}
      <div className="h-32" aria-hidden="true" />
    </div>
  );
}
