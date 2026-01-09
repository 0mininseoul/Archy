import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import { processRecording, handleProcessingError } from "@/lib/services/recording-processor";
import { formatKSTDate } from "@/lib/utils";

// POST /api/recordings - Upload and process recording
export const POST = withAuth<{ recording: Pick<Recording, "id" | "title" | "status"> }>(
  async ({ user, supabase, request }) => {
    // Get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    // Parse form data
    const formData = await request!.formData();
    const audioFile = formData.get("audio") as File;
    const duration = parseInt(formData.get("duration") as string);
    const format = (formData.get("format") as string) || "meeting";

    if (!audioFile) {
      return errorResponse("Audio file is required", 400);
    }

    // Check usage limit
    const durationMinutes = Math.ceil(duration / 60);
    const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);

    if (userData.monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
      return errorResponse("Monthly usage limit exceeded", 403);
    }

    // Generate title
    const title = `Flownote - ${formatKSTDate()}`;

    // Create recording record
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null, // Audio files are not stored
        duration_seconds: duration,
        format,
        status: "processing",
      })
      .select()
      .single();

    if (recordingError) {
      return errorResponse("Failed to create recording", 500);
    }

    // Process in background (in production, use a queue like BullMQ or Inngest)
    processRecording({
      recordingId: recording.id,
      audioFile,
      format: format as Recording["format"],
      duration,
      userData: userData as User,
      title,
    }).catch((error) => handleProcessingError(recording.id, error));

    // Update usage
    await supabase
      .from("users")
      .update({
        monthly_minutes_used: userData.monthly_minutes_used + durationMinutes,
      })
      .eq("id", user.id);

    return successResponse({
      recording: {
        id: recording.id,
        title: recording.title,
        status: recording.status,
      },
    });
  }
);

// GET /api/recordings - List recordings
export const GET = withAuth<{ recordings: Recording[] }>(async ({ user, supabase }) => {
  const { data: recordings, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("user_id", user.id)
    .neq("is_hidden", true)
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ recordings: recordings ?? [] });
});
