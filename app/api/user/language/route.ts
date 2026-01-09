import { withAuth, successResponse, errorResponse, withErrorHandling } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Language = "ko" | "en";

// PUT /api/user/language - Update user's language preference
export const PUT = withAuth<{ language: Language }>(async ({ user, supabase, request }) => {
  const { language } = await request!.json();

  if (!language || !["ko", "en"].includes(language)) {
    return errorResponse("Invalid language. Must be 'ko' or 'en'", 400);
  }

  const { error } = await supabase
    .from("users")
    .update({ language })
    .eq("id", user.id);

  if (error) {
    return errorResponse("Failed to update language preference", 500);
  }

  return successResponse({ language: language as Language });
});

// GET /api/user/language - Get user's language preference (no auth required for default)
export const GET = withErrorHandling<{ language: Language }>(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: true, data: { language: "ko" as Language } });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("language")
    .eq("id", user.id)
    .single();

  return successResponse({ language: (userData?.language || "ko") as Language });
});
