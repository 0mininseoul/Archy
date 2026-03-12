import OpenAI from "openai";
import { buildUniversalPrompt, getSummaryDetailRequirements } from "@/lib/prompts";
import { sanitizeTranscriptText } from "@/lib/utils/transcript";

export interface FormatResult {
  title: string;
  content: string;
}

const TRANSCRIPT_PLACEHOLDER_REGEX = /\{\{\s*transcript\s*\}\}/gi;
const TRANSCRIPT_PLACEHOLDER_DETECT_REGEX = /\{\{\s*transcript\s*\}\}/i;
const OPENAI_SUMMARY_MODEL = "gpt-4o-mini";
const GEMINI_SUMMARY_MODEL = "gemini-3.1-pro-preview";
const GEMINI_SUMMARY_CUTOFF_AT_MS = Date.parse("2026-05-05T15:00:00.000Z"); // 2026-05-06 00:00:00 KST
const FORMATTING_MAX_OUTPUT_TOKENS = 4000;
const FORMATTING_REQUEST_TIMEOUT_MS = 90_000;
const GEMINI_SUMMARY_THINKING_LEVEL = "high";

type FormattingProvider = "openai" | "gemini";
type ParsedFormatResponse = { title: string; content: string };

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

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildFormattingSystemPrompt(): string {
  return `당신은 녹취록을 분석해 실무에서 다시 참고할 수 있는 구조화 문서로 정리하는 전문가입니다.
과도하게 압축하지 말고, 긴 녹취와 전문 지식 설명은 충분히 상세하게 정리하세요.
사용자가 제공하는 프롬프트의 지시사항과 응답 형식을 정확히 따르세요.`;
}

function buildResponseFormatInstructions(provider: FormattingProvider): string {
  if (provider === "gemini") {
    return `## 응답 형식 (반드시 준수)
아래 형식으로 응답하세요. 태그는 반드시 포함해야 합니다.
- 코드펜스와 JSON 래퍼는 출력하지 마세요.
- [CONTENT] 본문은 반드시 "## 핵심 요약"으로 시작하세요.

[TITLE]
맥락을 반영한 제목 (한 줄)
[/TITLE]
[CONTENT]
정리된 내용 (마크다운 형식)
[/CONTENT]`;
  }

  return `## 응답 형식 (반드시 준수)
아래 형식으로 응답하세요. 태그는 반드시 포함해야 합니다.

[TITLE]
맥락을 반영한 제목 (한 줄)
[/TITLE]
[CONTENT]
정리된 내용 (마크다운 형식)
[/CONTENT]`;
}

function getFormattingProvider(nowMs = Date.now()): FormattingProvider {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (hasGeminiKey && nowMs < GEMINI_SUMMARY_CUTOFF_AT_MS) {
    return "gemini";
  }

  return "openai";
}

function getMinimumDetailedContentLength(transcriptLength: number): number {
  return getSummaryDetailRequirements(transcriptLength).minContentLength;
}

function getMinimumAcceptableShortResponseLength(transcriptLength: number): number {
  const targetLength = getMinimumDetailedContentLength(transcriptLength);

  if (targetLength <= 0) {
    return 0;
  }

  return Math.max(700, Math.floor(targetLength * 0.55));
}

function buildShortResponseRetryPrompt(
  basePrompt: string,
  transcriptLength: number,
  actualContentLength: number
): string {
  const requirements = getSummaryDetailRequirements(transcriptLength);

  return `${basePrompt}

## 재작성 지시
이전 응답은 ${actualContentLength}자로 너무 짧았습니다. 이번에는 아래 조건을 반드시 지키세요.
- [CONTENT] 본문은 최소 ${requirements.minContentLength}자 이상으로 작성하세요.
- "## 핵심 요약"은 ${requirements.coreBulletCount} bullet 이상으로 작성하세요.
- 본문은 ${requirements.bodySectionCount} 섹션 이상으로 구성하세요.
- 각 섹션에는 ${requirements.perSectionBulletCount}개의 구체 bullet 또는 그에 준하는 상세 설명을 포함하세요.
- 일반적인 결론, 당위, 감상, 메타 코멘트로 분량을 채우지 말고 날짜, 수치, 규칙, 예시, 절차, 예외를 더 많이 보존하세요.
- 강의/전문 설명이면 개념 정의, 원리, 단계, 계산 예시를 더 자세히 적고, 회의/브레인스토밍이면 결정 배경, 비용, 리스크, 다음 액션을 더 구체적으로 적으세요.`;
}

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
  const normalizedTranscript = normalizeInlineText(originalTranscript);
  const normalizedContentLength = normalizeInlineText(trimmedContent).length;
  const minimumDetailedContentLength = getMinimumDetailedContentLength(normalizedTranscript.length);

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
    .replace(/^(###\s*📌\s*(3줄\s*)?핵심\s*요약|##\s*핵심\s*요약)\s*\n+/i, "")
    .replace(/^##\s*.*\n+/gm, "")
    .replace(/^-\s*/gm, "")
    .trim();

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

  if (
    minimumDetailedContentLength > 0 &&
    normalizedTranscript.length >= 1200 &&
    normalizedContentLength < minimumDetailedContentLength
  ) {
    return { isProblematic: true, reason: "too_short_for_transcript" };
  }

  return { isProblematic: false, reason: "" };
}

/**
 * Parse title and content from AI response
 */
function parseOpenAIResponse(fullResponse: string): ParsedFormatResponse {
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
    const contentHeadingMatch = content.match(/(^|\n)(##+\s+)/);
    if (contentHeadingMatch && typeof contentHeadingMatch.index === "number") {
      const contentStart = contentHeadingMatch.index + contentHeadingMatch[1].length;
      content = content.substring(contentStart);
    }
  }

  return { title, content };
}

function parseFormattingResponse(
  provider: FormattingProvider,
  fullResponse: string
): ParsedFormatResponse {
  return parseOpenAIResponse(fullResponse);
}

/**
 * Call OpenAI API to format the transcript
 */
async function callOpenAI(
  openai: OpenAI,
  prompt: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: OPENAI_SUMMARY_MODEL,
    messages: [
      {
        role: "system",
        content: buildFormattingSystemPrompt(),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: FORMATTING_MAX_OUTPUT_TOKENS,
    temperature: 0.5,
  });

  return response.choices[0].message.content || "";
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_SUMMARY_MODEL
  )}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(FORMATTING_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildFormattingSystemPrompt() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: FORMATTING_MAX_OUTPUT_TOKENS,
        thinkingConfig: {
          thinkingLevel: GEMINI_SUMMARY_THINKING_LEVEL,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}

async function callFormattingModel(
  provider: FormattingProvider,
  prompt: string,
  openai: OpenAI | null
): Promise<string> {
  if (provider === "gemini") {
    return callGemini(prompt);
  }

  if (!openai) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  return callOpenAI(openai, prompt);
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
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (!hasOpenAIKey && !hasGeminiKey) {
    throw new Error("No summary model API keys configured");
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

  const provider = getFormattingProvider();
  if (provider === "openai" && !hasOpenAIKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log(
    `[Formatting] Starting ${provider} formatting (cutoff=${new Date(
      GEMINI_SUMMARY_CUTOFF_AT_MS
    ).toISOString()})...`
  );

  const openai = hasOpenAIKey
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    : null;

  // Build prompt
  let prompt: string;
  if (customPrompt) {
    const {
      promptWithTranscript,
      hasTranscriptPlaceholder,
      transcriptInjectedFallback,
    } = buildCustomPromptWithTranscript(customPrompt, trimmedTranscript);

    prompt = `${promptWithTranscript}

${buildResponseFormatInstructions(provider)}`;
    console.log(
      `[Formatting] Using custom format (custom_prompt_has_transcript_placeholder=${hasTranscriptPlaceholder}, transcript_injected_fallback=${transcriptInjectedFallback})`
    );
  } else {
    prompt = `${buildUniversalPrompt(trimmedTranscript)}

${buildResponseFormatInstructions(provider)}`;
    console.log("[Formatting] Using universal prompt");
  }

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  let lastReason = "";
  let attemptPrompt = prompt;
  let lastStructuredResponse:
    | {
      title: string;
      content: string;
      normalizedContentLength: number;
    }
    | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Formatting] Attempt ${attempt}/${MAX_RETRIES} via ${provider}...`
      );

      // Create timeout promise (90 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Formatting timed out after ${FORMATTING_REQUEST_TIMEOUT_MS}ms`
              )
            ),
          FORMATTING_REQUEST_TIMEOUT_MS
        );
      });

      // Call the active formatting model with timeout
      const fullResponse = await Promise.race([
        callFormattingModel(provider, attemptPrompt, openai),
        timeoutPromise,
      ]);

      if (!fullResponse) {
        throw new Error(`${provider} returned empty response`);
      }

      // Parse response
      const { title, content } = parseFormattingResponse(provider, fullResponse);

      if (!title || !content) {
        throw new Error("Failed to parse title or content from response");
      }

      lastStructuredResponse = {
        title,
        content,
        normalizedContentLength: normalizeInlineText(content).length,
      };

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
          if (reason === "too_short_for_transcript") {
            attemptPrompt = buildShortResponseRetryPrompt(
              prompt,
              trimmedTranscript.length,
              normalizeInlineText(content).length
            );
          }
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          if (reason === "too_short_for_transcript" && lastStructuredResponse) {
            const targetMinimumLength = getMinimumDetailedContentLength(
              trimmedTranscript.length
            );
            const fallbackMinimumLength = getMinimumAcceptableShortResponseLength(
              trimmedTranscript.length
            );

            if (lastStructuredResponse.normalizedContentLength >= fallbackMinimumLength) {
              console.warn(
                `[Formatting] Accepting shorter-than-target response after ${MAX_RETRIES} attempts (length=${lastStructuredResponse.normalizedContentLength}, target=${targetMinimumLength}, fallback_min=${fallbackMinimumLength})`
              );
              return {
                title: lastStructuredResponse.title,
                content: lastStructuredResponse.content,
              };
            }
          }

          // All retries exhausted with problematic responses
          throw new Error(
            `AI가 올바른 요약을 생성하지 못했습니다 (${reason}). 다시 시도해주세요.`
          );
        }
      }

      // Success!
      console.log(`[Formatting] ${provider} formatting succeeded`);
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
