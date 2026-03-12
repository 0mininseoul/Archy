interface SummaryDetailRequirements {
  bodySectionCount: string;
  coreBulletCount: string;
  minContentLength: number;
  perSectionBulletCount: string;
}

export function getSummaryDetailRequirements(
  transcriptLength: number
): SummaryDetailRequirements {
  if (transcriptLength <= 300) {
    return {
      bodySectionCount: "1-2개",
      coreBulletCount: "1-3개",
      minContentLength: 0,
      perSectionBulletCount: "1-2개",
    };
  }

  if (transcriptLength <= 1200) {
    return {
      bodySectionCount: "2-4개",
      coreBulletCount: "3-5개",
      minContentLength: 450,
      perSectionBulletCount: "2-3개",
    };
  }

  if (transcriptLength <= 4000) {
    return {
      bodySectionCount: "3-5개",
      coreBulletCount: "4-6개",
      minContentLength: 850,
      perSectionBulletCount: "2-4개",
    };
  }

  if (transcriptLength <= 12000) {
    return {
      bodySectionCount: "4-6개",
      coreBulletCount: "6-8개",
      minContentLength: 1600,
      perSectionBulletCount: "3-5개",
    };
  }

  return {
    bodySectionCount: "5-7개",
    coreBulletCount: "7-10개",
    minContentLength: 2200,
    perSectionBulletCount: "3-6개",
  };
}

function getDetailGuide(transcriptLength: number): string {
  const requirements = getSummaryDetailRequirements(transcriptLength);

  if (transcriptLength <= 300) {
    return [
      "- 매우 짧은 녹취: 핵심 요약 1-3개 bullet + 1-2개 짧은 섹션이면 충분합니다.",
      "- 다만 일정, 수치, 해야 할 일처럼 중요한 정보는 빠뜨리지 마세요.",
    ].join("\n");
  }

  if (transcriptLength <= 1200) {
    return [
      "- 짧은 녹취: 핵심 요약 3-5개 bullet + 2-4개 섹션으로 정리하세요.",
      "- 핵심 논점, 결정, 예시, 일정, 수치가 있으면 본문에 구체적으로 남기세요.",
    ].join("\n");
  }

  if (transcriptLength <= 4000) {
    return [
      "- 중간 길이 녹취: 핵심 요약 4-6개 bullet + 3-5개 섹션으로 정리하세요.",
      "- 섹션마다 2-4개의 세부 bullet 또는 충분한 설명을 포함해, 다시 듣지 않아도 맥락이 복기되게 하세요.",
      `- 가능하면 ${requirements.minContentLength}자 이상 분량으로 작성하세요.`,
    ].join("\n");
  }

  if (transcriptLength <= 12000) {
    return [
      `- 긴 녹취: 핵심 요약 ${requirements.coreBulletCount} bullet + ${requirements.bodySectionCount} 섹션으로 충분히 상세하게 정리하세요.`,
      `- 각 섹션은 추상적인 한 문장으로 끝내지 말고, ${requirements.perSectionBulletCount}개의 세부 bullet 또는 충분한 설명으로 개념/논리/단계/예시를 풀어 쓰세요.`,
      `- 요약문이 지나치게 짧아 보이지 않게, 최소 ${requirements.minContentLength}자 이상 분량을 목표로 하세요.`,
    ].join("\n");
  }

  return [
    `- 매우 긴 녹취: 핵심 요약 ${requirements.coreBulletCount} bullet + ${requirements.bodySectionCount} 섹션으로 상세 문서처럼 정리하세요.`,
    `- 전문 지식, 절차, 평가 방식, 예시, 수치, 일정, 예외를 최대한 보존하고, 각 섹션은 ${requirements.perSectionBulletCount}개의 세부 bullet 또는 충분한 설명으로 풀어 쓰세요.`,
    `- 억지로 짧게 압축하지 말고, 최소 ${requirements.minContentLength}자 이상 분량을 목표로 하세요.`,
  ].join("\n");
}

function buildUniversalPromptTemplate(detailGuide: string): string {
  return `당신은 전문 에디터이자 강의/회의 문서화 전문가입니다.
아래 녹취록을 분석하여, 지나치게 압축하지 말고 나중에 다시 참고할 수 있는 수준의 구조화된 마크다운 문서로 정리해주세요.

## 녹취록
<<<TRANSCRIPT>>>
{{transcript}}
<<<END_TRANSCRIPT>>>

## 작업 목표
- 이 문서는 원문 녹음을 다시 듣지 않아도 핵심과 세부를 복기할 수 있어야 합니다.
- 짧지 않은 녹취는 "짧은 요약"이 아니라, 핵심과 세부 설명이 함께 살아 있는 상세 요약이어야 합니다.
- 특히 강의, 설명, 수업, 전문 지식 전달 내용은 개념과 원리, 절차, 예시가 구체적으로 정리되어야 합니다.

## 핵심 원칙
1. **녹취록에 있는 내용만** 정리하세요. 없는 내용을 추가하거나 추측하지 마세요.
2. **중요한 구체성을 보존**하세요.
   - 사람/조직/서비스명, 날짜, 시간, 수치, 점수, 비율, 조건, 예외, 단계, 공식, 입력값/출력값, 약어가 나오면 가능한 한 남기세요.
   - 여러 내용을 "중요성이 강조되었다", "다양한 논의가 있었다" 같은 일반론 한 문장으로 뭉개지 마세요.
3. **길이와 밀도는 녹취 길이에 비례**해야 합니다.
${detailGuide}
4. 불명확한 부분은 "[불명확]"으로 표시하되, 앞뒤 맥락은 최대한 보존하세요.
5. 군말, 반복, STT 잡음, 호명, 의미 없는 추임새는 줄여도 되지만, 의미 있는 사례/질문/반론/결론은 남기세요.
6. 한 녹취 안에 서로 다른 성격의 내용이 섞여 있으면 섹션을 분리하세요.
   - 예: "수업 운영 공지"와 "강의 내용"
   - 예: "회의 배경"과 "결정 사항"
7. 일반적인 마무리 문장이나 추상적 결론으로 분량을 채우지 마세요. 그 공간은 구체적 사실, 규칙, 예시, 일정, 수치, 논리 설명에 사용하세요.

## 내용 유형별 정리 방식
- **회의/미팅**
  - 배경, 핵심 논의, 결정 사항, 액션 아이템, 남은 쟁점으로 구분하세요.
  - 무엇을 왜 그렇게 하기로 했는지, 일정과 담당이 있으면 함께 적으세요.
- **강의/설명/학습**
  - 다룬 주제, 핵심 개념, 개념 간 관계, 단계별 설명, 문제 풀이/예시, 실무적 함의, 과제/시험/운영 공지를 구분하세요.
  - 전문 용어는 원문 표현을 살리고, 필요한 경우 짧게 풀어서 정리하세요.
  - 원리나 절차가 설명되면 순서대로 풀어 적고, 수식/조건/예외가 나오면 생략하지 마세요.
- **브레인스토밍/아이디어**
  - 문제 정의, 가설, 제안된 해결책, 장단점, 비용/리스크, 다음 검증 항목을 구분하세요.
- **일정/행정 안내**
  - 변경 전/후 일정, 적용 대상, 준비 사항, 예외, 주의사항을 명확히 적으세요.

## 제목
- 녹취록의 전체 맥락을 드러내는 구체적인 제목 1줄을 작성하세요.
- 녹취록 첫 문장 복사 금지, "짧은 음성 메모" 같은 일반적인 제목 금지

## 본문 작성 규칙
1. 맨 앞에 **핵심 요약** 섹션을 두세요.
2. 핵심 요약 bullet 수와 본문 섹션 수는 위의 "길이와 밀도" 가이드를 따르세요.
   - 짧은 녹취에는 불필요하게 많은 bullet/섹션을 강요하지 마세요.
   - 긴 녹취에는 충분한 bullet/섹션을 사용해 정보 손실을 줄이세요.
3. 각 섹션은 한 문장짜리 추상 요약으로 끝내지 말고, 필요한 경우 bullet 여러 개로 세부 사항을 풀어 쓰세요.
4. 강의/전문 설명에서는 아래 요소를 우선 보존하세요.
   - 개념 정의
   - 원리/메커니즘
   - 단계/절차
   - 공식/수치/조건
   - 예시/비유
   - 시험/과제/평가/일정
5. 긴 녹취에서는 섹션마다 적어도 3개 이상의 구체 항목을 남기고, 정보가 많으면 더 길게 쓰세요.
6. 녹취가 길고 정보 밀도가 높으면 문서를 충분히 길게 작성하세요. 억지로 짧게 줄이지 마세요.

## 절대 금지
- "(제목)", "(핵심 1)" 같은 플레이스홀더 출력
- "녹취록을 제공해주세요" 같은 입력 요청 문구
- 녹취록 원문을 큰 덩어리로 그대로 복사해 붙여넣기
- "녹음 내용이 짧습니다" 같은 메타 코멘트
- 구체적 내용이 있는데도 추상적인 문장만 반복하는 요약`;
}

export function buildUniversalPrompt(transcript: string): string {
  const detailGuide = getDetailGuide(transcript.length);
  return buildUniversalPromptTemplate(detailGuide).replace("{{transcript}}", transcript);
}
