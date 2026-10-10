import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canFinalizeClaim,
  claimSecondsRemaining,
  formatCountdown,
  isClaimWindowOpen,
} from "../src/lib/claim-window.ts";

const deadline = 1_700_000_000n;

test("counts a fresh 24-hour claim window down from the onchain deadline", () => {
  const openedAt = Number(deadline) - 24 * 60 * 60;
  assert.equal(claimSecondsRemaining(deadline, openedAt), 24 * 60 * 60);
  assert.equal(formatCountdown(24 * 60 * 60), "24h 0m 0s");
  assert.equal(formatCountdown(3661), "1h 1m 1s");
  assert.equal(isClaimWindowOpen(deadline, openedAt), true);
  assert.equal(canFinalizeClaim(deadline, openedAt), false);
});

test("enables finalize only after the recorded deadline", () => {
  assert.equal(claimSecondsRemaining(deadline, Number(deadline)), 0);
  assert.equal(isClaimWindowOpen(deadline, Number(deadline)), false);
  assert.equal(canFinalizeClaim(deadline, Number(deadline)), true);
  assert.equal(canFinalizeClaim(deadline, Number(deadline) + 90), true);
  assert.equal(formatCountdown(0), "0h 0m 0s");
});

test("keeps finalize unavailable until a positive deadline is visible", () => {
  assert.equal(canFinalizeClaim(undefined, Number(deadline)), false);
  assert.equal(canFinalizeClaim(0n, Number(deadline)), false);
  assert.equal(isClaimWindowOpen(0n, Number(deadline)), false);
  assert.equal(claimSecondsRemaining(-1n, Number(deadline)), 0);
});
