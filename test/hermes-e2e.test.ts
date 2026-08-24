import { test } from "node:test";
import assert from "node:assert/strict";

import { HermesAdapter } from "../src/index.js";

const enabled = process.env.HERMES_M1_E2E === "1";

test("real Hermes run submits, reaches a terminal state, and returns its result", {
  skip: !enabled,
}, async () => {
  const apiKey = process.env.HERMES_API_KEY;
  if (!apiKey) throw new Error("HERMES_API_KEY is required when HERMES_M1_E2E=1");

  const runtime = new HermesAdapter({
    baseUrl: process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642/v1",
    runtimeId: "hermes-local-e2e",
    timeoutMs: 30_000,
  });
  const auth = { apiKey };
  const capabilities = await runtime.capabilities(auth);
  assert.equal(capabilities.features.runSubmission, true);
  assert.equal(capabilities.features.runStatus, true);

  const handle = await runtime.startRun(
    { input: "Reply with exactly: HERMES_M1_OK" },
    auth,
  );
  const observedStates = new Set<string>();
  const deadline = Date.now() + 120_000;
  let result = await runtime.getResult(handle, auth);
  while (!result.complete && Date.now() < deadline) {
    observedStates.add(result.status);
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await runtime.getResult(handle, auth);
  }
  observedStates.add(result.status);

  assert.equal(result.complete, true, `Hermes did not finish; states=${[...observedStates].join(",")}`);
  assert.equal(result.status, "completed");
  assert.equal(result.output?.trim(), "HERMES_M1_OK");
});
