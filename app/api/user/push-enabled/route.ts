import { withAuth, successResponse, errorResponse } from "@/lib/api";

// PATCH /api/user/push-enabled - Toggle push notifications
export const PATCH = withAuth<{ enabled: boolean }>(async ({ user, supabase, request }) => {
  const { enabled } = await request!.json();

  if (typeof enabled !== "boolean") {
    return errorResponse("Invalid enabled value", 400);
  }

  const { error } = await supabase
    .from("users")
    .update({ push_enabled: enabled })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update setting", 500);
  }

  return successResponse({ enabled });
});
