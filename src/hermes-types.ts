export interface HermesHttpClientOptions {
  readonly baseUrl: string;
  /** Connection and SSE idle timeout. The SSE timer resets whenever a chunk arrives. */
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export interface HermesAdapterOptions extends HermesHttpClientOptions {
  readonly runtimeId: string;
}
