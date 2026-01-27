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
          content: `당신은 전문적인 문서 편집자입니다. 사용자가 제공한 녹취록을 읽기 쉽고 구조화된 형식으로 정리하는 것이 당신의 임무입니다.

⚠️ 절대 금지 사항:
1. 녹취록에 없는 내용을 만들어내지 마세요.
2. "녹취록을 제공해주세요", "내용을 입력해주세요" 등 입력을 요청하는 응답을 하지 마세요.
3. 녹취록이 짧거나 불완전해도, 있는 내용 그대로 정리하세요.

✅ 필수 수행 사항:
- 사용자 메시지에 포함된 녹취록 텍스트를 바로 정리하세요.
- 녹취록이 아무리 짧아도, 그 내용을 기반으로 제목과 요약을 작성하세요.
- 내용이 부족하면 "녹음 내용이 짧습니다"라고 명시하되, 있는 내용은 반드시 포함하세요.

응답 형식 (반드시 이 형식을 따르세요):

[TITLE]
녹취록 내용을 요약한 실제 제목
[/TITLE]
[CONTENT]
실제 정리된 내용을 마크다운 형식으로 작성
[/CONTENT]

주의: "(제목)", "(정리된 내용)" 같은 플레이스홀더나 "내용을 입력해주세요" 같은 요청 문구를 절대 출력하지 마세요.`,
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

    const isPlaceholderTitle = placeholderPatterns.some(p => p.test(title.trim()));
    const isPlaceholderContent = placeholderPatterns.some(p => p.test(content.trim()));
    const isWaitingForInput = waitingForInputPatterns.some(p => p.test(content));

    if (isPlaceholderTitle || isPlaceholderContent || isWaitingForInput) {
      console.warn("[Formatting] AI returned placeholder text or waiting-for-input response");
      console.warn("[Formatting] Raw response:", fullResponse.substring(0, 500));

      // If AI is asking for input instead of processing, use the transcript directly
      if (isWaitingForInput) {
        console.warn("[Formatting] AI asked for input instead of processing transcript");
        // Create a simple formatted version of the transcript
        const lines = trimmedTranscript.split('\n').filter(l => l.trim());
        const firstMeaningful = lines.find(l => l.trim().length > 3) || trimmedTranscript.substring(0, 50);

        title = firstMeaningful.substring(0, 40).trim();
        if (title.length >= 40) title += "...";

        content = `### 📝 녹음 내용\n\n${trimmedTranscript}`;
        console.warn("[Formatting] Falling back to raw transcript display");
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
