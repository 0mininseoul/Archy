import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PATCH - 푸시 알림 on/off 토글
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { enabled } = await request.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid enabled value" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("users")
      .update({ push_enabled: enabled })
      .eq("id", user.id);

    if (error) {
      console.error("Failed to update push enabled:", error);
      return NextResponse.json(
        { error: "Failed to update setting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    console.error("Push enabled update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
