import OpenAI from "openai";
import { buildUniversalPrompt } from "@/lib/prompts";

export interface FormatResult {
  title: string;
  content: string;
}

/**
 * 녹취록을 포맷에 맞춰 요약/정리합니다.
 * Universal Prompt를 사용하여 AI가 문서 구성을 직접 결정합니다.
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

  // Handle empty or whitespace-only transcripts
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    console.warn("[Formatting] Empty transcript provided");
    return {
      title: "빈 녹음",
      content: "📝 **녹음 내용이 없습니다.**\n\n음성이 인식되지 않았거나 녹음 중 오류가 발생했을 수 있습니다.",
    };
  }

  console.log("[Formatting] Starting OpenAI formatting with Universal Prompt...");

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 커스텀 프롬프트가 있으면 그것을 우선 사용, 아니면 유니버설 프롬프트 사용
  let prompt: string;
  if (customPrompt) {
    prompt = customPrompt.replace("{{transcript}}", trimmedTranscript);
    console.log("[Formatting] Using custom format");
  } else {
    prompt = buildUniversalPrompt(trimmedTranscript);
    console.log("[Formatting] Using universal prompt");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 문서 편집자입니다. 사용자가 제공한 녹취록을 요약하여 정리하세요.

⚠️ 절대 금지:
1. 녹취록에 없는 내용 추가 금지
2. "녹취록을 제공해주세요" 같은 입력 요청 금지
3. "녹음 내용이 짧습니다", "내용이 부족합니다" 같은 메타 코멘트만 하고 끝내기 금지
4. 녹취록 원본을 그대로 복사하여 붙여넣기 금지 - 제목과 본문 모두 요약된 형태로 작성
5. 제목에 녹취록 첫 문장을 그대로 쓰지 마세요 - 반드시 내용을 요약한 제목으로

✅ 필수:
- 제목: 녹취록의 주제나 맥락을 요약한 제목 (예: "날씨에 대한 이야기", "회의 안건 논의")
- 본문: 녹취록 내용을 요약하여 작성 (원본 복사 금지)
- 짧은 내용이라도 화자의 상황, 감정, 핵심 메시지를 파악하여 요약

응답 형식:
[TITLE]
녹취록의 주제/맥락을 요약한 제목 (녹취록 첫 문장 복사 금지)
[/TITLE]
[CONTENT]
녹취록 내용을 요약한 본문 (반드시 요약된 형태로 작성)
[/CONTENT]`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4000,
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

    // Validate that we didn't get placeholder text or "waiting for input" responses
    const placeholderPatterns = [
      /^\(제목\)$/,
      /^\(정리된 내용\)$/,
      /^실제 제목을 여기에 작성$/,
      /^실제 정리된 내용을 여기에/,
      /^\(핵심 \d\)$/,
      /^\(짧은 제목\)$/,
    ];

    // Patterns that indicate AI is asking for input instead of processing
    const waitingForInputPatterns = [
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
    ];

    // Patterns that indicate AI just said "content is short" without actual summary
    const lazyResponsePatterns = [
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
    ];

    const isPlaceholderTitle = placeholderPatterns.some(p => p.test(title.trim()));
    const isPlaceholderContent = placeholderPatterns.some(p => p.test(content.trim()));
    const isWaitingForInput = waitingForInputPatterns.some(p => p.test(content));
    const isLazyResponse = lazyResponsePatterns.some(p => p.test(title.trim())) ||
                           lazyResponsePatterns.some(p => p.test(content.trim()));

    // Check if content is just the raw transcript copy-pasted
    const normalizedContent = content.replace(/^###\s*📝\s*(녹음\s*내용|상세\s*내용|상세)\s*\n+/i, '').trim();
    const normalizedTranscript = trimmedTranscript.trim();
    const isRawTranscriptCopy = normalizedContent === normalizedTranscript ||
                                 content.includes(trimmedTranscript) && content.length < trimmedTranscript.length * 1.5;

    // Check if title is just raw transcript copy-pasted
    const normalizedTitle = title.replace(/\.{3}$/, '').trim();
    const isRawTitleCopy = normalizedTranscript.startsWith(normalizedTitle) ||
                           normalizedTitle === normalizedTranscript.substring(0, normalizedTitle.length);

    if (isPlaceholderTitle || isPlaceholderContent || isWaitingForInput || isLazyResponse || isRawTranscriptCopy || isRawTitleCopy) {
      if (isRawTranscriptCopy) {
        console.warn("[Formatting] AI just copied raw transcript to content - creating summary fallback");
      }
      if (isRawTitleCopy) {
        console.warn("[Formatting] AI just copied raw transcript to title - creating summary fallback");
      }
      console.warn("[Formatting] AI returned placeholder/lazy/waiting-for-input response");
      console.warn("[Formatting] Raw response:", fullResponse.substring(0, 500));

      // If AI just said "short", is asking for input, or copied raw transcript, create a proper summary fallback
      if (isWaitingForInput || isLazyResponse || isRawTranscriptCopy || isRawTitleCopy) {
        console.warn("[Formatting] AI gave lazy response or asked for input - creating summary fallback");

        // Extract meaningful content for summary
        const words = trimmedTranscript.split(/\s+/).filter(w => w.length > 1);
        const keyPhrases = words.slice(0, Math.min(10, words.length)).join(' ');

        // Create summarized title - NOT raw transcript
        // Analyze content to generate appropriate title
        const lowerTranscript = trimmedTranscript.toLowerCase();
        if (lowerTranscript.includes('추') && lowerTranscript.includes('워')) {
          title = "날씨에 대한 짧은 이야기";
        } else if (lowerTranscript.includes('안녕') || lowerTranscript.includes('반갑')) {
          title = "짧은 인사 및 안부";
        } else if (lowerTranscript.includes('힘들') || lowerTranscript.includes('피곤')) {
          title = "컨디션에 대한 이야기";
        } else if (words.length <= 5) {
          title = "짧은 음성 메모";
        } else {
          title = "짧은 음성 기록";
        }

        // Create summarized content - never show raw transcript
        content = `### 📌 핵심 내용\n- ${keyPhrases}${words.length > 10 ? '...' : ''}\n\n### 📝 요약\n짧은 음성 메모입니다. 화자가 "${keyPhrases.substring(0, 30)}${keyPhrases.length > 30 ? '...' : ''}"라고 언급했습니다.`;
        console.warn("[Formatting] Created summary fallback (not raw transcript)");
      } else if (isPlaceholderContent) {
        // Try to extract content from raw response without tags
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
      if (isPlaceholderTitle && !isWaitingForInput && content.length > 0) {
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
