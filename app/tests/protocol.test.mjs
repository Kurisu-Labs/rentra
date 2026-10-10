import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeProtocol } from "../src/lib/protocol.ts";

const expected = {
  idr: "0x1111111111111111111111111111111111111111",
  item: "0x2222222222222222222222222222222222222222",
  reputation: "0x3333333333333333333333333333333333333333",
  escrow: "0x4444444444444444444444444444444444444444",
};
const references = [expected.idr, expected.item, expected.reputation, expected.escrow, expected.escrow];

test("allows the recognized escrow only when every integration points to the same deployment", () => {
  assert.equal(isSafeProtocol(2n, references, expected), true);
});

test("fails closed for legacy, missing, or future protocol versions", () => {
  for (const version of [undefined, 1n, 3n, 2, "2"]) {
    assert.equal(isSafeProtocol(version, references, expected), false);
  }
});

test("blocks each independently mismatched or unavailable contract reference", () => {
  for (let index = 0; index < references.length; index += 1) {
    const mismatched = [...references];
    mismatched[index] = "0x5555555555555555555555555555555555555555";
    assert.equal(isSafeProtocol(2n, mismatched, expected), false);
    mismatched[index] = undefined;
    assert.equal(isSafeProtocol(2n, mismatched, expected), false);
  }
  assert.equal(isSafeProtocol(2n, references, { ...expected, escrow: undefined }), false);
});
