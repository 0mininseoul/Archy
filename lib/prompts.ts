import { formatKSTDate } from "./utils";

// Universal Prompt for flexible summarization
const UNIVERSAL_PROMPT = `당신은 전문 에디터이자 콘텐츠 요약 전문가입니다. 
주어진 녹취록을 분석하여 핵심 내용을 파악하고, 읽기 쉬운 마크다운 문서로 정리해주세요.

## 녹취록
{{transcript}}

## 필수 요구사항
다음 규칙을 엄격히 준수하세요:

1. **제목**: 문서의 내용을 한 줄로 명확하게 요약하는 제목을 작성하세요.
2. **3줄 핵심 요약**: 제목 바로 아래에, 전체 내용을 관통하는 **가장 중요한 3가지 핵심 내용**을 요약해서 적어주세요. 이 부분은 반드시 있어야 합니다.
3. **유연한 본문 구성**: 3줄 요약 이후의 내용은 녹취록의 성격에 따라 자유롭게 구성하되, **반드시 소제목(##, ###)을 사용하여 구조화**해주세요. 줄글로만 길게 늘어놓지 마세요.
   - **회의라면**: ## 안건, ## 결정 사항, ## 액션 아이템 등으로 섹션 구분.
   - **강의라면**: ## 학습 목표, ## 주요 개념, ## 핵심 요점 등으로 섹션 구분.
   - **단순 대화라면**: ## 주요 대화 흐름, ## 결론 등으로 섹션 구분.
   - **억지스러운 구조화 금지**: 내용이 없는데 억지로 섹션을 만들지는 마세요. 하지만 가능한 한 구조적으로 정리해주세요.

## 출력 형식
반드시 아래 형식을 지켜주세요:

[TITLE]
(제목)
[/TITLE]
[CONTENT]
### 📌 3줄 핵심 요약
- (핵심 1)
- (핵심 2)
- (핵심 3)

(이후 내용은 자유롭게 마크다운으로 작성... 적절한 이모지 사용 권장)
[/CONTENT]`;

export function buildUniversalPrompt(transcript: string): string {
  const date = formatKSTDate();
  return UNIVERSAL_PROMPT
    .replace("{{transcript}}", transcript)
    .replace("{{date}}", date); // date might not be used in the new prompt but kept for future potential use or if we add it back. Currently the prompt text doesn't have {{date}}, but good to keep the util import.
}

// Deprecated: Kept types for compatibility if needed elsewhere, or can be removed if fully refactored.
// For now, removing unused types/exports as per plan.

