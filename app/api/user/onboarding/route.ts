import { withAuth, successResponse, errorResponse } from "@/lib/api";

// POST /api/user/onboarding - Mark user as onboarded
export const POST = withAuth<{ onboarded: boolean }>(async ({ user, supabase }) => {
  const { error } = await supabase
    .from("users")
    .update({ is_onboarded: true })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update onboarding status", 500);
  }

  return successResponse({ onboarded: true });
});
