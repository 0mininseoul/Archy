import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, RecordingListItem, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
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

    // Check if audio storage is enabled
    const saveAudioEnabled = userData.save_audio_enabled ?? false;

    // Generate title
    const title = `Archy - ${formatKSTDate()}`;

    // Create recording record
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        title,
        audio_file_path: null, // Will be updated if audio is stored
        duration_seconds: duration,
        format,
        status: "processing",
      })
      .select()
      .single();

    if (recordingError) {
      return errorResponse("Failed to create recording", 500);
    }

    // Upload audio to storage if enabled
    if (saveAudioEnabled) {
      try {
        const extension = audioFile.name.split('.').pop() || 'webm';
        const audioFilePath = `${user.id}/${recording.id}/audio.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(audioFilePath, audioFile, {
            contentType: audioFile.type,
            upsert: false,
          });

        if (!uploadError) {
          await supabase
            .from("recordings")
            .update({ audio_file_path: audioFilePath })
            .eq("id", recording.id);
        } else {
          console.error("[Audio Storage] Upload failed:", uploadError);
        }
      } catch (err) {
        console.error("[Audio Storage] Error:", err);
        // Continue processing - audio storage failure shouldn't fail the recording
      }
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

// Fields needed for the recording list (exclude formatted_content which is large)
const RECORDING_LIST_FIELDS = `
  id,
  title,
  status,
  processing_step,
  created_at,
  duration_seconds,
  is_pinned,
  error_step,
  error_message,
  notion_page_url,
  google_doc_url,
  format,
  transcript
`;

const PAGE_SIZE = 20;

// GET /api/recordings - List recordings with pagination
export const GET = withAuth<{
  recordings: RecordingListItem[];
  hasMore: boolean;
  nextOffset: number | null;
}>(async ({ user, supabase, request }) => {
  const url = new URL(request!.url);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const limit = parseInt(url.searchParams.get("limit") || String(PAGE_SIZE));

  // Fetch one extra to check if there are more
  const { data: recordings, error } = await supabase
    .from("recordings")
    .select(RECORDING_LIST_FIELDS)
    .eq("user_id", user.id)
    .neq("is_hidden", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    return errorResponse(error.message, 500);
  }

  const fetchedRecordings = recordings ?? [];
  const hasMore = fetchedRecordings.length > limit;
  const returnRecordings = hasMore ? fetchedRecordings.slice(0, limit) : fetchedRecordings;

  return successResponse({
    recordings: returnRecordings,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  });
});
