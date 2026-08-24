export interface HermesHttpClientOptions {
  readonly baseUrl: string;
  /** Connection and SSE idle timeout. The SSE timer resets whenever a chunk arrives. */
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** Runtime-only Hermes API-server authentication. Never persist or serialize this value. */
export interface HermesRuntimeAuth {
  readonly apiKey: string;
}

export interface HermesAdapterOptions extends HermesHttpClientOptions {
  readonly runtimeId: string;
}
