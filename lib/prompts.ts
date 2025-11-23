import { formatKSTDate } from "./utils";

export const FORMAT_PROMPTS = {
  meeting: `다음 회의 녹취록을 회의록 형식으로 정리해주세요:

{{transcript}}

다음 형식으로 정리해주세요:

## 회의 정보
- 일시: {{date}}
- 참석자: [녹취록에서 추출]

## 주요 안건
1.
2.

## 결정 사항
-

## 액션 아이템
- [ ]
- [ ]

## 다음 회의
- `,

  interview: `다음 인터뷰 녹취록을 Q&A 형식으로 정리해주세요:

{{transcript}}

다음 형식으로 정리해주세요:

## 인터뷰 개요
- 인터뷰이:
- 주제:

## 질문과 답변

**Q1. [질문]**
A. [답변 요약]

**Q2. [질문]**
A. [답변 요약]

## 핵심 인사이트
- `,

  lecture: `다음 강의 녹취록을 요약본 형식으로 정리해주세요:

{{transcript}}

다음 형식으로 정리해주세요:

## 강의 정보
- 주제:
- 핵심 개념:

## 주요 내용
### 1. [섹션명]
-

### 2. [섹션명]
-

## 핵심 요점 정리
1.
2.
3.

## 추가 학습 추천
- `,
};

export function buildPrompt(
  format: keyof typeof FORMAT_PROMPTS,
  transcript: string,
  customPrompt?: string
): string {
  const template = customPrompt || FORMAT_PROMPTS[format];
  const date = formatKSTDate();

  return template
    .replace("{{transcript}}", transcript)
    .replace("{{date}}", date);
}
