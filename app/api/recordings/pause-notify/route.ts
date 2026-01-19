import { withAuth, successResponse, errorResponse } from "@/lib/api";
import { sendPushNotification } from "@/lib/services/push";

interface PauseNotifyRequest {
  sessionId: string;
  duration: number;
}

// POST /api/recordings/pause-notify - 녹음 일시정지 푸시알림 발송
export const POST = withAuth(async ({ user, supabase, request }) => {
  const body: PauseNotifyRequest = await request!.json();
  const { sessionId, duration } = body;

  if (!sessionId) {
    return errorResponse("Session ID is required", 400);
  }

  // 사용자의 푸시 구독 정보 조회
  const { data: userData } = await supabase
    .from("users")
    .select("push_subscription, push_enabled, language")
    .eq("id", user.id)
    .single();

  if (!userData?.push_enabled || !userData?.push_subscription) {
    console.log("[PauseNotify] Push not enabled for user:", user.id);
    return successResponse({ sent: false, reason: "push_not_enabled" });
  }

  // 세션 상태 업데이트
  await supabase
    .from("recordings")
    .update({
      session_paused_at: new Date().toISOString(),
      duration_seconds: duration,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  // 언어별 메시지
  const isKorean = userData.language === "ko";
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
