import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// DELETE - 회원 탈퇴 (데이터 아카이브 후 삭제)
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse withdrawal reason from request body (optional)
    let withdrawalReason: string | null = null;
    try {
      const body = await request.json();
      withdrawalReason = body.reason || null;
    } catch {
      // No body or invalid JSON - proceed without reason
    }

    // 1. Fetch user data for archiving
    const { data: userData, error: userFetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userFetchError || !userData) {
      console.error("Failed to fetch user data:", userFetchError);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 }
      );
    }

    // 2. Fetch recordings count and total minutes
    const { data: recordings, error: recordingsFetchError } = await supabase
      .from("recordings")
      .select("duration_seconds")
      .eq("user_id", user.id);

    const totalRecordingsCount = recordings?.length || 0;
    const totalMinutesUsed = recordings
      ? Math.floor(recordings.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / 60)
      : 0;

    if (recordingsFetchError) {
      console.error("Failed to fetch recordings:", recordingsFetchError);
    }

    // 3. Check if user had custom formats
    const { data: customFormats, error: formatsFetchError } = await supabase
      .from("custom_formats")
      .select("id")
      .eq("user_id", user.id);

    const hadCustomFormats = (customFormats?.length || 0) > 0;

    if (formatsFetchError) {
      console.error("Failed to fetch custom formats:", formatsFetchError);
    }

    // 4. Calculate account age in days
    const accountCreatedAt = new Date(userData.created_at);
    const now = new Date();
    const accountAgeDays = Math.floor((now.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

    // 5. Count referred users (if referral system exists)
    const { count: referredUsersCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("referred_by", user.id);

    // 6. Archive user data to withdrawn_users table (using service role to bypass RLS)
    const supabaseAdmin = createServiceRoleClient();
    const { error: archiveError } = await supabaseAdmin
      .from("withdrawn_users")
      .insert({
        original_user_id: user.id,
        withdrawal_reason: withdrawalReason,
        total_recordings_count: totalRecordingsCount,
        total_minutes_used: totalMinutesUsed,
        account_created_at: userData.created_at,
        account_age_days: accountAgeDays,
        had_notion_integration: !!userData.notion_access_token,
        had_slack_integration: !!userData.slack_access_token,
        had_custom_formats: hadCustomFormats,
        language: userData.language || "ko",
        referred_users_count: referredUsersCount || 0,
        was_referred: !!userData.referred_by,
      });

    if (archiveError) {
      console.error("Failed to archive user data:", archiveError);
      return NextResponse.json(
        { error: "Failed to archive user data" },
        { status: 500 }
      );
    }

    // 7. Delete all recordings (CASCADE will handle this, but explicit for clarity)
    const { error: recordingsError } = await supabase
      .from("recordings")
      .delete()
      .eq("user_id", user.id);

    if (recordingsError) {
      console.error("Failed to delete recordings:", recordingsError);
    }

    // 8. Delete all custom formats
    const { error: formatsError } = await supabase
      .from("custom_formats")
      .delete()
      .eq("user_id", user.id);

    if (formatsError) {
      console.error("Failed to delete custom formats:", formatsError);
    }

    // 9. Delete user data from users table
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

    // 10. Return success (sign out will be handled by frontend)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Withdraw error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
