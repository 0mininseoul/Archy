import OpenAI from "openai";
import { buildPrompt, buildDetectionPrompt, buildFormatPrompt, FORMAT_PROMPTS, ContentType } from "@/lib/prompts";

export interface FormatResult {
  title: string;
  content: string;
  detectedType?: ContentType;
}

/**
 * 녹취록의 콘텐츠 유형을 자동으로 판단합니다 (미팅 vs 강의)
 */
export async function detectContentType(transcript: string): Promise<ContentType> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log("[Detection] Starting content type detection...");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildDetectionPrompt(transcript);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "당신은 텍스트 분류 전문가입니다. 주어진 녹취록이 회의(meeting)인지 강의(lecture)인지 판단합니다. 반드시 'meeting' 또는 'lecture' 중 하나만 응답하세요.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const result = response.choices[0].message.content?.trim().toLowerCase() || "meeting";
    console.log("[Detection] Detected content type:", result);

    // 유효한 값인지 확인
    if (result === "meeting" || result === "lecture") {
      return result;
    }

    // 기본값은 meeting
    console.log("[Detection] Invalid response, defaulting to meeting");
    return "meeting";
  } catch (error) {
    console.error("[Detection] Error:", error);
    // 오류 시 기본값 반환
    return "meeting";
  }
}

/**
 * 자동으로 콘텐츠 유형을 판단하고 적절한 포맷으로 문서를 생성합니다
 */
export async function formatDocumentAuto(transcript: string): Promise<FormatResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log("[Formatting] Starting auto format detection and formatting...");

  // 1. 콘텐츠 유형 판단
  const contentType = await detectContentType(transcript);
  console.log("[Formatting] Content type detected:", contentType);

  // 2. 해당 유형에 맞는 포맷으로 문서 생성
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildFormatPrompt(contentType, transcript);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 문서 편집자입니다. 녹취록을 읽기 쉽고 구조화된 형식으로 정리하는 것이 당신의 임무입니다.

응답은 반드시 아래 형식을 따라주세요:
[TITLE]
(녹음 내용을 요약하는 간결한 제목 - 한 줄로, 최대 40자 이내)
[/TITLE]
[CONTENT]
(정리된 문서 내용)
[/CONTENT]

제목 작성 가이드:
- 핵심 주제나 목적을 담은 간결한 제목
- 예: "2024년 마케팅 전략 회의", "React 기초 강의 요약"`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const fullResponse = response.choices[0].message.content || "";
    console.log("[Formatting] Auto formatting succeeded");

    // Parse title and content from response
    const titleMatch = fullResponse.match(/\[TITLE\]\s*([\s\S]*?)\s*\[\/TITLE\]/);
    const contentMatch = fullResponse.match(/\[CONTENT\]\s*([\s\S]*?)\s*\[\/CONTENT\]/);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const content = contentMatch ? contentMatch[1].trim() : fullResponse;

    console.log("[Formatting] Parsed title:", title);

    return { title, content, detectedType: contentType };
  } catch (error) {
    console.error("[Formatting] OpenAI error:", error);
    throw new Error(
      `OpenAI formatting failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * 지정된 포맷으로 문서를 생성합니다 (기존 방식)
 */
export async function formatDocument(
  transcript: string,
  format: keyof typeof FORMAT_PROMPTS,
  customPrompt?: string
): Promise<FormatResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log("[Formatting] Starting OpenAI formatting...");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = buildPrompt(format, transcript, customPrompt);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 문서 편집자입니다. 녹취록을 읽기 쉽고 구조화된 형식으로 정리하는 것이 당신의 임무입니다.

응답은 반드시 아래 형식을 따라주세요:
[TITLE]
(녹음 내용을 요약하는 간결한 제목 - 한 줄로, 최대 40자 이내)
[/TITLE]
[CONTENT]
(정리된 문서 내용)
[/CONTENT]

제목 작성 가이드:
- 핵심 주제나 목적을 담은 간결한 제목
- 예: "2024년 마케팅 전략 회의", "신입사원 온보딩 인터뷰", "React 기초 강의 요약"`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const fullResponse = response.choices[0].message.content || "";
    console.log("[Formatting] OpenAI formatting succeeded");

    // Parse title and content from response
    const titleMatch = fullResponse.match(/\[TITLE\]\s*([\s\S]*?)\s*\[\/TITLE\]/);
    const contentMatch = fullResponse.match(/\[CONTENT\]\s*([\s\S]*?)\s*\[\/CONTENT\]/);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const content = contentMatch ? contentMatch[1].trim() : fullResponse;

    console.log("[Formatting] Parsed title:", title);

    return { title, content };
  } catch (error) {
    console.error("[Formatting] OpenAI error:", error);
    throw new Error(
      `OpenAI formatting failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
