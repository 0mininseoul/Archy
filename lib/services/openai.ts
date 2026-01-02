import OpenAI from "openai";
import { buildPrompt, FORMAT_PROMPTS } from "@/lib/prompts";

export interface FormatResult {
  title: string;
  content: string;
}

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
