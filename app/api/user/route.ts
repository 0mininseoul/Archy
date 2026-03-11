import { withAuth, successResponse } from "@/lib/api";
import { getProStatus } from "@/lib/promo";
import { loadUserWithUsageReset } from "@/lib/usage-cycle";
import { User } from "@/lib/types/database";

export const runtime = "edge";

function isMissingNotionIconColumnError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
    return message.includes("notion_save_target_icon_") && message.includes("does not exist");
}

type UserRouteData = Pick<
    User,
    | "created_at"
    | "last_reset_at"
    | "monthly_minutes_used"
    | "bonus_minutes"
    | "promo_expires_at"
    | "push_enabled"
    | "save_audio_enabled"
    | "notion_access_token"
    | "notion_database_id"
    | "notion_save_target_type"
    | "notion_save_target_title"
    | "notion_save_target_icon_emoji"
    | "notion_save_target_icon_url"
    | "slack_access_token"
    | "google_access_token"
    | "google_folder_id"
    | "google_folder_name"
>;

// GET /api/user - Get comprehensive user data for caching
export const GET = withAuth(async ({ user, supabase }) => {
    const selectWithIcon = `
      email,
      notion_access_token,
      notion_database_id,
      notion_save_target_type,
      notion_save_target_title,
      notion_save_target_icon_emoji,
      notion_save_target_icon_url,
      slack_access_token,
      google_access_token,
      google_folder_id,
      google_folder_name,
      push_enabled,
      save_audio_enabled,
      monthly_minutes_used,
      last_reset_at,
      bonus_minutes,
      promo_expires_at,
      created_at
    `;
    const selectWithoutIcon = `
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
      last_reset_at,
      bonus_minutes,
      promo_expires_at,
      created_at
    `;

    let { data: userData, error: userError, usageCycle } = await loadUserWithUsageReset<UserRouteData>(
        supabase,
        user.id,
        selectWithIcon
    );

    if (userError && isMissingNotionIconColumnError(userError)) {
        const fallback = await loadUserWithUsageReset<UserRouteData>(supabase, user.id, selectWithoutIcon);
        userData = fallback.data;
        userError = fallback.error;
        usageCycle = fallback.usageCycle;
    }

    const proStatus = getProStatus(userData || null);

    return successResponse({
        email: user.email,
        name: user.user_metadata?.name || user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        notion_access_token: userData?.notion_access_token || null,
        notion_database_id: userData?.notion_database_id || null,
        notion_save_target_type: userData?.notion_save_target_type || null,
        notion_save_target_title: userData?.notion_save_target_title || null,
        notion_save_target_icon_emoji: userData?.notion_save_target_icon_emoji || null,
        notion_save_target_icon_url: userData?.notion_save_target_icon_url || null,
        slack_access_token: userData?.slack_access_token || null,
        google_access_token: userData?.google_access_token || null,
        google_folder_id: userData?.google_folder_id || null,
        google_folder_name: userData?.google_folder_name || null,
        push_enabled: userData?.push_enabled || false,
        save_audio_enabled: userData?.save_audio_enabled || false,
        monthly_minutes_used: userData?.monthly_minutes_used || 0,
        bonus_minutes: userData?.bonus_minutes || 0,
        next_reset_at: usageCycle?.nextResetAtIso || null,
        is_pro: proStatus.isPro,
        pro_days_remaining: proStatus.daysRemaining,
    });
});
