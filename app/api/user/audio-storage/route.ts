import { withAuth, successResponse, errorResponse } from "@/lib/api";

// GET /api/user/audio-storage - Get audio storage setting
export const GET = withAuth<{ enabled: boolean }>(async ({ user, supabase }) => {
  const { data: userData, error } = await supabase
    .from("users")
    .select("save_audio_enabled")
    .eq("id", user.id)
    .single();

  if (error) {
    return errorResponse("Failed to fetch setting", 500);
  }

  return successResponse({ enabled: userData?.save_audio_enabled ?? false });
});

// PATCH /api/user/audio-storage - Toggle audio storage setting
export const PATCH = withAuth<{ enabled: boolean }>(async ({ user, supabase, request }) => {
  const { enabled } = await request!.json();

  if (typeof enabled !== "boolean") {
    return errorResponse("Invalid enabled value", 400);
  }

  const { error } = await supabase
    .from("users")
    .update({ save_audio_enabled: enabled })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update setting", 500);
  }

  return successResponse({ enabled });
});
