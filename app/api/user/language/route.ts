import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PUT /api/user/language - Update user's language preference
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { language } = await request.json();

    if (!language || !["ko", "en"].includes(language)) {
      return NextResponse.json(
        { error: "Invalid language. Must be 'ko' or 'en'" },
        { status: 400 }
      );
    }

    // Update user's language preference
    const { error } = await supabase
      .from("users")
      .update({ language })
      .eq("id", user.id);

    if (error) {
      console.error("Error updating language:", error);
      return NextResponse.json(
        { error: "Failed to update language preference" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, language });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/user/language - Get user's language preference
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ language: "ko" }); // Default for non-authenticated
    }

    const { data: userData } = await supabase
      .from("users")
      .select("language")
      .eq("id", user.id)
      .single();

    return NextResponse.json({ language: userData?.language || "ko" });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ language: "ko" });
  }
}
