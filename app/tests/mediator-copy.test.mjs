import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIATOR_BEFORE_HANDOVER } from "../src/lib/mediator-copy.ts";

test("explains that a mediator has to be proposed and accepted before handover", () => {
  assert.match(MEDIATOR_BEFORE_HANDOVER, /before handover/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /propose/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /accept/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /cannot be added after pickup/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /counter-offer/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /mutual settlement/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /waiting out a deadline/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /claim window/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /grace period/i);
  assert.match(MEDIATOR_BEFORE_HANDOVER, /Silence does not award/i);
});
