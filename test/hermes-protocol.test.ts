import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HermesAdapter,
  HermesError,
  parseApprovalResponse,
  parseHealth,
  parseSse,
  parseStopResponse,
} from "../src/index.js";

const AUTH = { apiKey: "fixture-api-key" };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function queuedFetch(responses: readonly Response[]): {
  readonly fetchImpl: typeof fetch;
  readonly requests: Request[];
} {
  const queue = [...responses];
  const requests: Request[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    const response = queue.shift();
    if (response === undefined) throw new Error("fixture queue exhausted");
    return response;
  };
  return { fetchImpl, requests };
}

function adapter(fetchImpl: typeof fetch, timeoutMs?: number): HermesAdapter {
  return new HermesAdapter({
    baseUrl: "http://127.0.0.1:8642/v1",
    runtimeId: "hermes-fixture",
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    fetch: fetchImpl,
  });
}

test("capabilities and health normalize Hermes protocol fields", async () => {
  const fixtures = queuedFetch([
    jsonResponse({
      object: "hermes.api_server.capabilities",
      platform: "hermes-agent",
      model: "hermes-agent",
      features: {
        run_submission: true,
        run_status: true,
        run_events_sse: true,
        run_stop: true,
        run_approval_response: true,
        session_continuity_header: "X-Hermes-Session-Id",
      },
    }),
    jsonResponse({ status: "ok" }),
  ]);

  const runtime = adapter(fixtures.fetchImpl);
  const capabilities = await runtime.capabilities(AUTH);
  const health = await runtime.health(AUTH);

  assert.equal(capabilities.runtimeId, "hermes-fixture");
  assert.deepEqual(capabilities.features, {
    runSubmission: true,
    runStatus: true,
    runEventsSse: true,
    runStop: true,
    runApproval: true,
    sessionContinuity: true,
  });
  assert.equal(health.available, true);
  assert.equal(health.status, "available");
  assert.deepEqual(
    fixtures.requests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    ["GET /v1/capabilities", "GET /health"],
  );
});

test("capability parsing rejects broad aliases outside the official feature shape", async () => {
  const fixtures = queuedFetch([
    jsonResponse({
      features: {
        run_submission: true,
        run_status: true,
        run_events_sse: true,
        run_approval: true,
        session_continuity: true,
        session_continuity_header: "X-Hermes-Session",
      },
      endpoints: {
        run_approval: { method: "POST", path: "/v1/runs/{run_id}/approval" },
        run_cancel: { method: "POST" },
        session_chat: true,
      },
    }),
  ]);
  const capabilities = await adapter(fixtures.fetchImpl).capabilities(AUTH);

  assert.equal(capabilities.features.runApproval, false);
  assert.equal(capabilities.features.sessionContinuity, false);
  assert.equal(capabilities.features.runStop, false);
});

test("malformed health and control responses fail with protocol errors", () => {
  assert.throws(() => parseHealth({ status: "mystery" }), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
  assert.throws(() => parseStopResponse({}), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
  assert.throws(() => parseStopResponse({ run_id: "run-1", status: "mystery" }), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
  assert.throws(() => parseApprovalResponse({ run_id: "run-1", choice: "bogus", resolved: 1 }), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
  assert.throws(() => parseHealth({ status: "ok", ok: "false" }), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
  assert.throws(() => parseHealth({ status: "ok", ok: false }), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    return true;
  });
});

test("getResult and continueSession preserve explicit session and run identities", async () => {
  const fixtures = queuedFetch([
    jsonResponse({ features: { run_status: true } }),
    jsonResponse({
      object: "hermes.run",
      run_id: "run-complete",
      status: "completed",
      session_id: "session-1",
      output: "Done.",
      usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
    }),
    jsonResponse({ features: { run_submission: true } }),
    jsonResponse({ run_id: "run-next", status: "started" }, 202),
  ]);
  const runtime = adapter(fixtures.fetchImpl);
  const handle = { runtimeId: "hermes-fixture", runId: "run-complete", sessionId: "session-1" } as const;

  const result = await runtime.getResult(handle, AUTH);
  const continued = await runtime.continueSession(
    { runtimeId: "hermes-fixture", sessionId: "session-1" },
    { input: "next turn", previousResponseId: "resp-1" },
    AUTH,
  );

  assert.deepEqual(result, {
    handle,
    status: "completed",
    complete: true,
    output: "Done.",
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    raw: {
      object: "hermes.run",
      run_id: "run-complete",
      status: "completed",
      session_id: "session-1",
      output: "Done.",
      usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
    },
  });
  assert.deepEqual(continued, {
    runtimeId: "hermes-fixture",
    runId: "run-next",
    sessionId: "session-1",
  });
  assert.deepEqual(await fixtures.requests[3]?.json(), {
    input: "next turn",
    previous_response_id: "resp-1",
    session_id: "session-1",
  });
});

test("SSE parsing handles chunk boundaries, event names, ids, and JSON data", async () => {
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield encoder.encode("id: event-1\r\nevent: message.delta\r\ndata: {\"delta\":\"");
    yield encoder.encode("hi\"}\r\n\r\n");
  }

  const events = [];
  for await (const event of parseSse(chunks())) events.push(event);

  assert.deepEqual(events, [
    {
      id: "event-1",
      event: "message.delta",
      data: { delta: "hi" },
      rawData: '{"delta":"hi"}',
    },
  ]);
});

test("SSE parsing preserves CRLF separators split across chunks", async () => {
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield encoder.encode("event: message.delta\r");
    yield encoder.encode("\ndata: {\"delta\":\"ok\"}\r");
    yield encoder.encode("\n\r");
    yield encoder.encode("\n");
  }

  const events = [];
  for await (const event of parseSse(chunks())) events.push(event);
  assert.deepEqual(events, [{ event: "message.delta", data: { delta: "ok" }, rawData: '{"delta":"ok"}' }]);
});

test("SSE parsing rejects an incomplete final frame", async () => {
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield encoder.encode("data: {\"event\":\"message.delta\"}");
  }

  await assert.rejects(
    (async () => {
      for await (const _event of parseSse(chunks())) {
        // Exhaust the parser so the final-frame check runs.
      }
    })(),
    (error: unknown) => {
      assert.ok(error instanceof HermesError);
      assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
      return true;
    },
  );
});

test("SSE parsing rejects conflicting envelope and embedded event names", async () => {
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield encoder.encode(
      "event: run.completed\ndata: {\"event\":\"run.failed\",\"run_id\":\"run-1\"}\n\n",
    );
  }

  await assert.rejects(
    (async () => {
      for await (const _event of parseSse(chunks())) {
        // Exhaust the parser so the conflicting-frame check runs.
      }
    })(),
    (error: unknown) => {
      assert.ok(error instanceof HermesError);
      assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
      return true;
    },
  );
});

test("SSE parsing rejects oversized event frames", async () => {
  const encoder = new TextEncoder();
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield encoder.encode(`data: ${"x".repeat(262_145)}\n\n`);
  }

  await assert.rejects(
    (async () => {
      for await (const _event of parseSse(chunks())) {
        // Exhaust the parser so the frame bound runs.
      }
    })(),
    (error: unknown) => error instanceof HermesError && error.message.includes("too large"),
  );
});

test("Hermes HTTP client rejects oversized upstream JSON bodies", async () => {
  const fixtures = queuedFetch([
    new Response("x".repeat(1_048_577), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const runtime = adapter(fixtures.fetchImpl);

  await assert.rejects(
    runtime.capabilities(AUTH),
    (error: unknown) => error instanceof HermesError && error.message.includes("response body that is too large"),
  );
});

test("adapter streamEvents maps Hermes SSE frames to the runtime handle", async () => {
  const sse = [
    "event: gateway.ready\n",
    "data: {\"run_id\":\"run-1\"}\n\n",
    "id: 2\n",
    "event: message.complete\n",
    "data: {\"output\":\"Done\"}\n\n",
    "data: {\"event\":\"run.completed\",\"run_id\":\"run-1\"}\n\n",
  ].join("");
  const fixtures = queuedFetch([
    jsonResponse({ features: { run_events_sse: true } }),
    new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
  ]);
  const runtime = adapter(fixtures.fetchImpl);
  const handle = { runtimeId: "hermes-fixture", runId: "run-1" } as const;
  const events = [];
  for await (const event of runtime.streamEvents(handle, AUTH)) events.push(event);

  assert.deepEqual(events, [
    {
      runtimeId: "hermes-fixture",
      runId: "run-1",
      event: "gateway.ready",
      data: { run_id: "run-1" },
      rawData: '{"run_id":"run-1"}',
    },
    {
      runtimeId: "hermes-fixture",
      runId: "run-1",
      id: "2",
      event: "message.complete",
      data: { output: "Done" },
      rawData: '{"output":"Done"}',
    },
    {
      runtimeId: "hermes-fixture",
      runId: "run-1",
      event: "run.completed",
      data: { event: "run.completed", run_id: "run-1" },
      rawData: '{"event":"run.completed","run_id":"run-1"}',
    },
  ]);
});

test("adapter streamEvents rejects a clean SSE EOF without a terminal run event", async () => {
  const fixtures = queuedFetch([
    jsonResponse({ features: { run_events_sse: true } }),
    new Response("data: {\"event\":\"message.delta\"}\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  ]);
  const runtime = adapter(fixtures.fetchImpl);
  const handle = { runtimeId: "hermes-fixture", runId: "run-1" } as const;

  await assert.rejects(
    (async () => {
      for await (const _event of runtime.streamEvents(handle, AUTH)) {
        // Exhaust the stream so EOF validation runs.
      }
    })(),
    (error: unknown) => {
      assert.ok(error instanceof HermesError);
      assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
      return true;
    },
  );
});

test("HTTP errors are normalized without exposing the runtime API key", async () => {
  const fixtures = queuedFetch([
    jsonResponse({ features: { run_submission: true } }),
    new Response(JSON.stringify({ error: "bad key fixture-api-key api_key=other-secret" }), {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/json" },
    }),
  ]);
  const runtime = adapter(fixtures.fetchImpl);

  await assert.rejects(
    runtime.startRun({ input: "hello" }, AUTH),
    (error: unknown) => {
      assert.ok(error instanceof HermesError);
      assert.equal(error.code, "AUTH_REQUIRED");
      assert.equal(error.statusCode, 401);
      assert.equal(error.message.includes("fixture-api-key"), false);
      assert.equal(JSON.stringify(error).includes("fixture-api-key"), false);
      assert.equal(JSON.stringify(error).includes("other-secret"), false);
      return true;
    },
  );
});

test("network and invalid-JSON diagnostics stay bounded and redacted", async () => {
  const networkRuntime = adapter(async () => {
    throw new Error("connection failed for Bearer fixture-api-key");
  });
  await assert.rejects(networkRuntime.capabilities(AUTH), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_UNAVAILABLE");
    assert.equal(JSON.stringify(error).includes("fixture-api-key"), false);
    assert.equal(JSON.stringify(error).includes("connection failed"), true);
    return true;
  });

  const invalidJson = queuedFetch([new Response("Bearer fixture-api-key", { status: 200 })]);
  await assert.rejects(adapter(invalidJson.fetchImpl).capabilities(AUTH), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_PROTOCOL_ERROR");
    assert.equal(JSON.stringify(error).includes("fixture-api-key"), false);
    return true;
  });
});

test("request timeout is bounded and normalized", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    await new Promise<void>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    throw new Error("unreachable");
  };
  const runtime = adapter(fetchImpl, 5);

  await assert.rejects(runtime.capabilities(AUTH), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "TIMEOUT");
    return true;
  });
});

test("stop and approval call only advertised controls; unsupported operations are stable", async () => {
  const fixtures = queuedFetch([
    jsonResponse({ features: { run_stop: true, run_approval_response: true } }),
    jsonResponse({ run_id: "run-1", status: "stopping" }),
    jsonResponse({ features: { run_stop: true, run_approval_response: true } }),
    jsonResponse({ run_id: "run-1", choice: "once", resolved: 1 }),
  ]);
  const runtime = adapter(fixtures.fetchImpl);
  const handle = { runtimeId: "hermes-fixture", runId: "run-1" } as const;

  assert.equal((await runtime.cancelRun(handle, AUTH)).status, "stopping");
  assert.equal((await runtime.approveRun(handle, { choice: "once" }, AUTH)).status, "approved");
  assert.deepEqual(await fixtures.requests[3]?.json(), { choice: "once" });
  await assert.rejects(runtime.stopRuntime({ runtimeId: "hermes-fixture" }, AUTH), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "UNSUPPORTED_CAPABILITY");
    return true;
  });

  const unsupportedFixtures = queuedFetch([jsonResponse({ features: { run_stop: false } })]);
  await assert.rejects(
    adapter(unsupportedFixtures.fetchImpl).cancelRun(handle, AUTH),
    (error: unknown) => {
      assert.ok(error instanceof HermesError);
      assert.equal(error.code, "UNSUPPORTED_CAPABILITY");
      assert.equal(error.message.includes("run_stop"), true);
      return true;
    },
  );
  assert.equal(unsupportedFixtures.requests.length, 1);
});
