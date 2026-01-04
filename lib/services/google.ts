/**
 * Google Docs/Drive 서비스
 * - Google Docs에 문서 생성
 * - Google Drive 폴더 목록 조회
 */

interface GoogleTokens {
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
}

/**
 * 액세스 토큰 갱신 (만료된 경우)
 */
export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google token");
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * 유효한 액세스 토큰 가져오기
 */
export async function getValidAccessToken(tokens: GoogleTokens): Promise<string> {
  // 토큰 만료 확인
  if (tokens.token_expires_at) {
    const expiresAt = new Date(tokens.token_expires_at);
    const now = new Date();

    // 5분 전에 미리 갱신
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (tokens.refresh_token) {
        return await refreshGoogleToken(tokens.refresh_token);
      }
    }
  }

  return tokens.access_token;
}

/**
 * Google Drive 폴더 목록 조회
 */
export async function getGoogleDriveFolders(accessToken: string): Promise<Array<{
  id: string;
  name: string;
}>> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name)",
      orderBy: "name",
      pageSize: "100",
    }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("[Google] Failed to get folders:", error);
    throw new Error("Failed to get Google Drive folders");
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Google Docs 문서 생성
 */
export async function createGoogleDoc(
  accessToken: string,
  title: string,
  content: string,
  folderId?: string
): Promise<string> {
  console.log("[Google] Creating Google Doc:", title);

  // 1. 빈 문서 생성
  const createResponse = await fetch(
    "https://docs.googleapis.com/v1/documents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error("[Google] Failed to create doc:", error);
    throw new Error("Failed to create Google Doc");
  }

  const doc = await createResponse.json();
  const documentId = doc.documentId;
  console.log("[Google] Created doc:", documentId);

  // 2. 문서에 내용 추가
  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      }),
    }
  );

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    console.error("[Google] Failed to update doc:", error);
    // 문서는 생성됐으므로 URL 반환
  }

  // 3. 폴더로 이동 (지정된 경우)
  if (folderId) {
    try {
      // 먼저 현재 부모 폴더 조회
      const fileResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${documentId}?fields=parents`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (fileResponse.ok) {
        const fileData = await fileResponse.json();
        const previousParents = fileData.parents?.join(",") || "";

        // 폴더 이동
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${documentId}?` +
          new URLSearchParams({
            addParents: folderId,
            removeParents: previousParents,
          }),
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        console.log("[Google] Moved doc to folder:", folderId);
      }
    } catch (moveError) {
      console.error("[Google] Failed to move doc to folder:", moveError);
      // 이동 실패해도 문서 URL은 반환
    }
  }

  const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log("[Google] Doc URL:", docUrl);

  return docUrl;
}

/**
 * Markdown을 Google Docs 형식의 텍스트로 변환
 * (간단한 변환 - 마크다운 기호 제거)
 */
export function convertMarkdownToPlainText(markdown: string): string {
  return markdown
    // 헤더 기호 제거
    .replace(/^#{1,6}\s+/gm, "")
    // 볼드/이탤릭 기호 제거
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // 링크를 텍스트로 변환
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // 코드 블록 기호 제거
    .replace(/```[^\n]*\n/g, "")
    .replace(/```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // 인용 기호 제거
    .replace(/^>\s+/gm, "")
    // 리스트 기호 정리
    .replace(/^[-*+]\s+/gm, "• ")
    // 수평선 제거
    .replace(/^---+$/gm, "")
    // 테이블 구분선 제거 (간단한 처리)
    .replace(/^\|[-:|\s]+\|$/gm, "")
    // 연속 빈 줄 정리
    .replace(/\n{3,}/g, "\n\n");
}
