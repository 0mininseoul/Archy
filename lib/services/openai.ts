import OpenAI from "openai";
import { buildUniversalPrompt } from "@/lib/prompts";
import { sanitizeTranscriptText } from "@/lib/utils/transcript";

export interface FormatResult {
  title: string;
  content: string;
}

const TRANSCRIPT_PLACEHOLDER_REGEX = /\{\{\s*transcript\s*\}\}/gi;
const TRANSCRIPT_PLACEHOLDER_DETECT_REGEX = /\{\{\s*transcript\s*\}\}/i;

// Patterns that indicate AI returned a problematic response
const PROBLEMATIC_RESPONSE_PATTERNS = {
  placeholder: [
    /^\(제목\)$/,
    /^\(정리된 내용\)$/,
    /^실제 제목을 여기에 작성$/,
    /^\(핵심 \d\)$/,
    /^\(짧은 제목\)$/,
  ],
  waitingForInput: [
    /녹취록.*내용.*제공/,
    /내용.*입력.*주세요/,
    /녹취록.*입력/,
    /제공해.*주시면.*정리/,
    /텍스트.*제공/,
    /녹음.*내용.*알려/,
    /무엇.*정리/,
    /어떤.*내용/,
    /녹취록이.*없/,
    /내용이.*없/,
    /정리할.*내용/,
    /transcript.*provide/i,
    /please.*provide/i,
    /waiting.*for.*input/i,
  ],
  lazyResponse: [
    /^녹음 내용이 짧습니다\.?$/,
    /^녹음 내용이 매우 짧아/,
    /^녹음 내용이 짧아 요약이 제한적입니다\.?$/,
    /^내용이 짧습니다\.?$/,
    /^요약이 제한적입니다\.?$/,
    /녹음 내용이 짧아.*어렵/,
    /내용이 부족/,
    /요약.*어렵/,
    /정리.*어렵/,
    /충분.*내용.*없/,
    /의미있는.*내용.*없/,
    /녹취록.*짧아/,
  ],
  genericTitle: [
    /^짧은 음성 기록$/,
    /^짧은 음성 메모$/,
    /^음성 메모$/,
    /^녹음 내용$/,
    /^녹취록$/,
  ],
};

/**
 * Check if the AI response is problematic and needs retry
 */
function isProblematicResponse(
  title: string,
  content: string,
  originalTranscript: string
): { isProblematic: boolean; reason: string } {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  // Check for placeholder text
  for (const pattern of PROBLEMATIC_RESPONSE_PATTERNS.placeholder) {
    if (pattern.test(trimmedTitle) || pattern.test(trimmedContent)) {
      return { isProblematic: true, reason: "placeholder_detected" };
    }
  }

  // Check for "waiting for input" responses
  for (const pattern of PROBLEMATIC_RESPONSE_PATTERNS.waitingForInput) {
    if (pattern.test(trimmedContent)) {
      return { isProblematic: true, reason: "waiting_for_input" };
    }
  }

  // Check for lazy responses
  for (const pattern of PROBLEMATIC_RESPONSE_PATTERNS.lazyResponse) {
    if (pattern.test(trimmedTitle) || pattern.test(trimmedContent)) {
      return { isProblematic: true, reason: "lazy_response" };
    }
  }

  // Check for generic titles
  for (const pattern of PROBLEMATIC_RESPONSE_PATTERNS.genericTitle) {
    if (pattern.test(trimmedTitle)) {
      return { isProblematic: true, reason: "generic_title" };
    }
  }

  // Check if content is just raw transcript copy
  const normalizedContent = trimmedContent
    .replace(/^###\s*📌\s*(3줄\s*)?핵심\s*요약\s*\n+/i, "")
    .replace(/^##\s*.*\n+/gm, "")
    .replace(/^-\s*/gm, "")
    .trim();
  const normalizedTranscript = originalTranscript.trim();

  if (
    normalizedContent === normalizedTranscript ||
    (normalizedContent.includes(normalizedTranscript) &&
      normalizedContent.length < normalizedTranscript.length * 1.3)
  ) {
    return { isProblematic: true, reason: "raw_transcript_copy" };
  }

  // Check if title is raw transcript copy
  const normalizedTitleCheck = trimmedTitle.replace(/\.{3}$/, "").trim();
  if (
    normalizedTranscript.startsWith(normalizedTitleCheck) &&
    normalizedTitleCheck.length > 10
  ) {
    return { isProblematic: true, reason: "title_is_transcript" };
  }

  return { isProblematic: false, reason: "" };
}

/**
 * Parse title and content from AI response
 */
function parseResponse(fullResponse: string): { title: string; content: string } {
  let title = "";
  let content = fullResponse;

  // Try multiple patterns for title extraction
  const titlePatterns = [
    /\[TITLE\]\s*([\s\S]*?)\s*\[\/TITLE\]/i,
    /\[TITLE\]([\s\S]*?)\[\/TITLE\]/i,
  ];

  for (const pattern of titlePatterns) {
    const match = fullResponse.match(pattern);
    if (match) {
      title = match[1].trim();
      break;
    }
  }

  // Try multiple patterns for content extraction
  const contentPatterns = [
    /\[CONTENT\]\s*([\s\S]*?)\s*\[\/CONTENT\]/i,
    /\[CONTENT\]([\s\S]*?)\[\/CONTENT\]/i,
    /\[CONTENT\]\s*([\s\S]*)$/i, // Handle missing [/CONTENT] tag
  ];

  for (const pattern of contentPatterns) {
    const match = fullResponse.match(pattern);
    if (match) {
      content = match[1].trim();
      break;
    }
  }

  // Post-processing: Remove any remaining tags
  content = content
    .replace(/^\[TITLE\][\s\S]*?\[\/TITLE\]\s*/i, "")
    .replace(/\[TITLE\][\s\S]*?\[\/TITLE\]\s*/gi, "")
    .replace(/^\[CONTENT\]\s*/i, "")
    .replace(/\s*\[\/CONTENT\]$/i, "")
    .trim();

  // If content still starts with tags, extract just the content part
  if (content.startsWith("[")) {
    const contentStart = content.indexOf("### ");
    if (contentStart !== -1) {
      content = content.substring(contentStart);
    }
  }

  return { title, content };
}

/**
 * Call OpenAI API to format the transcript
 */
async function callOpenAI(
  openai: OpenAI,
  prompt: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `당신은 녹취록을 분석하고 구조화된 문서로 정리하는 전문가입니다.
사용자가 제공하는 프롬프트의 지시사항을 정확히 따라 [TITLE]과 [CONTENT] 형식으로 응답하세요.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 4000,
    temperature: 0.5,
  });

  return response.choices[0].message.content || "";
}

function buildCustomPromptWithTranscript(
  customPrompt: string,
  transcript: string
): {
  promptWithTranscript: string;
  hasTranscriptPlaceholder: boolean;
  transcriptInjectedFallback: boolean;
} {
  const hasTranscriptPlaceholder =
    TRANSCRIPT_PLACEHOLDER_DETECT_REGEX.test(customPrompt);

  if (hasTranscriptPlaceholder) {
    return {
      promptWithTranscript: customPrompt.replace(
        TRANSCRIPT_PLACEHOLDER_REGEX,
        transcript
      ),
      hasTranscriptPlaceholder: true,
      transcriptInjectedFallback: false,
    };
  }

  return {
    promptWithTranscript: `${customPrompt}

## 녹취록
<<<TRANSCRIPT>>>
${transcript}
<<<END_TRANSCRIPT>>>`,
    hasTranscriptPlaceholder: false,
    transcriptInjectedFallback: true,
  };
}

/**
 * 녹취록을 포맷에 맞춰 요약/정리합니다.
 * Universal Prompt를 사용하여 AI가 문서 구성을 직접 결정합니다.
 */
export async function formatDocument(
  transcript: string,
  // format 인자는 하위 호환성을 위해 남겨두지만 실제로는 무시
  _format?: string,
  customPrompt?: string
): Promise<FormatResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Handle empty or whitespace-only transcripts
  const trimmedTranscript = sanitizeTranscriptText(transcript);
  if (!trimmedTranscript) {
    console.warn("[Formatting] Empty transcript provided");
    return {
      title: "빈 녹음",
      content:
        "📝 **녹음 내용이 없습니다.**\n\n음성이 인식되지 않았거나 녹음 중 오류가 발생했을 수 있습니다.",
    };
  }

  console.log("[Formatting] Starting OpenAI formatting...");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Build prompt
  let prompt: string;
  if (customPrompt) {
    const {
      promptWithTranscript,
      hasTranscriptPlaceholder,
      transcriptInjectedFallback,
    } = buildCustomPromptWithTranscript(customPrompt, trimmedTranscript);

    // 커스텀 프롬프트에도 [TITLE]/[CONTENT] 형식 안내를 추가
    prompt = `${promptWithTranscript}

## 응답 형식 (반드시 준수)
아래 형식으로 응답하세요. 태그는 반드시 포함해야 합니다.

[TITLE]
맥락을 반영한 제목 (한 줄)
[/TITLE]
[CONTENT]
정리된 내용 (마크다운 형식)
[/CONTENT]`;
    console.log(
      `[Formatting] Using custom format (custom_prompt_has_transcript_placeholder=${hasTranscriptPlaceholder}, transcript_injected_fallback=${transcriptInjectedFallback})`
    );
  } else {
    prompt = buildUniversalPrompt(trimmedTranscript);
    console.log("[Formatting] Using universal prompt");
  }

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;
  let lastReason = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Formatting] Attempt ${attempt}/${MAX_RETRIES}...`
      );

      // Create timeout promise (90 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Formatting timed out after 90 seconds")),
          90000
        );
      });

      // Call OpenAI with timeout
      const fullResponse = await Promise.race([
        callOpenAI(openai, prompt),
        timeoutPromise,
      ]);

      if (!fullResponse) {
        throw new Error("OpenAI returned empty response");
      }

      // Parse response
      const { title, content } = parseResponse(fullResponse);

      if (!title || !content) {
        throw new Error("Failed to parse title or content from response");
      }

      // Check if response is problematic
      const { isProblematic, reason } = isProblematicResponse(
        title,
        content,
        trimmedTranscript
      );

      if (isProblematic) {
        console.warn(
          `[Formatting] Attempt ${attempt} returned problematic response: ${reason}`
        );
        console.warn(`[Formatting] Title: ${title.substring(0, 50)}...`);
        lastReason = reason;

        if (attempt < MAX_RETRIES) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          // All retries exhausted with problematic responses
          throw new Error(
            `AI가 올바른 요약을 생성하지 못했습니다 (${reason}). 다시 시도해주세요.`
          );
        }
      }

      // Success!
      console.log("[Formatting] OpenAI formatting succeeded");
      console.log(`[Formatting] Title: ${title}`);
      return { title, content };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Formatting] Attempt ${attempt} failed:`,
        errorMessage
      );
      lastError = error instanceof Error ? error : new Error(errorMessage);

      if (attempt < MAX_RETRIES) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // All retries exhausted
  const finalErrorMessage = lastReason
    ? `요약 생성에 실패했습니다: ${lastReason}`
    : lastError?.message || "Unknown formatting error";

  console.error("[Formatting] All retries exhausted:", finalErrorMessage);
  throw new Error(finalErrorMessage);
}
