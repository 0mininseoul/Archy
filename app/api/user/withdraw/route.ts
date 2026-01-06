import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// DELETE - 회원 탈퇴 (모든 데이터 삭제)
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. 모든 녹음 삭제
    const { error: recordingsError } = await supabase
      .from("recordings")
      .delete()
      .eq("user_id", user.id);

    if (recordingsError) {
      console.error("Failed to delete recordings:", recordingsError);
    }

    // 2. 모든 커스텀 포맷 삭제
    const { error: formatsError } = await supabase
      .from("custom_formats")
      .delete()
      .eq("user_id", user.id);

    if (formatsError) {
      console.error("Failed to delete custom formats:", formatsError);
    }

    // 3. 유저 데이터 삭제
    const { error: userError } = await supabase
      .from("users")
      .delete()
      .eq("id", user.id);

    if (userError) {
      console.error("Failed to delete user:", userError);
      return NextResponse.json(
        { error: "Failed to delete user data" },
        { status: 500 }
      );
    }

    // 4. Supabase Auth에서 로그아웃
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Withdraw error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
