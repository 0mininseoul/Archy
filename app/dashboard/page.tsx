import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Fetch connection status on the server
  const { data: userData } = await supabase
    .from("users")
    .select("notion_access_token, slack_access_token, google_access_token")
    .eq("id", user.id)
    .single();

  const initialConnectionStatus = {
    notionConnected: !!userData?.notion_access_token,
    slackConnected: !!userData?.slack_access_token,
    googleConnected: !!userData?.google_access_token,
  };

  return <DashboardClient initialConnectionStatus={initialConnectionStatus} />;
}
