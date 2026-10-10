import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCandidate } from "../scripts/deployment-validation.mjs";

const candidate = {
  chainId: 11155111, protocolVersion: 2, demoMode: false,
  deployer: "0x1111111111111111111111111111111111111111",
  contracts: {
    MockIDR: "0x2222222222222222222222222222222222222222",
    RentalItem: "0x3333333333333333333333333333333333333333",
    Reputation: "0x4444444444444444444444444444444444444444",
    RentalEscrow: "0x5555555555555555555555555555555555555555",
  },
};

test("accepts a complete Sepolia v2 candidate before any RPC verification", () => {
  assert.doesNotThrow(() => validateCandidate(candidate));
});
test("rejects a candidate for another chain or protocol", () => {
  assert.throws(() => validateCandidate({ ...candidate, chainId: 1 }), /chain/);
  assert.throws(() => validateCandidate({ ...candidate, protocolVersion: 1 }), /version/);
});
test("rejects zero or missing deployer and contract addresses", () => {
  assert.throws(() => validateCandidate({ ...candidate, deployer: undefined }), /deployer/);
  assert.throws(() => validateCandidate({ ...candidate, deployer: "0x0000000000000000000000000000000000000000" }), /deployer/);
  for (const name of Object.keys(candidate.contracts)) {
    assert.throws(() => validateCandidate({ ...candidate, contracts: { ...candidate.contracts, [name]: undefined } }), /address/);
    assert.throws(() => validateCandidate({ ...candidate, contracts: { ...candidate.contracts, [name]: "0x0000000000000000000000000000000000000000" } }), /address/);
  }
});
test("rejects duplicate contracts and ambiguous demo clock values", () => {
  assert.throws(() => validateCandidate({ ...candidate, contracts: { ...candidate.contracts, Reputation: candidate.contracts.RentalItem } }), /distinct/);
  assert.throws(() => validateCandidate({ ...candidate, demoMode: "false" }), /demo/);
});
