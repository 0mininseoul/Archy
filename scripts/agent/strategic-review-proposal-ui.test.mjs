import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStrategicReviewProposalButtonCustomId,
  getStrategicReviewProposalStatusMeta,
  parseStrategicReviewProposalButtonCustomId,
} from "./strategic-review-proposal-ui.mjs";

test("proposal button custom id round-trips with exact format", () => {
  const customId = buildStrategicReviewProposalButtonCustomId("apply", 12);
  assert.equal(customId, "strategic-review-proposal:apply:12");
  assert.deepEqual(parseStrategicReviewProposalButtonCustomId(customId), {
    action: "apply",
    proposalId: 12,
  });
});

test("proposal button parser rejects unrelated ids", () => {
  assert.equal(parseStrategicReviewProposalButtonCustomId("foo:bar"), null);
  assert.equal(parseStrategicReviewProposalButtonCustomId("strategic-review-proposal:approve:1"), null);
});

test("proposal status meta returns held state label", () => {
  assert.deepEqual(getStrategicReviewProposalStatusMeta("held"), {
    label: "보류",
    color: 0x3498db,
  });
});
