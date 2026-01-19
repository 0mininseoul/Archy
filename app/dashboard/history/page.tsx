"use client";

import { BottomTab } from "@/components/navigation/bottom-tab";
import { HistoryClient } from "@/components/history/history-client";

export default function HistoryPage() {
  // Authentication is handled by middleware
  // No server-side auth check needed
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">기록</h1>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <HistoryClient />
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
