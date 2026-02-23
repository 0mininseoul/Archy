import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { NotionSaveTarget } from "@/lib/types/database";

function sanitizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isMissingNotionIconColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return message.includes("notion_save_target_icon_") && message.includes("does not exist");
}

// PUT /api/user/notion-database - Update user's Notion save target (database or page)
export const PUT = withAuth<{ saveTarget: NotionSaveTarget }>(async ({ user, supabase, request }) => {
  const body = await request!.json();
  const { databaseId, pageId, saveTargetType, title, iconEmoji, iconUrl } = body;

  // At least one of databaseId or pageId must be provided
  const targetId = databaseId || pageId;
  if (!targetId) {
    return errorResponse("Database ID or Page ID is required", 400);
  }

  const targetType = saveTargetType || (databaseId ? "database" : "page");
  const targetTitle = title || "Untitled";
  const targetIconEmoji = sanitizeOptionalString(iconEmoji, 32);
  const targetIconUrl = sanitizeOptionalString(iconUrl, 2048);

  const basePayload = {
    notion_database_id: targetId,
    notion_save_target_type: targetType,
    notion_save_target_title: targetTitle,
  };
  const payloadWithIcon = {
    ...basePayload,
    notion_save_target_icon_emoji: targetIconEmoji,
    notion_save_target_icon_url: targetIconUrl,
  };

  let { error } = await supabase.from("users").update(payloadWithIcon).eq("id", user.id);
  if (error && isMissingNotionIconColumnError(error)) {
    const fallback = await supabase.from("users").update(basePayload).eq("id", user.id);
    error = fallback.error;
  }

  if (error) {
    return errorResponse("Failed to update save target", 500);
  }

  return successResponse({
    saveTarget: {
      type: targetType,
      id: targetId,
      title: targetTitle,
      iconEmoji: targetIconEmoji,
      iconUrl: targetIconUrl,
    },
  });
});

// DELETE /api/user/notion-database - Disconnect Notion
export const DELETE = withAuth<{ disconnected: boolean }>(async ({ user, supabase }) => {
  const basePayload = {
    notion_access_token: null,
    notion_database_id: null,
    notion_save_target_type: null,
    notion_save_target_title: null,
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
    return errorResponse("Failed to disconnect Notion", 500);
  }

  return successResponse({ disconnected: true });
});
