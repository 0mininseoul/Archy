import test from "node:test";
import assert from "node:assert/strict";

import { strategicReviewInternals } from "./daily-runner.mjs";

const {
  buildStrategicReviewInput,
  buildStrategicReviewInternalSignalRecord,
  classifyStrategicReviewInternalSignal,
  buildStrategicReviewSystemInstruction,
  buildStrategicReviewPrompt,
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
            why_now: "최근 3일 연동율 정체로 개선 지연 시 활성화율 하락 리스크가 커집니다.",
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
  assert.equal(
    parsed.value.priorityActions[0].whyNow,
    "최근 3일 연동율 정체로 개선 지연 시 활성화율 하락 리스크가 커집니다."
  );
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
        whyNow: "현재 병목 구간이 연동 단계에 집중되어 즉시 원인 파악이 필요합니다.",
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
  assert.ok(rendered.includes("왜 지금"));
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
      summaryText: "업무 요약",
      internalSignals: [
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum"],
          nodeType: "paragraph",
          nodeText: "edit1",
          lastEdited: "2026-03-06T00:00:00.000Z",
          classification: "internal_note",
          allowedUse: ["operator_context"],
          forbiddenUse: ["customer_usage_evidence"],
          confidence: 0.76,
        },
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum", "아키(Archy) | AI 노트테이커"],
          nodeType: "child_page",
          nodeText: "edit2",
          lastEdited: "2026-03-06T00:01:00.000Z",
          classification: "product_workspace_note",
          allowedUse: ["operator_context"],
          forbiddenUse: ["customer_usage_evidence"],
          confidence: 0.95,
        },
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum"],
          nodeType: "paragraph",
          nodeText: "edit3",
          lastEdited: "2026-03-06T00:02:00.000Z",
          classification: "internal_note",
          allowedUse: ["operator_context"],
          forbiddenUse: ["customer_usage_evidence"],
          confidence: 0.76,
        },
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum"],
          nodeType: "paragraph",
          nodeText: "edit4",
          lastEdited: "2026-03-06T00:03:00.000Z",
          classification: "internal_note",
          allowedUse: ["operator_context"],
          forbiddenUse: ["customer_usage_evidence"],
          confidence: 0.76,
        },
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum"],
          nodeType: "paragraph",
          nodeText: "edit5",
          lastEdited: "2026-03-06T00:04:00.000Z",
          classification: "internal_note",
          allowedUse: ["operator_context"],
          forbiddenUse: ["customer_usage_evidence"],
          confidence: 0.76,
        },
      ],
    },
    targetYmd: "2026-03-05",
    projectContext: "x".repeat(10000),
    contextProfile: "compact",
  });

  assert.equal(input.input.metrics.kpis.totalSignups.current, 100);
  assert.equal(input.input.workProgress.completedTop.length, 5);
  assert.equal(input.input.workProgress.pendingTop.length, 8);
  assert.equal(input.input.internalSignals.length, 4);
  assert.equal(input.input.workProgress.summary, "업무 요약");
  assert.equal(input.input.workProgress.summaryScope, "todo_db_only");
  assert.ok(input.projectContext.length <= 3203);
});

test("strategic review prompt guards against misreading internal edits as user data", () => {
  const strategicInput = buildStrategicReviewInput({
    metrics: {
      counts: { totalSignups: 10, dailyNewUsers: 1, dailyRecordings: 2 },
      rates: {
        onboarding: 0.8,
        pwa: 0.4,
        integrationAny: 0.2,
        activation30d: 0.3,
        payment: 0,
      },
      heavyUserTop3: [],
    },
    amplitudeConversion: {
      currentRate: 0.1,
      previousRate: 0.09,
    },
    previousMetrics: {
      counts: { totalSignups: 9 },
      rates: {
        onboarding: 0.79,
        pwa: 0.39,
        integrationAny: 0.21,
        activation30d: 0.29,
        payment: 0,
      },
    },
    workProgress: {
      completed: ["0312 이민섭교수님 미팅 준비"],
      pending: ["요약문 내용 퀄리티 up"],
      summaryText: "업무 페이지 요약",
      internalSignals: [
        {
          rootId: "root-1",
          rootTitle: "Ascentum",
          pathTitles: ["Ascentum", "아키(Archy) | AI 노트테이커", "이민섭교수님 미팅 0312"],
          nodeType: "child_page",
          nodeText: "이민섭교수님 미팅 0312",
          lastEdited: "2026-03-11T13:51:00.000Z",
          classification: "product_workspace_note",
          allowedUse: ["operator_context", "product_workspace_preparation"],
          forbiddenUse: ["customer_usage_evidence", "why_now_without_kpi_or_operator_task"],
          confidence: 0.95,
        },
      ],
    },
    targetYmd: "2026-03-11",
    projectContext: "context",
  });

  const systemInstruction = buildStrategicReviewSystemInstruction();
  const prompt = buildStrategicReviewPrompt({ strategicInput });

  assert.match(systemInstruction, /internalSignals는 provenance가 붙은 운영자 내부 노션 신호/);
  assert.match(prompt, /classification이 product_workspace_note여도 고객 사용량/);
  assert.match(prompt, /internalSignals 단독 근거를 금지/);
});

test("internal signal classification keeps product workspace note separate from customer evidence", () => {
  const classification = classifyStrategicReviewInternalSignal({
    pathTitles: ["Ascentum", "아키(Archy) | AI 노트테이커", "이민섭교수님 미팅 0312"],
  });
  assert.equal(classification, "product_workspace_note");

  const record = buildStrategicReviewInternalSignalRecord({
    rootPage: { id: "root-1", title: "Ascentum" },
    pathTitles: ["Ascentum", "아키(Archy) | AI 노트테이커", "이민섭교수님 미팅 0312"],
    block: {
      type: "child_page",
      last_edited_time: "2026-03-11T13:51:00.000Z",
    },
    text: "이민섭교수님 미팅 0312",
  });

  assert.equal(record.classification, "product_workspace_note");
  assert.ok(record.forbiddenUse.includes("customer_usage_evidence"));
  assert.deepEqual(record.pathTitles, [
    "Ascentum",
    "아키(Archy) | AI 노트테이커",
    "이민섭교수님 미팅 0312",
  ]);
});
