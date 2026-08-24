import { HermesError, invalidRequest } from "./errors.js";
import type { RuntimeRef } from "./types.js";

export interface LifecycleAdapter {
  resolveRuntime(runtimeId: string): Promise<RuntimeRef>;
}

/**
 * Resolves only operator-provided local runtime configuration.
 * It deliberately does not provision, mutate, or authenticate with Nous Portal.
 */
export class ConfiguredRuntimeResolver implements LifecycleAdapter {
  private readonly runtimes: ReadonlyMap<string, RuntimeRef>;

  constructor(runtimes: readonly RuntimeRef[]) {
    const entries = runtimes.map((runtime) => {
      if (!runtime || typeof runtime.runtimeId !== "string" || runtime.runtimeId.trim().length === 0) {
        throw invalidRequest("runtimeId must be a non-empty string");
      }
      const runtimeId = runtime.runtimeId.trim();
      return [runtimeId, { runtimeId }] as const;
    });
    this.runtimes = new Map(entries);
  }

  async resolveRuntime(runtimeId: string): Promise<RuntimeRef> {
    if (typeof runtimeId !== "string" || runtimeId.trim().length === 0) {
      throw invalidRequest("runtimeId must be a non-empty string");
    }
    const normalizedRuntimeId = runtimeId.trim();
    const runtime = this.runtimes.get(normalizedRuntimeId);
    if (runtime === undefined) {
      throw new HermesError("RUNTIME_NOT_FOUND", `Configured runtime ${normalizedRuntimeId} was not found`);
    }
    return runtime;
  }
}
