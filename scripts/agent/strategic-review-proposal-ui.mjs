export const STRATEGIC_REVIEW_PROPOSAL_BUTTON_PREFIX = "strategic-review-proposal";

const STRATEGIC_REVIEW_PROPOSAL_STATUS_META = Object.freeze({
  pending: { label: "대기중", color: 0xf39c12 },
  held: { label: "보류", color: 0x3498db },
  applied: { label: "적용됨", color: 0x2ecc71 },
  rejected: { label: "반려", color: 0xe74c3c },
});

const STRATEGIC_REVIEW_PROPOSAL_ACTIONS = new Set(["apply", "hold", "reject"]);

export function buildStrategicReviewProposalButtonCustomId(action, proposalId) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const numericProposalId = Number(proposalId);
  if (!STRATEGIC_REVIEW_PROPOSAL_ACTIONS.has(normalizedAction)) {
    throw new Error(`Unsupported proposal button action: ${action}`);
  }
  if (!Number.isInteger(numericProposalId) || numericProposalId <= 0) {
    throw new Error(`Invalid proposal id for button custom id: ${proposalId}`);
  }
  return `${STRATEGIC_REVIEW_PROPOSAL_BUTTON_PREFIX}:${normalizedAction}:${numericProposalId}`;
}

export function parseStrategicReviewProposalButtonCustomId(customId) {
  const raw = String(customId || "").trim();
  const match = raw.match(/^strategic-review-proposal:(apply|hold|reject):(\d+)$/i);
  if (!match) return null;
  return {
    action: match[1].toLowerCase(),
    proposalId: Number(match[2]),
  };
}

export function getStrategicReviewProposalStatusMeta(status) {
  const key = String(status || "pending").trim().toLowerCase();
  return STRATEGIC_REVIEW_PROPOSAL_STATUS_META[key] || STRATEGIC_REVIEW_PROPOSAL_STATUS_META.pending;
}
