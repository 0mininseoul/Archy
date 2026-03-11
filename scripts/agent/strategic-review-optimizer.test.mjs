import test from "node:test";
import assert from "node:assert/strict";

import { strategicReviewOptimizerInternals } from "./strategic-review-optimizer.mjs";

const {
  maybeLooksLikeStrategicReviewFeedback,
  parseStrategicReviewProposalDecision,
  coerceEvaluation,
  normalizeHardGateFailure,
} = strategicReviewOptimizerInternals;

test("proposal decision parser supports approval command", () => {
  const parsed = parseStrategicReviewProposalDecision("제안 승인 12: 지금 반영해");
  assert.deepEqual(parsed, {
    action: "apply",
    proposalId: 12,
    reason: "지금 반영해",
  });
});

test("feedback heuristic recognizes strategic review correction", () => {
  assert.equal(
    maybeLooksLikeStrategicReviewFeedback(
      "전략 리뷰 피드백: recent edits를 유저 데이터처럼 해석한 건 오류야"
    ),
    true
  );
  assert.equal(maybeLooksLikeStrategicReviewFeedback("오늘 가입전환율이 몇 퍼센트야?"), false);
});

test("evaluation coercion forces improvement on hard gate failure", () => {
  const evaluation = coerceEvaluation(
    {
      hard_gate_passed: false,
      hard_gate_failures: ["internal edit misread as customer usage evidence"],
      rubric_scores: {
        kpi_grounding: { score: 16, reason: "ok" },
        feedback_adjustment: { score: -6, reason: "user correction" },
      },
      total_score: 82,
      summary: "최근 내부 편집을 유저 데이터처럼 해석함",
      highest_priority_gap: "Ascentum 편집 해석 오류",
      improvement_needed: false,
      proposal: {
        title: "내부 편집 해석 가드 강화",
        problem_summary: "내부 편집 제목을 유저 데이터처럼 해석함",
        as_is: "최근 편집 제목을 why_now 근거로 사용",
        to_be: "내부 편집 제목 단독 근거 사용 금지",
        expected_effect: "사실성 개선",
        evidence: ["feedback 1건", "hard gate fail"],
        system_instruction_suffix: "운영자 내부 편집을 고객 데이터로 오인하지 마라.",
        prompt_instruction_suffix: "internalSignals는 내부 맥락용으로만 사용하라.",
      },
    },
    1
  );

  assert.equal(evaluation.hardGatePassed, false);
  assert.equal(evaluation.improvementNeeded, true);
  assert.deepEqual(evaluation.hardGateFailures, ["internal_note_used_as_customer_evidence"]);
  assert.equal(evaluation.proposal.title, "내부 편집 해석 가드 강화");
});

test("hard gate normalization keeps why_now violation machine-readable", () => {
  assert.equal(
    normalizeHardGateFailure("why_now must be anchored to KPI or operator task"),
    "why_now_missing_kpi_or_operator_task"
  );
});
