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

  // Fetch all data on the server in parallel
  const [{ data: userData }, { data: formatsData }] = await Promise.all([
    supabase
      .from("users")
      .select("monthly_minutes_used, notion_access_token, notion_database_id, slack_access_token")
      .eq("id", user.id)
      .single(),
    supabase
      .from("custom_formats")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const initialData = {
    email: user.email || "",
    usage: {
      used: userData?.monthly_minutes_used || 0,
      limit: 350,
    },
    notionConnected: !!userData?.notion_access_token,
    slackConnected: !!userData?.slack_access_token,
    notionDatabaseId: userData?.notion_database_id || null,
    customFormats: formatsData || [],
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-header-title">설정</h1>
      </header>

      {/* Main Content */}
      <main className="app-main px-4 py-4">
        <SettingsClient initialData={initialData} />
      </main>

      {/* Bottom Tab Navigation */}
      <BottomTab />
    </div>
  );
}
