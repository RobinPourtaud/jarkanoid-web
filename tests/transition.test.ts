import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionFrame, TRANSITION_FRAMES } from "../src/transition";

test("native transition holds, contracts, mirrors, contracts, and opens the next level", () => {
  assert.deepEqual(transitionFrame(14), {
    inset: 0,
    top: 0,
    mirrored: false,
    next: false,
  });
  assert.deepEqual(transitionFrame(15), {
    inset: 1,
    top: 0,
    mirrored: false,
    next: false,
  });
  assert.equal(transitionFrame(66).inset, 511);
  assert.deepEqual(transitionFrame(67), {
    inset: 512,
    top: 51,
    mirrored: true,
    next: false,
  });
  assert.equal(transitionFrame(118).inset, 2);
  assert.deepEqual(transitionFrame(119), {
    inset: 1,
    top: 0,
    mirrored: true,
    next: false,
  });
  assert.equal(transitionFrame(170).inset, 511);
  assert.deepEqual(transitionFrame(171), {
    inset: 512,
    top: 51,
    mirrored: false,
    next: true,
  });
  assert.equal(transitionFrame(222).inset, 2);
  assert.deepEqual(transitionFrame(TRANSITION_FRAMES), {
    inset: 0,
    top: 0,
    mirrored: false,
    next: true,
  });
});
