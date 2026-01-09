import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { getValidAccessToken, getGoogleDriveFolders } from "@/lib/services/google";
import { GoogleFolder } from "@/lib/types/database";

// GET /api/google/folders - Get Google Drive folders
export const GET = withAuth<{ folders: GoogleFolder[] }>(async ({ user, supabase }) => {
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("google_access_token, google_refresh_token, google_token_expires_at")
    .eq("id", user.id)
    .single();

  if (userError || !userData?.google_access_token) {
    return errorResponse("Google not connected", 400);
  }

  // Get valid access token (refresh if needed)
  const accessToken = await getValidAccessToken({
    access_token: userData.google_access_token,
    refresh_token: userData.google_refresh_token,
    token_expires_at: userData.google_token_expires_at,
  });

  // If token was refreshed, update it in the database
  if (accessToken !== userData.google_access_token) {
    await supabase
      .from("users")
      .update({ google_access_token: accessToken })
      .eq("id", user.id);
  }

  const folders = await getGoogleDriveFolders(accessToken);

  return successResponse({ folders });
});
