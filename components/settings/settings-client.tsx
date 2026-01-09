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

interface InitialData {
  email: string;
  usage: { used: number; limit: number };
  notionConnected: boolean;
  slackConnected: boolean;
  googleConnected: boolean;
  notionDatabaseId: string | null;
  notionSaveTargetType: "database" | "page" | null;
  notionSaveTargetTitle: string | null;
  googleFolderId: string | null;
  googleFolderName: string | null;
  customFormats: CustomFormat[];
  pushEnabled: boolean;
}

interface SettingsClientProps {
  initialData: InitialData;
}

// =============================================================================
// Component
// =============================================================================

export function SettingsClient({ initialData }: SettingsClientProps) {
  const router = useRouter();
  const { t } = useI18n();

  // Accordion state (only one section open at a time)
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Push notification support check
  const [pushSupported, setPushSupported] = useState(false);

  // State for values that can change after OAuth callbacks
  const [notionConnected, setNotionConnected] = useState(initialData.notionConnected);
  const [googleConnected, setGoogleConnected] = useState(initialData.googleConnected);
  const [usage, setUsage] = useState(initialData.usage);
  const [saveTarget, setSaveTarget] = useState<NotionSaveTarget | null>(() => {
    if (initialData.notionDatabaseId && initialData.notionSaveTargetType && initialData.notionSaveTargetTitle) {
      return {
        type: initialData.notionSaveTargetType,
        id: initialData.notionDatabaseId,
        title: initialData.notionSaveTargetTitle,
      };
    }
    return null;
  });
  const [googleFolder, setGoogleFolder] = useState({
    id: initialData.googleFolderId,
    name: initialData.googleFolderName,
  });

  // Handle OAuth callback URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNotionJustConnected = params.get("notion") === "connected";
    const isGoogleJustConnected = params.get("google") === "connected";

    if (isNotionJustConnected || isGoogleJustConnected) {
      window.history.replaceState({}, "", "/settings");

      // Wait for DB save then refresh data
      setTimeout(async () => {
        await refreshData();
      }, 800);
    }

    // Check push notification support
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [usageResponse, userResponse] = await Promise.all([
        fetch("/api/user/usage"),
        fetch("/api/user/profile"),
      ]);

      const usageData = await usageResponse.json();
      const userData = await userResponse.json();

      setUsage({
        used: usageData.used || 0,
        limit: usageData.limit || 350,
      });
      setNotionConnected(!!userData.notion_access_token);
      setGoogleConnected(!!userData.google_access_token);

      if (userData.notion_database_id && userData.notion_save_target_type) {
        setSaveTarget({
          type: userData.notion_save_target_type,
          id: userData.notion_database_id,
          title: userData.notion_save_target_title || "",
        });
      }

      setGoogleFolder({
        id: userData.google_folder_id || null,
        name: userData.google_folder_name || null,
      });
    } catch (error) {
      console.error("Failed to refresh data:", error);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
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
  }, []);

  const handleGoogleDisconnect = useCallback(() => {
    setGoogleConnected(false);
    setGoogleFolder({ id: null, name: null });
  }, []);

  return (
    <div className="space-y-4">
      {/* 1. Account Info */}
      <AccountSection email={initialData.email} usage={usage} />

      {/* 2. Integrations */}
      <IntegrationsSection
        notionConnected={notionConnected}
        slackConnected={initialData.slackConnected}
        googleConnected={googleConnected}
        initialSaveTarget={saveTarget}
        initialGoogleFolder={googleFolder}
        onNotionDisconnect={handleNotionDisconnect}
        onGoogleDisconnect={handleGoogleDisconnect}
      />

      {/* 3. Custom Formats */}
      <CustomFormatsSection initialFormats={initialData.customFormats} />

      {/* 4. Invite Friends */}
      <InviteFriends />

      {/* 5. Push Notifications (Accordion) */}
      {pushSupported && (
        <PushNotificationSection
          initialEnabled={initialData.pushEnabled}
          isOpen={openSection === "push"}
          onToggle={() => toggleSection("push")}
        />
      )}

      {/* 6. Data Management (Accordion) */}
      <DataManagementSection
        isOpen={openSection === "data"}
        onToggle={() => toggleSection("data")}
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
