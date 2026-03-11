import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL, generateGeminiText } from "./daily-runner.mjs";
import {
  createStrategicReviewProposal,
  getOpenStrategicReviewProposal,
  getLatestCompletedStrategicReviewRun,
  listStrategicReviewFeedback,
  saveStrategicReviewEvaluation,
} from "./strategic-review-store.mjs";

function stripCodeFenceJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return raw;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(stripCodeFenceJson(text));
  } catch {
    return null;
  }
}

function clipText(text, maxChars = 2400) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTextArray(value, limit = 6) {
  return toArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeHardGateFailure(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("internal_note_used_as_customer_evidence") ||
    ((normalized.includes("internal") || normalized.includes("recent edit")) &&
      (normalized.includes("customer") ||
        normalized.includes("user data") ||
        normalized.includes("usage") ||
        normalized.includes("product demand")))
  ) {
    return "internal_note_used_as_customer_evidence";
  }
  if (
    normalized.includes("why_now_missing_kpi_or_operator_task") ||
    (normalized.includes("why_now") &&
      (normalized.includes("kpi") || normalized.includes("operator task")))
  ) {
    return "why_now_missing_kpi_or_operator_task";
  }
  return raw;
}

function maybeLooksLikeStrategicReviewFeedback(text, { isReplyToReview = false } = {}) {
  if (isReplyToReview) return true;
  const body = String(text || "").toLowerCase();
  const keywords = [
    "전략리뷰",
    "전략 리뷰",
    "이번 리뷰",
    "오늘 리뷰",
    "피드백",
    "why now",
    "우선순위 액션",
    "근거",
    "오류",
    "문제",
    "잘못",
    "추측",
    "재발",
    "수정 필요",
  ];
  return keywords.some((keyword) => body.includes(keyword));
}

export async function classifyStrategicReviewFeedback({
  text,
  reviewRun,
  isReplyToReview = false,
} = {}) {
  if (!reviewRun) return null;
  if (!maybeLooksLikeStrategicReviewFeedback(text, { isReplyToReview })) return null;

  const userText = String(text || "").trim();
  if (!userText) return null;

  const prompt = [
    "아래 Discord 멘션이 Archy Ops Agent의 데일리 전략 리뷰에 대한 피드백인지 분류하라.",
    "반드시 JSON만 출력하라.",
    "분류 기준:",
    "- 전략 리뷰의 사실성, 근거성, 액션 우선순위, 왜 지금 설명, 업무 맥락 해석, 과장/추측 여부를 지적하면 피드백이다.",
    "- 일반 질문이나 추가 작업 요청이면 피드백이 아니다.",
    "출력 형식:",
    '{',
    '  "is_feedback": true|false,',
    '  "sentiment": "positive|neutral|negative|mixed",',
    '  "summary": "한 문장 요약",',
    '  "categories": ["factual_error", "weak_grounding", "work_context_misread", "actionability", "tone", "other"],',
    '  "requested_changes": ["구체 요청"],',
    '  "confidence": 0.0',
    '}',
    "",
    "[최근 전략 리뷰 출력]",
    clipText(reviewRun.rendered_output || reviewRun.raw_output || "(없음)", 2600),
    "",
    "[사용자 멘션]",
    userText,
  ].join("\n");

  try {
    const raw = await generateGeminiText({
      model: GEMINI_FLASH_MODEL,
      systemInstruction:
        "너는 운영자 피드백 분류기다. 데일리 전략 리뷰에 대한 피드백인지 엄격하게 구분하고 JSON만 출력한다.",
      userPrompt: prompt,
      temperature: 0.1,
      maxOutputTokens: 600,
      logContext: {
        component: "discord-bot",
        flow: "strategic_review_feedback_classification",
        runId: reviewRun.run_id || null,
      },
    });
    const parsed = parseJsonSafe(raw);
    if (!parsed || !parsed.is_feedback) return null;
    return {
      isFeedback: true,
      sentiment: String(parsed.sentiment || "mixed").trim().toLowerCase(),
      summary: clipText(parsed.summary || userText, 500),
      categories: normalizeTextArray(parsed.categories, 6),
      requestedChanges: normalizeTextArray(parsed.requested_changes, 6),
      confidence: Number(parsed.confidence || 0),
      raw: parsed,
    };
  } catch {
    return {
      isFeedback: true,
      sentiment: "mixed",
      summary: clipText(userText, 500),
      categories: ["other"],
      requestedChanges: [],
      confidence: 0.2,
      raw: null,
    };
  }
}

function normalizeRubricScores(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!item || typeof item !== "object") continue;
    const score = Number(item.score);
    out[key] = {
      score: Number.isFinite(score) ? score : null,
      reason: clipText(item.reason || "", 300),
    };
  }
  return out;
}

function coerceEvaluation(parsed, feedbackCount = 0) {
  if (!parsed || typeof parsed !== "object") return null;
  const hardGateFailures = Array.from(
    new Set(normalizeTextArray(parsed.hard_gate_failures, 6).map((item) => normalizeHardGateFailure(item)).filter(Boolean))
  );
  const rubricScores = normalizeRubricScores(parsed.rubric_scores);
  const totalScore = Number(parsed.total_score);
  const improvementNeededByScore = Number.isFinite(totalScore) && totalScore <= 74;
  const improvementNeeded =
    Boolean(parsed.improvement_needed) || hardGateFailures.length > 0 || improvementNeededByScore;
  const proposal = parsed.proposal && typeof parsed.proposal === "object" ? parsed.proposal : null;

  return {
    hardGatePassed: !hardGateFailures.length && Boolean(parsed.hard_gate_passed !== false),
    hardGateFailures,
    rubricScores,
    totalScore: Number.isFinite(totalScore) ? Math.round(totalScore) : null,
    summary: clipText(parsed.summary || "", 700),
    highestPriorityGap: clipText(parsed.highest_priority_gap || "", 500),
    improvementNeeded,
    basedOnFeedback: feedbackCount > 0,
    proposal: proposal
      ? {
          title: clipText(proposal.title || "전략 리뷰 프롬프트 개선 제안", 120),
          problemSummary: clipText(proposal.problem_summary || "", 400),
          asIs: clipText(proposal.as_is || "", 300),
          toBe: clipText(proposal.to_be || "", 300),
          expectedEffect: clipText(proposal.expected_effect || "", 300),
          evidence: normalizeTextArray(proposal.evidence, 6),
          proposedSystemInstructionSuffix: clipText(
            proposal.system_instruction_suffix || "",
            1200
          ),
          proposedPromptInstructionSuffix: clipText(
            proposal.prompt_instruction_suffix || "",
            2000
          ),
        }
      : null,
    raw: parsed,
  };
}

async function evaluateReviewRun({ reviewRun, feedbackItems }) {
  const feedbackLines = (feedbackItems || []).map((item, idx) => {
    const summary = item.feedback_summary || item.feedback_text || "";
    const sentiment = item.sentiment || "mixed";
    return `${idx + 1}. (${sentiment}) ${clipText(summary, 500)}`;
  });

  const prompt = [
    "너는 Archy Ops Agent의 데일리 전략 리뷰 품질 심사관이다.",
    "출력은 JSON만 허용한다.",
    "목표:",
    "- 전략 리뷰가 Archy 유저 데이터와 운영자의 실제 업무 진행상황을 바르게 연결했는지 평가",
    "- 추측/과장/근거 약한 해석을 감점",
    "- 개선 필요 시 프롬프트 델타를 제안",
    "",
    "[중요 해석 규칙]",
    "- reviewRun.input_payload.internalSignals는 provenance record이며 운영자의 내부 노션 신호다.",
    "- classification이 product_workspace_note여도 고객 사용 데이터, Archy 유저의 실제 녹음/문서 누적, 프로덕트 usage 증가의 증거가 아니다.",
    '- internalSignals만 근거로 고객 usage/demand를 주장하면 hard_gate_failures에 "internal_note_used_as_customer_evidence"를 넣어라.',
    '- why_now가 KPI 또는 workProgress의 명시된 operator task와 직접 연결되지 않으면 "why_now_missing_kpi_or_operator_task"를 넣어라.',
    "",
    "[Rubric]",
    "- kpi_grounding: 0~20",
    "- metric_causal_linking: 0~15",
    "- work_progress_integration: 0~15",
    "- priority_judgment: 0~15",
    "- actionability: 0~15",
    "- expected_effect_clarity: 0~10",
    "- risk_detection: 0~5",
    "- uncertainty_handling: 0~5",
    "- operator_readability: 0~5",
    "- feedback_adjustment: -10~+10 (user feedback가 있을 때만 반영)",
    "",
    "[개선 필요 판단]",
    "- hard gate failure가 있으면 improvement_needed=true",
    "- 총점이 74 이하이면 improvement_needed=true",
    "- 사용자 피드백이 명시한 오류가 중대하면 improvement_needed=true",
    "",
    "[출력 형식]",
    "{",
    '  "hard_gate_passed": true|false,',
    '  "hard_gate_failures": ["string"],',
    '  "rubric_scores": {',
    '    "kpi_grounding": {"score": 0, "reason": "string"},',
    '    "metric_causal_linking": {"score": 0, "reason": "string"},',
    '    "work_progress_integration": {"score": 0, "reason": "string"},',
    '    "priority_judgment": {"score": 0, "reason": "string"},',
    '    "actionability": {"score": 0, "reason": "string"},',
    '    "expected_effect_clarity": {"score": 0, "reason": "string"},',
    '    "risk_detection": {"score": 0, "reason": "string"},',
    '    "uncertainty_handling": {"score": 0, "reason": "string"},',
    '    "operator_readability": {"score": 0, "reason": "string"},',
    '    "feedback_adjustment": {"score": 0, "reason": "string"}',
    "  },",
    '  "total_score": 0,',
    '  "summary": "string",',
    '  "highest_priority_gap": "string",',
    '  "improvement_needed": true|false,',
    '  "proposal": {',
    '    "title": "string",',
    '    "problem_summary": "string",',
    '    "as_is": "string",',
    '    "to_be": "string",',
    '    "expected_effect": "string",',
    '    "evidence": ["string"],',
    '    "system_instruction_suffix": "string",',
    '    "prompt_instruction_suffix": "string"',
    "  } | null",
    "}",
    "",
    "[System Instruction]",
    clipText(reviewRun.system_instruction || "(없음)", 2000),
    "",
    "[Input Payload]",
    JSON.stringify(reviewRun.input_payload || {}, null, 2),
    "",
    "[Rendered Output]",
    clipText(reviewRun.rendered_output || "(없음)", 5000),
    "",
    "[Raw Output]",
    clipText(reviewRun.raw_output || "(없음)", 5000),
    "",
    "[User Feedback]",
    feedbackLines.length > 0 ? feedbackLines.join("\n") : "(없음)",
  ].join("\n");

  const raw = await generateGeminiText({
    model: GEMINI_PRO_MODEL,
    systemInstruction:
      "너는 전략 리뷰 품질 평가기이자 프롬프트 개선 제안기다. 엄격하게 채점하고 JSON만 출력한다.",
    userPrompt: prompt,
    temperature: 0.1,
    maxOutputTokens: 2400,
    timeoutMs: 90_000,
    maxRetries: 1,
    logContext: {
      component: "discord-bot",
      flow: "strategic_review_evaluation",
      runId: reviewRun.run_id || null,
    },
  });

  const parsed = parseJsonSafe(raw);
  return coerceEvaluation(parsed, feedbackItems.length);
}

export async function runStrategicReviewOptimizationCycle() {
  const openProposal = await getOpenStrategicReviewProposal();
  if (openProposal) {
    return {
      status: "skipped",
      reason: "open_proposal_exists",
      proposal: openProposal,
    };
  }

  const reviewRun = await getLatestCompletedStrategicReviewRun({ withinHours: 23 });
  if (!reviewRun) {
    return {
      status: "skipped",
      reason: "no_recent_review",
    };
  }

  const feedbackItems = await listStrategicReviewFeedback(reviewRun.id);
  const evaluation = await evaluateReviewRun({ reviewRun, feedbackItems });
  if (!evaluation) {
    return {
      status: "skipped",
      reason: "evaluation_parse_failed",
      reviewRun,
    };
  }

  const evaluationRow = await saveStrategicReviewEvaluation({
    reviewRunId: reviewRun.id,
    evaluatorModel: GEMINI_PRO_MODEL,
    hardGatePassed: evaluation.hardGatePassed,
    totalScore: evaluation.totalScore,
    rubricScores: evaluation.rubricScores,
    hardGateFailures: evaluation.hardGateFailures,
    summary: evaluation.summary,
    highestPriorityGap: evaluation.highestPriorityGap,
    improvementNeeded: evaluation.improvementNeeded,
    basedOnFeedback: evaluation.basedOnFeedback,
    rawOutput: evaluation.raw,
  });

  if (!evaluation.improvementNeeded || !evaluation.proposal) {
    return {
      status: "evaluated",
      reason: "no_improvement_needed",
      reviewRun,
      evaluation: evaluationRow || evaluation,
    };
  }

  const proposal = await createStrategicReviewProposal({
    reviewRunId: reviewRun.id,
    evaluationId: evaluationRow?.id || null,
    status: "pending",
    title: evaluation.proposal.title,
    problemSummary: evaluation.proposal.problemSummary || evaluation.summary,
    asIs: evaluation.proposal.asIs,
    toBe: evaluation.proposal.toBe,
    expectedEffect: evaluation.proposal.expectedEffect,
    evidence: evaluation.proposal.evidence,
    proposedSystemInstructionSuffix: evaluation.proposal.proposedSystemInstructionSuffix,
    proposedPromptInstructionSuffix: evaluation.proposal.proposedPromptInstructionSuffix,
    evaluationScore: evaluation.totalScore,
    metadata: {
      highestPriorityGap: evaluation.highestPriorityGap,
      basedOnFeedback: evaluation.basedOnFeedback,
    },
  });

  return {
    status: proposal ? "proposal_created" : "evaluated",
    reviewRun,
    evaluation: evaluationRow || evaluation,
    proposal,
  };
}

export function parseStrategicReviewProposalDecision(text) {
  const body = String(text || "").trim();
  const match = body.match(
    /(?:전략\s*리뷰|전략리뷰)?\s*제안\s*(승인|보류|반려)(?:\s+(\d+))?(?:\s*[:\-]\s*([\s\S]+))?/i
  );
  if (!match) return null;
  const actionMap = {
    승인: "apply",
    보류: "hold",
    반려: "reject",
  };
  return {
    action: actionMap[match[1]] || null,
    proposalId: match[2] ? Number(match[2]) : null,
    reason: String(match[3] || "").trim() || null,
  };
}

export const strategicReviewOptimizerInternals = Object.freeze({
  maybeLooksLikeStrategicReviewFeedback,
  parseStrategicReviewProposalDecision,
  coerceEvaluation,
  normalizeHardGateFailure,
});
