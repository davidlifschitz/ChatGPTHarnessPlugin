import { ConfiguredRuntimeResolver } from "./lifecycle.js";
import { HermesAdapter } from "./adapter.js";
import {
  createControlPlaneServer,
  listenControlPlaneServer,
} from "./control-plane.js";
import type { HermesRuntimeAuth } from "./hermes-types.js";

const DEFAULT_HERMES_BASE_URL = "http://127.0.0.1:8642/v1";
const DEFAULT_RUNTIME_ID = "hermes-private";

async function main(): Promise<void> {
  const runtimeId = process.env.HERMES_RUNTIME_ID ?? DEFAULT_RUNTIME_ID;
  const apiKey = requiredEnvironment("HERMES_API_KEY");
  const bearerToken = requiredEnvironment("CONTROL_PLANE_TOKEN");
  const allowedOrigins = requiredEnvironment("CONTROL_PLANE_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (allowedOrigins.length === 0) throw new Error("CONTROL_PLANE_ORIGINS must contain at least one origin");

  const host = process.env.CONTROL_PLANE_HOST ?? "127.0.0.1";
  if (!isLoopback(host)) throw new Error("The local control-plane entrypoint only supports loopback; use a TLS-terminating private proxy for remote access");
  const port = parsePort(process.env.CONTROL_PLANE_PORT ?? "8787");
  const runtimeAuth: HermesRuntimeAuth = { apiKey };
  const adapter = new HermesAdapter({
    baseUrl: process.env.HERMES_BASE_URL ?? DEFAULT_HERMES_BASE_URL,
    runtimeId,
    timeoutMs: 30_000,
  });
  const server = createControlPlaneServer({
    adapter,
    lifecycle: new ConfiguredRuntimeResolver([{ runtimeId }]),
    runtimeAuth,
    bearerToken,
    allowedOrigins,
  });

  await listenControlPlaneServer(server, { host, port });
  const address = server.address();
  const boundPort = address !== null && typeof address === "object" ? address.port : port;
  console.log(`Private Hermes MCP control plane listening on ${host}:${boundPort}/mcp`);

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("CONTROL_PLANE_PORT must be an integer");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("CONTROL_PLANE_PORT must be between 1 and 65535");
  return port;
}

function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

void main().catch(() => {
  console.error("Private Hermes MCP control plane failed to start");
  process.exitCode = 1;
});
