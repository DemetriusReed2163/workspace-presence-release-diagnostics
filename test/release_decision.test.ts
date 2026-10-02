import assert from "node:assert/strict";
import test from "node:test";
import { decideRelease } from "../src/release_diagnostics";

test("a passed build releases when a developer is online", () => {
  assert.deepEqual(decideRelease("passed", 2), {
    operation: "release",
    diagnostic: "reviewer_online",
  });
});

test("a passed build waits when nobody is online", () => {
  assert.deepEqual(decideRelease("passed", 0), {
    operation: "queue",
    diagnostic: "no_developer_online",
  });
});

test("a failed build stays held even with an online reviewer", () => {
  assert.deepEqual(decideRelease("failed", 3), {
    operation: "hold",
    diagnostic: "build_failed",
  });
});
