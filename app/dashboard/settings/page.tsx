"use client";

import { BottomTab } from "@/components/navigation/bottom-tab";
import { SettingsClient } from "@/components/settings/settings-client";

export default function SettingsPage() {
  // Authentication is handled by middleware
  // No server-side auth check needed
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">설정</h1>
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-4">
        <SettingsClient />
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
