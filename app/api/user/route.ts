import { withAuth, successResponse } from "@/lib/api";

export const runtime = "edge";

// GET /api/user - Get comprehensive user data for caching
export const GET = withAuth(async ({ user, supabase }) => {
    const { data: userData } = await supabase
        .from("users")
        .select(`
      email,
      notion_access_token,
      notion_database_id,
      notion_save_target_type,
      notion_save_target_title,
      slack_access_token,
      google_access_token,
      google_folder_id,
      google_folder_name,
      push_enabled,
      save_audio_enabled,
      monthly_minutes_used,
      bonus_minutes
    `)
        .eq("id", user.id)
        .single();

    return successResponse({
        email: user.email,
        notion_access_token: userData?.notion_access_token || null,
        notion_database_id: userData?.notion_database_id || null,
        notion_save_target_type: userData?.notion_save_target_type || null,
        notion_save_target_title: userData?.notion_save_target_title || null,
        slack_access_token: userData?.slack_access_token || null,
        google_access_token: userData?.google_access_token || null,
        google_folder_id: userData?.google_folder_id || null,
        google_folder_name: userData?.google_folder_name || null,
        push_enabled: userData?.push_enabled || false,
        save_audio_enabled: userData?.save_audio_enabled || false,
        monthly_minutes_used: userData?.monthly_minutes_used || 0,
        bonus_minutes: userData?.bonus_minutes || 0,
    });
});
