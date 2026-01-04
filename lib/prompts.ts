import { formatKSTDate } from "./utils";
import fs from "fs";
import path from "path";

// 마크다운 파일에서 포맷 템플릿 읽기
function loadFormatTemplate(filename: string): string {
  try {
    const filePath = path.join(process.cwd(), "lib", "formats", filename);
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(`Failed to load format template: ${filename}`, error);
    return "";
  }
}

// 미팅 포맷 프롬프트 생성
function buildMeetingPrompt(transcript: string): string {
  const template = loadFormatTemplate("meeting.md");
  const date = formatKSTDate();

  return `당신은 전문 회의록 작성자입니다. 다음 회의 녹취록을 보고 구조화된 회의록을 작성해주세요.

## 녹취록
${transcript}

## 작성 지침
1. 회의 정보(일시, 참석자, 목적)를 추출하세요
2. 주요 안건과 논의 내용을 정리하세요
3. 결정 사항을 명확히 기록하세요
4. **액션 아이템은 반드시 담당자와 기한을 포함해서 작성하세요** (이것이 가장 중요합니다)
5. 다음 회의 일정이 언급되었다면 기록하세요
6. 각 섹션 제목 앞에 적절한 이모지를 사용하세요

## 출력 형식 (아래 템플릿을 참고하여 작성)
${template.replace(/\{\{date\}\}/g, date)}`;
}

// 강의 포맷 프롬프트 생성
function buildLecturePrompt(transcript: string): string {
  const template = loadFormatTemplate("lecture.md");
  const date = formatKSTDate();

  return `당신은 전문 강의 노트 작성자입니다. 다음 강의 녹취록을 보고 학습에 최적화된 강의 노트를 작성해주세요.

## 녹취록
${transcript}

## 작성 지침
1. 강의 정보(주제, 강사)를 추출하세요
2. 학습 목표를 정리하세요
3. 내용을 논리적인 섹션으로 구분하세요
4. 핵심 개념을 표로 정리하세요
5. 가장 중요한 요점 5개를 정리하세요
6. 각 섹션 제목 앞에 적절한 이모지를 사용하세요

## 출력 형식 (아래 템플릿을 참고하여 작성)
${template.replace(/\{\{date\}\}/g, date)}`;
}

// 콘텐츠 유형 판단을 위한 프롬프트
export const CONTENT_TYPE_DETECTION_PROMPT = `다음 녹취록의 내용을 분석하여 어떤 유형의 콘텐츠인지 판단해주세요.

## 녹취록
{{transcript}}

## 판단 기준
- **meeting**: 여러 명이 참여하여 안건을 논의하고, 결정 사항이나 액션 아이템이 있는 경우
  - 키워드: 회의, 미팅, 논의, 결정, 담당자, 다음 주까지, 진행 상황, 보고, 의견
  - 특징: 대화 참여자가 2명 이상, 질문과 답변이 오가는 형태, 업무 관련 논의

- **lecture**: 한 명이 주로 설명하고, 학습이나 정보 전달이 목적인 경우
  - 키워드: 수업, 강의, 오늘 배울, 정리하면, 예를 들어, 중요한 점, 개념, 이론
  - 특징: 일방향 설명이 주를 이룸, 교육적 내용, 개념 설명

## 응답 형식
반드시 다음 중 하나만 응답하세요 (따옴표나 다른 텍스트 없이):
meeting
lecture`;

// 레거시 포맷 (하위 호환성 유지) - 동적으로 생성
export const FORMAT_PROMPTS = {
  meeting: "meeting", // placeholder - 실제로는 buildMeetingPrompt 사용
  interview: `다음 인터뷰 녹취록을 Q&A 형식으로 정리해주세요:

{{transcript}}

다음 형식으로 정리해주세요:

# 🎙️ 인터뷰 정리

## 📅 인터뷰 개요
- **일시**: {{date}}
- **인터뷰이**: [추출]
- **주제**: [추출]

---

## 💬 질문과 답변

### ❓ Q1. [질문]
> **A.** [답변 요약]

### ❓ Q2. [질문]
> **A.** [답변 요약]

---

## 💡 핵심 인사이트
- [인사이트 1]
- [인사이트 2]
- [인사이트 3]`,

  lecture: "lecture", // placeholder - 실제로는 buildLecturePrompt 사용
};

export type ContentType = "meeting" | "lecture";

export function buildPrompt(
  format: keyof typeof FORMAT_PROMPTS,
  transcript: string,
  customPrompt?: string
): string {
  // 커스텀 프롬프트가 있으면 그대로 사용
  if (customPrompt) {
    const date = formatKSTDate();
    return customPrompt
      .replace(/\{\{transcript\}\}/g, transcript)
      .replace(/\{\{date\}\}/g, date);
  }

  // 포맷에 따라 마크다운 파일 기반 프롬프트 생성
  if (format === "meeting") {
    return buildMeetingPrompt(transcript);
  } else if (format === "lecture") {
    return buildLecturePrompt(transcript);
  }

  // 인터뷰 등 기타 포맷
  const template = FORMAT_PROMPTS[format];
  const date = formatKSTDate();
  return template
    .replace(/\{\{transcript\}\}/g, transcript)
    .replace(/\{\{date\}\}/g, date);
}

export function buildDetectionPrompt(transcript: string): string {
  return CONTENT_TYPE_DETECTION_PROMPT.replace("{{transcript}}", transcript);
}

export function buildFormatPrompt(
  contentType: ContentType,
  transcript: string
): string {
  if (contentType === "meeting") {
    return buildMeetingPrompt(transcript);
  } else {
    return buildLecturePrompt(transcript);
  }
}
