import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { sendPushNotification } from "@/lib/services/push";
import {
  mapPauseReasonToTerminationReason,
  PauseNotifyReason,
} from "@/lib/recording-lifecycle";

interface PauseNotifyRequest {
  sessionId: string;
  duration: number;
  reason?: PauseNotifyReason;
}

// POST /api/recordings/pause-notify - 녹음 일시정지 푸시알림 발송
export const POST = withAuth(async ({ user, supabase, request }) => {
  const body: PauseNotifyRequest = await request!.json();
  const { sessionId, duration } = body;
  const reasonCandidates: PauseNotifyReason[] = [
    "visibility_hidden",
    "route_unmount",
    "manual_pause",
  ];
  const reason = reasonCandidates.includes(body.reason as PauseNotifyReason)
    ? (body.reason as PauseNotifyReason)
    : "visibility_hidden";
  const path = new URL(request!.url).pathname;

  if (!sessionId) {
    return errorResponse("Session ID is required", 400);
  }

  const nowIso = new Date().toISOString();
  const terminationReason = mapPauseReasonToTerminationReason(reason);

  // 세션 상태 업데이트는 푸시 구독 여부와 무관하게 항상 수행
  const { error: pauseUpdateError } = await supabase
    .from("recordings")
    .update({
      session_paused_at: nowIso,
      duration_seconds: duration,
      last_activity_at: nowIso,
      termination_reason: terminationReason,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "recording");

  if (pauseUpdateError) {
    console.error("[PauseNotify] Failed to update paused session:", pauseUpdateError);
    return errorResponse("Failed to update session state", 500);
  }

  console.log("[RecorderLifecycle]", {
    event: "autopaused",
    userId: user.id,
    sessionId,
    durationSeconds: duration,
    reason,
    path,
  });

  // 사용자의 푸시 구독 정보 조회
  const { data: userData } = await supabase
    .from("users")
    .select("push_subscription, push_enabled")
    .eq("id", user.id)
    .single();

  if (!userData?.push_enabled || !userData?.push_subscription) {
    console.log("[PauseNotify] Push not enabled for user:", user.id);
    return successResponse({ sent: false, reason: "push_not_enabled" });
  }

  // 언어별 메시지
  const acceptLanguage = request?.headers.get("accept-language") || "";
  const isKorean = acceptLanguage.toLowerCase().includes("ko");
  const title = isKorean
    ? "🎙️ 녹음이 일시정지되었습니다"
    : "🎙️ Recording paused";
  const messageBody = isKorean
    ? "탭하여 이어서 녹음하세요"
    : "Tap to continue recording";

  try {
    const sent = await sendPushNotification(userData.push_subscription, {
      title,
      body: messageBody,
      url: `/dashboard?resumeSession=${sessionId}`,
      recordingId: sessionId,
    });

    console.log(`[PauseNotify] Push notification sent: ${sent}, session: ${sessionId}`);

    return successResponse({ sent });
  } catch (error) {
    console.error("[PauseNotify] Failed to send push:", error);
    return successResponse({ sent: false, reason: "send_failed" });
  }
});
