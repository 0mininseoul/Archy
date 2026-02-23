import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { UserConnectionStatus } from "@/lib/types/database";

function isMissingNotionIconColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return message.includes("notion_save_target_icon_") && message.includes("does not exist");
}

// GET /api/user/data - Get user connection status
export const GET = withAuth<UserConnectionStatus>(async ({ user, supabase }) => {
  const { data: userData, error } = await supabase
    .from("users")
    .select("notion_access_token, slack_access_token, google_access_token")
    .eq("id", user.id)
    .single();

  if (error) {
    return errorResponse("Failed to fetch user data", 500);
  }

  return successResponse({
    notionConnected: !!userData?.notion_access_token,
    slackConnected: !!userData?.slack_access_token,
    googleConnected: !!userData?.google_access_token,
  });
});

// DELETE /api/user/data - Delete all user data
export const DELETE = withAuth<{ deleted: boolean }>(async ({ user, supabase }) => {
  // Delete all recordings (cascade will handle this, but explicit is better)
  // Note: Audio files are NOT stored, so no need to delete from storage
  await supabase.from("recordings").delete().eq("user_id", user.id);

  // Delete all custom formats
  await supabase.from("custom_formats").delete().eq("user_id", user.id);

  // Reset user data
  const basePayload = {
    notion_access_token: null,
    notion_database_id: null,
    notion_save_target_type: null,
    notion_save_target_title: null,
    slack_access_token: null,
    slack_channel_id: null,
    google_access_token: null,
    google_refresh_token: null,
    google_token_expires_at: null,
    google_folder_id: null,
    google_folder_name: null,
    monthly_minutes_used: 0,
  };
  const payloadWithIcon = {
    ...basePayload,
    notion_save_target_icon_emoji: null,
    notion_save_target_icon_url: null,
  };

  let { error } = await supabase.from("users").update(payloadWithIcon).eq("id", user.id);
  if (error && isMissingNotionIconColumnError(error)) {
    const fallback = await supabase.from("users").update(basePayload).eq("id", user.id);
    error = fallback.error;
  }

  if (error) {
    return errorResponse("Failed to delete user data", 500);
  }

  return successResponse({ deleted: true });
});
