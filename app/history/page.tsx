import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { HistoryClient } from "@/components/history/history-client";

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Pass minimal data - the client will fetch and cache recordings
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
