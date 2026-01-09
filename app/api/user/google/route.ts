import { withAuth, successResponse, errorResponse } from "@/lib/api";

// PUT /api/user/google - Update Google folder settings
export const PUT = withAuth<{ updated: boolean }>(async ({ user, supabase, request }) => {
  const { folderId, folderName } = await request!.json();

  const { error } = await supabase
    .from("users")
    .update({
      google_folder_id: folderId,
      google_folder_name: folderName,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update Google folder", 500);
  }

  return successResponse({ updated: true });
});

// DELETE /api/user/google - Disconnect Google
export const DELETE = withAuth<{ disconnected: boolean }>(async ({ user, supabase }) => {
  const { error } = await supabase
    .from("users")
    .update({
      google_access_token: null,
      google_refresh_token: null,
      google_token_expires_at: null,
      google_folder_id: null,
      google_folder_name: null,
    })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to disconnect Google", 500);
  }

  return successResponse({ disconnected: true });
});
