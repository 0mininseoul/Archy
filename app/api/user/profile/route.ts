import { withAuth, successResponse } from "@/lib/api";

export const runtime = "edge";

interface UserProfile {
  email: string | undefined;
  notion_access_token: string | null;
  notion_database_id: string | null;
  slack_access_token: string | null;
  google_access_token: string | null;
  google_folder_id: string | null;
  google_folder_name: string | null;
}

// GET /api/user/profile - Get user profile with connection status
export const GET = withAuth<UserProfile>(async ({ user, supabase }) => {
  const { data: userData } = await supabase
    .from("users")
    .select("notion_access_token, notion_database_id, slack_access_token, google_access_token, google_folder_id, google_folder_name")
    .eq("id", user.id)
    .single();

  return successResponse({
    email: user.email,
    notion_access_token: userData?.notion_access_token || null,
    notion_database_id: userData?.notion_database_id || null,
    slack_access_token: userData?.slack_access_token || null,
    google_access_token: userData?.google_access_token || null,
    google_folder_id: userData?.google_folder_id || null,
    google_folder_name: userData?.google_folder_name || null,
  });
});
