import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRefreshCurrent,
  shouldStopRefresh,
  startRefreshGeneration,
} from "../src/lib/refresh-reads.ts";
import { expectIncreased, expectRentalStatus, statusIs } from "../src/lib/rental-state.ts";

const base = {
  maxAttempts: 8,
  latestBlock: 20n,
  receiptBlock: 20n,
};

test("keeps reading after the first confirmation so a stale public RPC can catch up", () => {
  assert.equal(
    shouldStopRefresh({ ...base, attempt: 0, expectedMatched: true, matchedSince: 0 }),
    false,
  );
  assert.equal(shouldStopRefresh({ ...base, attempt: 3 }), false);
  assert.equal(
    shouldStopRefresh({ ...base, attempt: 4, expectedMatched: false, matchedSince: undefined }),
    false,
  );
});

test("stops once the expected state is seen again at the receipt block", () => {
  assert.equal(
    shouldStopRefresh({ ...base, attempt: 2, expectedMatched: true, matchedSince: 1 }),
    true,
  );
});

test("keeps polling while the head is behind the receipt or the state is missing", () => {
  assert.equal(
    shouldStopRefresh({
      ...base,
      attempt: 3,
      latestBlock: 19n,
      expectedMatched: true,
      matchedSince: 1,
    }),
    false,
  );
  assert.equal(
    shouldStopRefresh({ ...base, attempt: 3, latestBlock: undefined, expectedMatched: true, matchedSince: 1 }),
    false,
  );
  assert.equal(shouldStopRefresh({ ...base, attempt: 7 }), true);
});

test("a newer refresh replaces the previous poll", () => {
  const first = startRefreshGeneration();
  const second = startRefreshGeneration();
  assert.equal(isRefreshCurrent(first), false);
  assert.equal(isRefreshCurrent(second), true);
});

test("matches rental status and increased counters from contract reads", async () => {
  const rental = Array.from({ length: 11 }, () => 0n);
  rental[10] = 2n;
  assert.equal(statusIs(rental, 2), true);
  assert.equal(statusIs(rental, [6, 7]), false);
  assert.equal(statusIs(undefined, 2), false);
  const probe = {
    async read(request) {
      if (request.functionName === "rentals") return rental;
      return 4n;
    },
  };
  assert.equal(await expectRentalStatus(probe, 5n, 2), true);
  assert.equal(await expectRentalStatus(probe, 5n, 6), false);
  assert.equal(await expectIncreased(probe, { functionName: "nextId" }, 3n), true);
  assert.equal(await expectIncreased(probe, { functionName: "nextId" }, 4n), false);
  assert.equal(await expectIncreased(probe, { functionName: "nextId" }, undefined), false);
});
