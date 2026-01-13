import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BottomTab } from "@/components/navigation/bottom-tab";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Pass minimal data - the client will fetch and cache user data
  // Custom formats still need to be fetched separately
  const { data: formatsData } = await supabase
    .from("custom_formats")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">설정</h1>
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-4">
        <SettingsClient
          email={user.email || ""}
          customFormats={formatsData || []}
        />
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
