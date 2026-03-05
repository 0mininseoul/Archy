import test from "node:test";
import assert from "node:assert/strict";

import { strategicReviewInternals } from "./daily-runner.mjs";

const {
  buildStrategicReviewInput,
  parseStrategicReviewJson,
  renderStrategicReviewMarkdown,
  analyzeStrategicReview,
} = strategicReviewInternals;

test("parseStrategicReviewJson parses fenced JSON payload", () => {
  const raw = [
    "```json",
    JSON.stringify(
      {
        business_state: "온보딩과 활성화 지표가 개선되며 핵심 퍼널이 안정화되고 있습니다.",
        strengths: ["가입 유입이 전일 대비 증가했습니다."],
        risks: ["연동율 상승 폭이 제한적입니다."],
        priority_actions: [
          {
            action: "연동 실패 케이스 상위 3개 원인 점검",
            expected_effect: "연동율 단기 개선과 병목 제거",
          },
        ],
        data_check_requests: [],
      },
      null,
      2
    ),
    "```",
  ].join("\n");

  const parsed = parseStrategicReviewJson(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.priorityActions.length, 1);
});

test("parseStrategicReviewJson rejects invalid schema", () => {
  const raw = JSON.stringify({
    business_state: "짧은 상태 진단",
    strengths: ["강점"],
    risks: ["리스크"],
    priority_actions: [],
  });
  const parsed = parseStrategicReviewJson(raw);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "invalid_priority_actions");
});

test("renderStrategicReviewMarkdown satisfies section/action validation", () => {
  const rendered = renderStrategicReviewMarkdown({
    businessState:
      "신규 유입과 온보딩 흐름이 안정적으로 유지되고 있으며, 연동율 개선이 다음 성장 레버리지로 남아 있습니다. 전일 대비 가입전환율과 활성화율이 동반 상승했고 온보딩 이탈이 줄어 퍼널 효율이 개선됐습니다. 다만 연동 구간의 병목이 지속되어 성장 상한을 제한할 가능성이 있어 즉시 대응이 필요합니다.",
    strengths: [
      "신규 가입자 증가세가 유지되면서 상단 퍼널 유입이 안정화됐습니다.",
      "활성화율이 개선되어 실제 사용 전환이 동반 상승하고 있습니다.",
    ],
    risks: [
      "외부 툴 연동율 개선 속도가 느려 핵심 가치 체감까지 도달하는 비율이 제한됩니다.",
      "일부 유저의 연동 실패 반복 가능성이 남아 이탈 리스크가 누적될 수 있습니다.",
    ],
    priorityActions: [
      {
        action: "연동 중단 이벤트 원인 분석 자동화",
        expectedEffect: "연동율 개선과 활성화율 동반 상승",
      },
      {
        action: "온보딩 직후 연동 유도 메시지 A/B 테스트",
        expectedEffect: "초기 유저의 연동 전환율 상승",
      },
    ],
    dataCheckRequests: [
      "연동 실패 이벤트의 채널별 분해 데이터",
      "연동 성공까지의 평균 소요 시간 분포",
    ],
  });
  const analysis = analyzeStrategicReview(rendered);
  assert.equal(analysis.needsContinuation, false);
  assert.ok(rendered.includes("4) 내일 바로 실행할 우선순위 액션"));
});

test("buildStrategicReviewInput keeps compressed limits", () => {
  const input = buildStrategicReviewInput({
    metrics: {
      counts: { totalSignups: 100, dailyNewUsers: 3, dailyRecordings: 5 },
      rates: {
        onboarding: 0.9,
        pwa: 0.4,
        integrationAny: 0.2,
        activation30d: 0.3,
        payment: 0.01,
      },
      heavyUserTop3: [
        { name: "A", count: 10 },
        { name: "B", count: 8 },
        { name: "C", count: 6 },
      ],
    },
    amplitudeConversion: {
      currentRate: 0.12,
      previousRate: 0.1,
    },
    previousMetrics: {
      counts: { totalSignups: 97 },
      rates: {
        onboarding: 0.88,
        pwa: 0.39,
        integrationAny: 0.19,
        activation30d: 0.27,
        payment: 0.01,
      },
    },
    workProgress: {
      completed: ["a", "b", "c", "d", "e", "f"],
      pending: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      ascentum: {
        edits: [
          { text: "edit1", lastEdited: "2026-03-06T00:00:00.000Z" },
          { text: "edit2", lastEdited: "2026-03-06T00:01:00.000Z" },
          { text: "edit3", lastEdited: "2026-03-06T00:02:00.000Z" },
          { text: "edit4", lastEdited: "2026-03-06T00:03:00.000Z" },
          { text: "edit5", lastEdited: "2026-03-06T00:04:00.000Z" },
        ],
      },
    },
    targetYmd: "2026-03-05",
    projectContext: "x".repeat(10000),
    contextProfile: "compact",
  });

  assert.equal(input.input.workProgress.completedTop.length, 5);
  assert.equal(input.input.workProgress.pendingTop.length, 8);
  assert.equal(input.input.workProgress.recentEditsTop.length, 4);
  assert.ok(input.projectContext.length <= 2603);
});
