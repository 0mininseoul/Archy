import OpenAI from "openai";
import { buildUniversalPrompt } from "@/lib/prompts";

export interface FormatResult {
  title: string;
  content: string;
}

/**
 * 녹취록을 포맷에 맞춰 요약/정리합니다.
 * (기존의 복잡한 분기 처리를 제거하고 Universal Prompt 사용)
 */
export async function formatDocument(
  transcript: string,
  // format 인자는 하위 호환성을 위해 남겨두지만 실제로는 무시하거나 로깅용으로만 사용
  format?: string,
  customPrompt?: string
): Promise<FormatResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log("[Formatting] Starting OpenAI formatting with Universal Prompt...");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 커스텀 프롬프트가 있으면 그것을 우선 사용, 아니면 유니버설 프롬프트 사용
  let prompt: string;
  if (customPrompt) {
    prompt = customPrompt.replace("{{transcript}}", transcript);
    // 날짜 처리가 필요하다면 여기서 추가 replace
  } else {
    prompt = buildUniversalPrompt(transcript);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 문서 편집자입니다. 녹취록을 읽기 쉽고 구조화된 형식으로 정리하는 것이 당신의 임무입니다.
응답은 반드시 아래 형식을 따라주세요:

[TITLE]
(제목)
[/TITLE]
[CONTENT]
(정리된 내용)
[/CONTENT]`,
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

    // Parse title and content from response with robust regex
    // Handle various formats: [TITLE], [TITLE], with/without newlines
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

    // Post-processing: Remove any remaining tags that might have leaked
    content = content
      .replace(/^\[TITLE\][\s\S]*?\[\/TITLE\]\s*/i, "") // Remove title block at start
      .replace(/\[TITLE\][\s\S]*?\[\/TITLE\]\s*/gi, "") // Remove any title blocks
      .replace(/^\[CONTENT\]\s*/i, "") // Remove [CONTENT] tag at start
      .replace(/\s*\[\/CONTENT\]$/i, "") // Remove [/CONTENT] tag at end
      .trim();

    // If content still starts with tags after cleanup, extract just the content part
    if (content.startsWith("[")) {
      const contentStart = content.indexOf("### ");
      if (contentStart !== -1) {
        content = content.substring(contentStart);
      }
    }

    console.log("[Formatting] Parsed title:", title);

    return { title, content };
  } catch (error) {
    console.error("[Formatting] OpenAI error:", error);
    throw new Error(
      `OpenAI formatting failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Deprecated functions (kept to prevent import errors in other files until they are updated, 
// but in this plan I will be updating the caller immediately. 
// However, since I am editing this file first, I should remove them to strictly follow the plan 
// and fix the caller in the next step. But to avoid temporary build errors if I was running a watcher 
// (which I'm not), I'll just remove them.
