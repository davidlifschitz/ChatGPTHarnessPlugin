import { test } from "node:test";
import assert from "node:assert/strict";

import { HermesAdapter } from "../src/index.js";

test("startRun preserves the explicit runtime identity and sends runtime auth per request", async () => {
  let request: Request | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ run_id: "run-1", status: "started" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };

  const adapter = new HermesAdapter({
    baseUrl: "http://127.0.0.1:8642/v1",
    runtimeId: "hermes-local",
    fetch: fetchImpl,
  });

  const originalFetch = fetchImpl;
  const capabilityFetch: typeof fetch = async (input, init) => {
    const capabilityRequest = new Request(input, init);
    if (capabilityRequest.url.endsWith("/v1/capabilities")) {
      return new Response(JSON.stringify({ features: { run_submission: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
  const capabilityAdapter = new HermesAdapter({
    baseUrl: "http://127.0.0.1:8642/v1",
    runtimeId: "hermes-local",
    fetch: capabilityFetch,
  });

  const handle = await capabilityAdapter.startRun(
    { input: "hello", sessionId: "session-1" },
    { apiKey: "fixture-api-key" },
  );

  assert.deepEqual(handle, {
    runtimeId: "hermes-local",
    runId: "run-1",
    sessionId: "session-1",
  });
  assert.ok(request);
  assert.equal(request.url, "http://127.0.0.1:8642/v1/runs");
  assert.equal(request.headers.get("authorization"), "Bearer fixture-api-key");
  assert.deepEqual(await request.json(), {
    input: "hello",
    session_id: "session-1",
  });
});
