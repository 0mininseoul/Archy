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

  // 2. 마크다운 파싱 및 배치 요청 생성
  const requests = parseMarkdownToRequests(content); // No starting index needed for empty doc (starts at 1)

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
  const requests: any[] = [];
  let currentIndex = 1; // Google Docs starts at index 1

  const lines = markdown.split("\n");

  // First pass: Construct the full text insertion
  // We insert line by line to track indices for styling

  // Actually, inserting one big block is efficient but makes styling harder to map if we strip chars.
  // Strategy: Parse line, clean it, insert it, apply style to the inserted range.

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let textToInsert = line;
    let styleType = "NORMAL_TEXT";
    let isList = false;
    let listType = "BULLET"; // Default

    // 1. Identify Line Type & Strip Markers
    if (line.startsWith("## ")) {
      styleType = "HEADING_2";
      textToInsert = line.substring(3);
    } else if (line.startsWith("### ")) {
      styleType = "HEADING_3";
      textToInsert = line.substring(4);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      isList = true;
      textToInsert = line.substring(2);
    } else if (/^\d+\. /.test(line)) {
      isList = true;
      listType = "NUMBERED"; // Simplification: Usage same as bullet
      textToInsert = line.replace(/^\d+\. /, "");
    } else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      // Checkboxes as bullets for now
      isList = true;
      textToInsert = line.replace(/^- \[(x| )\] /, (match) => match.includes("x") ? "[v] " : "[ ] ");
    }

    // Handle Table Separators (Simple skip)
    if (line.match(/^\|[\s-]+\|/)) continue;

    // Handle Table Rows (Simple conversion to text with spaces)
    if (line.startsWith("|")) {
      textToInsert = line.replace(/\|/g, " | ").trim(); // Naive table handling
    }

    // Newline at the end
    textToInsert += "\n";

    // 2. Handle Inline Bold (**text**) within this line
    // We need to insert text in chunks to apply styles correctly?
    // Or insert full line then apply styles to ranges? -> Ranges is better.

    // Clean inline formatting markers from textToInsert for final output?
    // If we remove **, indices shift. 
    // Let's Parse inline bold first to get ranges relative to the CLEANED string.

    const { cleanText, boldRanges } = parseInlineBold(textToInsert);

    // 3. Insert Text
    requests.push({
      insertText: {
        text: cleanText,
        location: { index: currentIndex },
      },
    });

    const startIndex = currentIndex;
    const endIndex = currentIndex + cleanText.length;

    // 4. Apply Paragraph Style (Heading)
    if (styleType !== "NORMAL_TEXT") {
      requests.push({
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

    // 5. Apply List Style
    if (isList) {
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: startIndex,
            endIndex: endIndex,
          },
          bulletPreset: listType === "NUMBERED" ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    }

    // 6. Apply Inline Bold Styles
    for (const range of boldRanges) {
      requests.push({
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

    // Update Index
    currentIndex += cleanText.length;
  }

  return requests;
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
