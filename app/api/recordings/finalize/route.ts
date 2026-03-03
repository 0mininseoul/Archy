import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { Recording, User, MONTHLY_MINUTES_LIMIT } from "@/lib/types/database";
import { processFromTranscripts, handleProcessingError } from "@/lib/services/recording-processor";
import { formatKSTDate } from "@/lib/utils";
import { hasUnlimitedUsage } from "@/lib/promo";

interface ChunkTranscript {
  chunkIndex: number;
  transcript: string;
}

type FinalizeSessionStatus = Extract<
  Recording["status"],
  "recording" | "processing" | "completed" | "failed"
>;

interface FinalizeRequest {
  sessionId?: string; // 새로운 세션 기반 방식
  transcripts?: ChunkTranscript[]; // 레거시 지원
  totalDurationSeconds: number;
  format?: string; // optional - 서버에서 사용자 기본 포맷 조회
}

interface FinalizeResponse {
  recording: Pick<Recording, "id" | "title" | "status">;
  idempotent: boolean;
  statusBefore?: FinalizeSessionStatus;
}

// POST /api/recordings/finalize - 청크 전사 결과 병합 및 최종 처리
export const POST = withAuth<FinalizeResponse>(
  async ({ user, supabase, request }) => {
    const body: FinalizeRequest = await request!.json();
    const { sessionId, transcripts, totalDurationSeconds, format } = body;

    if (!totalDurationSeconds || totalDurationSeconds <= 0) {
      return errorResponse("Valid totalDurationSeconds is required", 400);
    }

    // Get user data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return errorResponse("User not found", 404);
    }

    const durationMinutes = Math.ceil(totalDurationSeconds / 60);

    let recordingId: string;
    let title: string;
    let mergedTranscript: string;
    let shouldRunProcessing = false;
    let shouldConsumeUsage = false;
    let statusBefore: FinalizeSessionStatus | undefined;

    // 세션 기반 방식 (새로운 방식)
    if (sessionId) {
      // 기존 세션 조회 (idempotency 판단용)
      const { data: session, error: sessionError } = await supabase
        .from("recordings")
        .select("id, title, status, transcript, last_chunk_index")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (sessionError) {
        console.error("[Finalize] Failed to load session:", sessionError);
        return errorResponse("Failed to load session", 500);
      }

      if (!session) {
        return errorResponse("Session not found", 404);
      }

      statusBefore = session.status as FinalizeSessionStatus;

      if (statusBefore === "failed") {
        console.warn(`[Finalize] Rejecting finalize for failed session ${sessionId}`);
        return errorResponse("Session already failed", 409);
      }

      if (statusBefore === "processing" || statusBefore === "completed") {
        console.log(
          `[Finalize] Idempotent finalize skip for session ${sessionId}, status=${statusBefore}`
        );
        return successResponse({
          recording: {
            id: session.id,
            title: session.title,
            status: session.status,
          },
          idempotent: true,
          statusBefore,
        });
      }

      // Check usage limit (멱등 skip 경로는 제외)
      if (!hasUnlimitedUsage(userData)) {
        const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);
        if (userData.monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
          return errorResponse("Monthly usage limit exceeded", 403);
        }
      }

      recordingId = session.id;
      title = session.title;
      mergedTranscript = session.transcript || "";

      console.log(
        `[Finalize] Finalizing session ${sessionId}, duration: ${totalDurationSeconds}s`
      );
      console.log(`[Finalize] Initial transcript length: ${mergedTranscript.length}, last_chunk_index: ${session.last_chunk_index}`);

      // 🔧 Race condition 방지: 마지막 청크 전사가 완료될 때까지 대기
      // finalize가 chunk API보다 먼저 호출되면 마지막 청크가 아직 전사 중일 수 있음
      // transcript 길이가 안정화될 때까지 (변화가 없을 때까지) polling
      const maxWaitMs = 15000; // 최대 15초 대기
      const pollIntervalMs = 1000; // 1초마다 체크
      let waitedMs = 0;
      let lastTranscriptLength = mergedTranscript.length;
      let stableCount = 0;
      const requiredStableCount = 2; // 2초 동안 변화 없으면 완료로 간주

      console.log(`[Finalize] Waiting for transcript to stabilize...`);

      while (waitedMs < maxWaitMs && stableCount < requiredStableCount) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        waitedMs += pollIntervalMs;

        const { data: refreshedSession } = await supabase
          .from("recordings")
          .select("transcript")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .single();

        const currentTranscript = refreshedSession?.transcript || "";
        const currentLength = currentTranscript.length;

        if (currentLength > lastTranscriptLength) {
          // 새로운 전사가 추가됨, 계속 대기
          console.log(`[Finalize] Transcript grew: ${lastTranscriptLength} -> ${currentLength}`);
          mergedTranscript = currentTranscript;
          lastTranscriptLength = currentLength;
          stableCount = 0;
        } else {
          // 길이가 같음, stable count 증가
          stableCount++;
          if (currentLength > 0 && currentLength > mergedTranscript.length) {
            mergedTranscript = currentTranscript;
          }
        }
      }

      if (stableCount >= requiredStableCount) {
        console.log(`[Finalize] Transcript stabilized after ${waitedMs}ms, length: ${mergedTranscript.length}`);
      } else {
        console.warn(`[Finalize] Transcript wait timed out after ${maxWaitMs}ms, proceeding with length: ${mergedTranscript.length}`);
      }

      console.log(`[Finalize] Final transcript length: ${mergedTranscript.length}`);

      // 원자적 상태 전이로 처리권 선점 (recording -> processing)
      const { data: claimedSession, error: claimError } = await supabase
        .from("recordings")
        .update({
          status: "processing",
          processing_step: "transcription",
          duration_seconds: totalDurationSeconds,
          session_paused_at: null,
        })
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .eq("status", "recording")
        .select("id, title, status")
        .maybeSingle();

      if (claimError) {
        console.error("[Finalize] Failed to claim session:", claimError);
        return errorResponse("Failed to finalize session", 500);
      }

      if (!claimedSession) {
        // 다른 요청이 먼저 상태를 전환한 경우 -> 상태 재조회 후 idempotent 처리
        const { data: latestSession, error: latestError } = await supabase
          .from("recordings")
          .select("id, title, status")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (latestError) {
          console.error("[Finalize] Failed to load latest session:", latestError);
          return errorResponse("Failed to load session state", 500);
        }

        if (!latestSession) {
          return errorResponse("Session not found", 404);
        }

        const latestStatus = latestSession.status as FinalizeSessionStatus;
        if (latestStatus === "processing" || latestStatus === "completed") {
          console.log(
            `[Finalize] Idempotent finalize skip after claim miss for session ${sessionId}, status=${latestStatus}`
          );
          return successResponse({
            recording: {
              id: latestSession.id,
              title: latestSession.title,
              status: latestSession.status,
            },
            idempotent: true,
            statusBefore: latestStatus,
          });
        }

        if (latestStatus === "failed") {
          return errorResponse("Session already failed", 409);
        }

        return errorResponse("Session is not active", 400);
      }

      shouldRunProcessing = true;
      shouldConsumeUsage = true;
    }
    // 레거시 방식 (transcripts 배열 전달)
    else if (transcripts && Array.isArray(transcripts) && transcripts.length > 0) {
      // 레거시 방식에서도 usage limit 검사 유지
      if (!hasUnlimitedUsage(userData)) {
        const totalMinutesAvailable = MONTHLY_MINUTES_LIMIT + (userData.bonus_minutes || 0);
        if (userData.monthly_minutes_used + durationMinutes > totalMinutesAvailable) {
          return errorResponse("Monthly usage limit exceeded", 403);
        }
      }

      // Sort and merge transcripts
      const sortedTranscripts = [...transcripts].sort((a, b) => a.chunkIndex - b.chunkIndex);
      mergedTranscript = sortedTranscripts.map((t) => t.transcript).join("\n\n");

      console.log(
        `[Finalize] Merging ${transcripts.length} chunks, total duration: ${totalDurationSeconds}s`
      );
      console.log(`[Finalize] Merged transcript length: ${mergedTranscript.length}`);

      // Generate title
      title = `Archy - ${formatKSTDate()}`;

      // Create recording record
      const { data: recording, error: recordingError } = await supabase
        .from("recordings")
        .insert({
          user_id: user.id,
          title,
          audio_file_path: null,
          duration_seconds: totalDurationSeconds,
          format: format || "smart",
          status: "processing",
          transcript: mergedTranscript,
        })
        .select()
        .single();

      if (recordingError) {
        console.error("[Finalize] Failed to create recording:", recordingError);
        return errorResponse("Failed to create recording", 500);
      }

      recordingId = recording.id;
      shouldRunProcessing = true;
      shouldConsumeUsage = true;
    } else {
      return errorResponse("Either sessionId or transcripts array is required", 400);
    }

    if (shouldConsumeUsage) {
      // Update usage (idempotent skip 경로에서는 실행하지 않음)
      await supabase
        .from("users")
        .update({
          monthly_minutes_used: userData.monthly_minutes_used + durationMinutes,
        })
        .eq("id", user.id);
    }

    if (!shouldRunProcessing) {
      return errorResponse("Failed to claim processing ownership", 500);
    }

    // Process synchronously (Vercel serverless terminates after response, so we must await)
    const result = await processFromTranscripts({
      recordingId,
      transcript: mergedTranscript,
      format: (format || "smart") as Recording["format"],
      duration: totalDurationSeconds,
      userData: userData as User,
      title,
    }).catch(async (error) => {
      await handleProcessingError(recordingId, error);
      return null;
    });

    return successResponse({
      recording: {
        id: recordingId,
        title: result?.title || title,
        status: result?.success ? "completed" : "failed",
      },
      idempotent: false,
      statusBefore,
    });
  }
);
