import { test } from "node:test";
import assert from "node:assert/strict";

import { ConfiguredRuntimeResolver, HermesError } from "../src/index.js";

test("configured lifecycle resolution selects a runtime without cloud-side effects", async () => {
  const resolver = new ConfiguredRuntimeResolver([
    { runtimeId: "hermes-local", baseUrl: "http://127.0.0.1:8642/v1" },
  ]);

  assert.deepEqual(await resolver.resolveRuntime("hermes-local"), {
    runtimeId: "hermes-local",
    baseUrl: "http://127.0.0.1:8642/v1",
  });
  await assert.rejects(resolver.resolveRuntime("missing"), (error: unknown) => {
    assert.ok(error instanceof HermesError);
    assert.equal(error.code, "RUNTIME_NOT_FOUND");
    return true;
  });
});
