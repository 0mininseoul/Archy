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

  // Handle empty or whitespace-only transcripts
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    console.warn("[Formatting] Empty transcript provided");
    return {
      title: "빈 녹음",
      content: "📝 **녹음 내용이 없습니다.**\n\n음성이 인식되지 않았거나 녹음 중 오류가 발생했을 수 있습니다.",
    };
  }

  // 품질 분석
  const quality = analyzeTranscriptQuality(trimmedTranscript);
  console.log(`[Formatting] Transcript quality: ${quality}, word count: ${trimmedTranscript.split(/\s+/).length}`);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // 커스텀 프롬프트가 있으면 그것을 우선 사용, 아니면 품질 기반 프롬프트 사용
  let prompt: string;
  if (customPrompt) {
    prompt = customPrompt.replace("{{transcript}}", trimmedTranscript);
    console.log("[Formatting] Using custom format");
  } else {
    const { prompt: qualityPrompt } = buildPromptByQuality(trimmedTranscript);
    prompt = qualityPrompt;
    console.log(`[Formatting] Using ${quality} quality prompt`);
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
4. 녹취록 원본을 그대로 복사하여 붙여넣기 금지 - 반드시 요약/정리된 형태로 작성

✅ 필수:
- 녹취록 내용을 기반으로 핵심을 담은 제목 작성
- 녹취록 내용을 요약하여 [CONTENT] 안에 작성 (원본 복사 금지)
- 짧은 내용이라도 화자의 상황, 감정, 핵심 메시지를 파악하여 요약

응답 형식:
[TITLE]
녹취록 핵심을 담은 제목
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

    if (isPlaceholderTitle || isPlaceholderContent || isWaitingForInput || isLazyResponse || isRawTranscriptCopy) {
      if (isRawTranscriptCopy) {
        console.warn("[Formatting] AI just copied raw transcript - creating summary fallback");
      }
      console.warn("[Formatting] AI returned placeholder/lazy/waiting-for-input response");
      console.warn("[Formatting] Raw response:", fullResponse.substring(0, 500));

      // If AI just said "short", is asking for input, or copied raw transcript, create a proper summary fallback
      if (isWaitingForInput || isLazyResponse || isRawTranscriptCopy) {
        console.warn("[Formatting] AI gave lazy response or asked for input - creating summary fallback");

        // Extract meaningful content for summary
        const words = trimmedTranscript.split(/\s+/).filter(w => w.length > 1);
        const keyPhrases = words.slice(0, Math.min(10, words.length)).join(' ');

        // Create title from first meaningful phrase
        const firstMeaningful = trimmedTranscript.substring(0, 50).trim();
        title = firstMeaningful.length > 40 ? firstMeaningful.substring(0, 37) + "..." : firstMeaningful;

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

// Deprecated functions (kept to prevent import errors in other files until they are updated, 
// but in this plan I will be updating the caller immediately. 
// However, since I am editing this file first, I should remove them to strictly follow the plan 
// and fix the caller in the next step. But to avoid temporary build errors if I was running a watcher 
// (which I'm not), I'll just remove them.
