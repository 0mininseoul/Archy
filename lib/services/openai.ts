import OpenAI from "openai";
import { buildPromptByQuality, analyzeTranscriptQuality } from "@/lib/prompts";

export interface FormatResult {
  title: string;
  content: string;
}

/**
 * 녹취록을 포맷에 맞춰 요약/정리합니다.
 * 전사본 품질에 따라 자동으로 적절한 프롬프트를 선택합니다.
 */
export async function formatDocument(
  transcript: string,
  // format 인자는 하위 호환성을 위해 남겨두지만 실제로는 무시
  format?: string,
  customPrompt?: string
): Promise<FormatResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // 품질 분석
  const quality = analyzeTranscriptQuality(transcript);
  console.log(`[Formatting] Transcript quality: ${quality}, word count: ${transcript.split(/\\s+/).length}`);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 커스텀 프롬프트가 있으면 그것을 우선 사용, 아니면 품질 기반 프롬프트 사용
  let prompt: string;
  if (customPrompt) {
    prompt = customPrompt.replace("{{transcript}}", transcript);
    console.log("[Formatting] Using custom format");
  } else {
    const { prompt: qualityPrompt } = buildPromptByQuality(transcript);
    prompt = qualityPrompt;
    console.log(`[Formatting] Using ${quality} quality prompt`);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 문서 편집자입니다. 녹취록을 읽기 쉽고 구조화된 형식으로 정리하는 것이 당신의 임무입니다.

⚠️ 중요: 녹취록에 없는 내용을 절대 만들어내지 마세요. 있는 내용만 정확하게 정리하세요.

응답은 반드시 아래 형식을 따라주세요. [TITLE]과 [CONTENT] 태그 사이에 실제 내용을 작성해야 합니다:

[TITLE]
실제 제목을 여기에 작성
[/TITLE]
[CONTENT]
실제 정리된 내용을 여기에 마크다운 형식으로 작성
[/CONTENT]

주의: "(제목)", "(정리된 내용)" 같은 플레이스홀더 텍스트를 그대로 출력하지 마세요. 반드시 녹취록 내용을 기반으로 실제 제목과 내용을 작성하세요.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: quality === 'minimal' ? 500 : quality === 'sparse' ? 2000 : 4000,
      temperature: 0.5,
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

    // Validate that we didn't get placeholder text literally
    const placeholderPatterns = [
      /^\(제목\)$/,
      /^\(정리된 내용\)$/,
      /^실제 제목을 여기에 작성$/,
      /^실제 정리된 내용을 여기에/,
      /^\(핵심 \d\)$/,
      /^\(짧은 제목\)$/,
    ];

    const isPlaceholderTitle = placeholderPatterns.some(p => p.test(title.trim()));
    const isPlaceholderContent = placeholderPatterns.some(p => p.test(content.trim()));

    if (isPlaceholderTitle || isPlaceholderContent) {
      console.warn("[Formatting] AI returned placeholder text instead of actual content");
      console.warn("[Formatting] Raw response:", fullResponse.substring(0, 500));

      // Try to extract content from raw response without tags
      if (isPlaceholderContent) {
        // Fall back to using the raw response without the tag structure
        const rawContent = fullResponse
          .replace(/\[TITLE\][\s\S]*?\[\/TITLE\]/gi, "")
          .replace(/\[CONTENT\]/gi, "")
          .replace(/\[\/CONTENT\]/gi, "")
          .trim();

        if (rawContent.length > 10) {
          content = rawContent;
        }
      }

      // Generate a simple title from first meaningful words if title is placeholder
      if (isPlaceholderTitle && content.length > 0) {
        const firstLine = content.split('\n').find(line => line.trim().length > 5);
        if (firstLine) {
          title = firstLine.replace(/^[#\-*\s📌]+/, '').substring(0, 50).trim();
          if (title.length > 40) {
            title = title.substring(0, 40) + "...";
          }
        }
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
