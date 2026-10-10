import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeRequirementMessage } from "../scripts/require-node.mjs";

test("tells older Node versions to install Node.js 22 before frontend tests", () => {
  const message = nodeRequirementMessage("v20.19.0");
  assert.match(message, /Node\.js 22 or newer/);
  assert.match(message, /v20\.19\.0/);
  assert.match(message, /bad option/);
  assert.match(message, /\.nvmrc/);
  assert.equal(nodeRequirementMessage("v22.14.0"), "");
  assert.equal(nodeRequirementMessage("v24.0.0"), "");
});
