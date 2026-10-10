import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCountdown } from "../src/lib/claim-window.ts";
import {
  formatPickupClock,
  isPickupOpen,
  pickupSecondsRemaining,
} from "../src/lib/pickup-window.ts";

const start = 1_700_000_000n;

test("keeps pickup closed until the rental start time", () => {
  assert.equal(isPickupOpen(start, Number(start) - 1), false);
  assert.equal(pickupSecondsRemaining(start, Number(start) - 90), 90);
  assert.equal(formatCountdown(90), "0h 1m 30s");
  assert.equal(isPickupOpen(start, Number(start)), true);
  assert.equal(isPickupOpen(start, Number(start) + 5), true);
  assert.equal(pickupSecondsRemaining(start, Number(start)), 0);
});

test("does not block pickup when the start time is missing", () => {
  assert.equal(isPickupOpen(undefined, 0), true);
  assert.equal(isPickupOpen(0n, Number(start)), true);
  assert.equal(pickupSecondsRemaining(undefined, Number(start)), 0);
});

test("formats the opening time in local hours and minutes", () => {
  const unix = Number(start);
  const date = new Date(unix * 1000);
  const expected = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  assert.equal(formatPickupClock(unix), expected);
  assert.match(formatPickupClock(unix), /^\d{2}:\d{2}$/);
});
