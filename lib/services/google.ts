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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured on server");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

  // 2. 제목을 본문에 포함한 뒤 마크다운 파싱 및 배치 요청 생성
  const contentWithTitle = buildGoogleDocBody(title, content);
  const requests = parseMarkdownToRequests(contentWithTitle); // No starting index needed for empty doc (starts at 1)

  // 3. 배치 업데이트 실행
  if (requests.length > 0) {
    const updateResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      console.error("[Google] Failed to update doc:", error);
      // 문서는 생성됐으므로 URL 반환 (내용은 없을 수 있음)
    }
  }

  // 4. 폴더로 이동 (지정된 경우)
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
 * 마크다운을 Google Docs API 요청으로 변환
 */
function parseMarkdownToRequests(markdown: string): any[] {
  const insertRequests: any[] = [];
  const paragraphStyleRequests: any[] = [];
  const textStyleRequests: any[] = [];
  const bulletRequests: Array<{ startIndex: number; request: any }> = [];
  const orderedListCounters: number[] = [];
  let currentIndex = 1; // Google Docs starts at index 1

  const lines = markdown.split("\n");

  const getIndentInfo = (rawLine: string) => {
    const leadingWhitespace = rawLine.match(/^[\t ]*/)?.[0] || "";
    const indentWidth = leadingWhitespace.replace(/\t/g, "    ").length;
    return {
      indentLevel: indentWidth === 0 ? 0 : Math.max(1, Math.floor(indentWidth / 2)),
      trimmed: rawLine.trimStart(),
    };
  };

  for (const rawLine of lines) {
    const { indentLevel, trimmed } = getIndentInfo(rawLine);
    let textToInsert = trimmed;
    let styleType = "NORMAL_TEXT";
    let isHeading = false;
    let applyBulletStyle = false;
    let isOrderedLine = false;

    if (trimmed.startsWith("# ")) {
      isHeading = true;
      styleType = "HEADING_1";
      textToInsert = trimmed.substring(2);
    } else if (trimmed.startsWith("## ")) {
      isHeading = true;
      styleType = "HEADING_2";
      textToInsert = trimmed.substring(3);
    } else if (trimmed.startsWith("### ")) {
      isHeading = true;
      styleType = "HEADING_3";
      textToInsert = trimmed.substring(4);
    } else if (/^- \[(x|X| )\] /.test(trimmed)) {
      applyBulletStyle = true;
      textToInsert = trimmed.replace(/^- \[(x|X| )\] /, (match) => (match.toLowerCase().includes("x") ? "[v] " : "[ ] "));
    } else if (/^[-*] /.test(trimmed)) {
      applyBulletStyle = true;
      textToInsert = trimmed.substring(2);
    } else if (/^\d+\. /.test(trimmed)) {
      // Google Docs에서 줄 단위 createParagraphBullets(NUMBERED)를 적용하면
      // 항목마다 새 리스트로 인식되어 1,1,1로 리셋될 수 있어 서버에서 직접 번호를 계산한다.
      isOrderedLine = true;
      orderedListCounters.length = indentLevel + 1;
      const nextNumber = (orderedListCounters[indentLevel] || 0) + 1;
      orderedListCounters[indentLevel] = nextNumber;
      textToInsert = `${nextNumber}. ${trimmed.replace(/^\d+\. /, "")}`;
    }

    if (isHeading || (trimmed.length > 0 && !isOrderedLine && !applyBulletStyle)) {
      // 일반 문단/헤더가 나오면 새 번호 목록 시작을 위해 카운터 초기화
      orderedListCounters.length = 0;
    }

    if (applyBulletStyle && indentLevel === 0) {
      // 최상위 불릿 목록은 기존 번호 목록과 별개로 처리
      orderedListCounters.length = 0;
    }

    if (trimmed.match(/^\|[\s-]+\|/)) continue;

    if (trimmed.startsWith("|")) {
      textToInsert = trimmed.replace(/\|/g, " | ").trim();
    }

    if ((applyBulletStyle || isOrderedLine) && indentLevel > 0) {
      textToInsert = `${"\t".repeat(indentLevel)}${textToInsert}`;
    }

    // Newline at the end
    textToInsert += "\n";

    const { cleanText, boldRanges } = parseInlineBold(textToInsert);

    insertRequests.push({
      insertText: {
        text: cleanText,
        location: { index: currentIndex },
      },
    });

    const startIndex = currentIndex;
    const endIndex = currentIndex + cleanText.length;

    if (styleType !== "NORMAL_TEXT") {
      paragraphStyleRequests.push({
        updateParagraphStyle: {
          range: {
            startIndex: startIndex,
            endIndex: endIndex, // Style applies to the whole paragraph including newline
          },
          paragraphStyle: {
            namedStyleType: styleType,
          },
          fields: "namedStyleType",
        },
      });
    }

    if (applyBulletStyle) {
      bulletRequests.push({
        startIndex,
        request: {
          createParagraphBullets: {
            range: {
              startIndex: startIndex,
              endIndex: endIndex,
            },
            bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
          },
        },
      });
    }

    for (const range of boldRanges) {
      textStyleRequests.push({
        updateTextStyle: {
          range: {
            startIndex: startIndex + range.start,
            endIndex: startIndex + range.end
          },
          textStyle: {
            bold: true
          },
          fields: "bold"
        }
      });
    }

    currentIndex += cleanText.length;
  }

  // createParagraphBullets may remove leading tabs for nested lists.
  // Apply bullet requests from bottom to top so index shifts do not break later ranges.
  const sortedBulletRequests = bulletRequests
    .sort((a, b) => b.startIndex - a.startIndex)
    .map(({ request }) => request);

  return [
    ...insertRequests,
    ...paragraphStyleRequests,
    ...textStyleRequests,
    ...sortedBulletRequests,
  ];
}

/**
 * Google Docs 본문에 제목을 항상 포함한다.
 * 이미 첫 줄에 같은 제목이 있다면 중복 삽입하지 않는다.
 */
function buildGoogleDocBody(title: string, content: string): string {
  const normalizedTitle = title.trim();
  const normalizedContent = content.trim();

  if (!normalizedTitle) {
    return normalizedContent;
  }

  if (!normalizedContent) {
    return `# ${normalizedTitle}`;
  }

  const firstNonEmptyLine = normalizedContent
    .split("\n")
    .find((line) => line.trim().length > 0);

  if (firstNonEmptyLine) {
    const normalizedFirstLine = normalizeTitleComparisonLine(firstNonEmptyLine);
    const normalizedTitleLine = normalizeTitleComparisonLine(normalizedTitle);
    if (normalizedFirstLine === normalizedTitleLine) {
      return normalizedContent;
    }
  }

  return `# ${normalizedTitle}\n\n${normalizedContent}`;
}

function normalizeTitleComparisonLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Helper: Parse **text** and return cleaned text + bold ranges
 */
function parseInlineBold(text: string): { cleanText: string, boldRanges: { start: number, end: number }[] } {
  let cleanText = "";
  const boldRanges: { start: number, end: number }[] = [];

  let i = 0;
  let isBold = false;
  let boldStart = 0;

  while (i < text.length) {
    if (text.slice(i, i + 2) === "**") {
      if (isBold) {
        // End bold
        isBold = false;
        boldRanges.push({ start: boldStart, end: cleanText.length });
      } else {
        // Start bold
        isBold = true;
        boldStart = cleanText.length;
      }
      i += 2; // Skip **
    } else {
      cleanText += text[i];
      i++;
    }
  }

  return { cleanText, boldRanges };
}


/**
 * Deprecated: Old plaintext converter
 */
export function convertMarkdownToPlainText(markdown: string): string {
  // Keep for compatibility if needed elsewhere, but createGoogleDoc uses parseMarkdownToRequests now
  return markdown.replace(/\*\*/g, "");
}
