import { HermesError, invalidRequest } from "./errors.js";
import type { RuntimeRef } from "./types.js";

export interface ResolvedRuntime extends RuntimeRef {
  readonly baseUrl: string;
}

export interface LifecycleAdapter {
  resolveRuntime(runtimeId: string): Promise<ResolvedRuntime>;
}

/**
 * Resolves only operator-provided local runtime configuration.
 * It deliberately does not provision, mutate, or authenticate with Nous Portal.
 */
export class ConfiguredRuntimeResolver implements LifecycleAdapter {
  private readonly runtimes: ReadonlyMap<string, ResolvedRuntime>;

  constructor(runtimes: readonly ResolvedRuntime[]) {
    const entries = runtimes.map((runtime) => {
      if (!runtime || typeof runtime.runtimeId !== "string" || runtime.runtimeId.trim().length === 0) {
        throw invalidRequest("runtimeId must be a non-empty string");
      }
      if (typeof runtime.baseUrl !== "string" || runtime.baseUrl.trim().length === 0) {
        throw invalidRequest("baseUrl must be a non-empty string");
      }
      const runtimeId = runtime.runtimeId.trim();
      return [runtimeId, { ...runtime, runtimeId }] as const;
    });
    this.runtimes = new Map(entries);
  }

  async resolveRuntime(runtimeId: string): Promise<ResolvedRuntime> {
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
