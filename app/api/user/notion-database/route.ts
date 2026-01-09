import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { NotionSaveTarget } from "@/lib/types/database";

// PUT /api/user/notion-database - Update user's Notion save target (database or page)
export const PUT = withAuth<{ saveTarget: NotionSaveTarget }>(async ({ user, supabase, request }) => {
  const body = await request!.json();
  const { databaseId, pageId, saveTargetType, title } = body;

  // At least one of databaseId or pageId must be provided
  const targetId = databaseId || pageId;
  if (!targetId) {
    return errorResponse("Database ID or Page ID is required", 400);
  }

  const targetType = saveTargetType || (databaseId ? "database" : "page");
  const targetTitle = title || "Untitled";

  const { error } = await supabase
    .from("users")
    .update({
      notion_database_id: targetId,
      notion_save_target_type: targetType,
      notion_save_target_title: targetTitle,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update save target", 500);
  }

  return successResponse({
    saveTarget: {
      type: targetType,
      id: targetId,
      title: targetTitle,
    },
  });
});

// DELETE /api/user/notion-database - Disconnect Notion
export const DELETE = withAuth<{ disconnected: boolean }>(async ({ user, supabase }) => {
  const { error } = await supabase
    .from("users")
    .update({
      notion_access_token: null,
      notion_database_id: null,
      notion_save_target_type: null,
      notion_save_target_title: null,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to disconnect Notion", 500);
  }

  return successResponse({ disconnected: true });
});
