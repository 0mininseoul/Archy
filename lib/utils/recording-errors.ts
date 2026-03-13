export function getUserFriendlyProcessingErrorMessage(
  errorStep?: string | null,
  errorMessage?: string | null,
  locale: string = "ko"
): string {
  const isKo = locale === "ko";

  if (
    errorMessage?.includes("Notion에 저장할 페이지나 데이터베이스를 찾지 못했습니다") ||
    errorMessage?.includes("저장 위치가 지정되지 않았습니다")
  ) {
    return errorMessage;
  }

  if (errorStep === "notion") {
    if (
      errorMessage?.includes("body failed validation") ||
      errorMessage?.includes("children should be not present")
    ) {
      return isKo
        ? "노션이 문서 구조를 받아들이지 못했습니다. 저장 형식을 조정해 다시 시도해주세요."
        : "Notion rejected the document structure. Please try again with a simpler save format.";
    }

    if (
      errorMessage?.includes("Failed to fetch databases") ||
      errorMessage?.includes("Failed to fetch pages") ||
      errorMessage?.includes("No accessible pages found in workspace")
    ) {
      return isKo
        ? "노션에서 저장 가능한 페이지나 데이터베이스를 찾지 못했습니다. 저장 위치를 다시 선택해주세요."
        : "No accessible Notion pages or databases were found. Please select a save target again.";
    }

    if (
      errorMessage?.includes("Unauthorized") ||
      errorMessage?.includes("token") ||
      errorMessage?.includes("not connected")
    ) {
      return isKo
        ? "노션 연결 또는 권한에 문제가 있습니다. 설정을 확인해주세요."
        : "There is a problem with your Notion connection or permissions. Please check your settings.";
    }
  }

  switch (errorStep) {
    case "transcription":
      return isKo
        ? "음성 변환 중 오류가 발생했습니다. 다시 녹음해주세요."
        : "Transcription failed. Please record again.";
    case "formatting":
      return isKo
        ? "문서 정리 중 오류가 발생했습니다."
        : "Formatting failed while organizing your note.";
    case "notion":
      return isKo
        ? "노션 저장 중 오류가 발생했습니다."
        : "Notion save failed.";
    case "google":
      return isKo
        ? "Google Docs 저장 중 오류가 발생했습니다. 설정을 확인해주세요."
        : "Google Docs save failed. Please check your settings.";
    case "slack":
      return isKo ? "슬랙 알림 전송 중 오류가 발생했습니다." : "Slack notification failed.";
    case "upload":
      return isKo
        ? "녹음 파일 처리 중 오류가 발생했습니다. 다시 녹음해주세요."
        : "Audio processing failed. Please record again.";
    case "abandoned":
      return isKo
        ? "녹음이 중단돼 저장되지 않았어요. 다시 녹음하거나 왼쪽 스와이프로 삭제해 주세요."
        : "Recording stopped before save. Record again or swipe left to delete.";
    default:
      return isKo ? "처리 중 오류가 발생했습니다." : "An error occurred while processing.";
  }
}
