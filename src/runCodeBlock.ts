import {
  ClientError,
  Render,
  SandboxEndedError,
  SandboxSnapshotNotFoundError,
  ServerError,
} from "@renderinc/sdk";
import type { SandboxesClient, SandboxNetworkPolicy } from "@renderinc/sdk/experimental";

/** Filesystem snapshot with Node, tsx, and the block libraries preinstalled. Built by `npm run setup`. */
export const RUNNER_SNAPSHOT = process.env.RUNNER_SNAPSHOT ?? "v5-ts-runner";
export const RUNNER_DIR = "/opt/runner";
/** Libraries blocks can import. Blocks can't install their own; changing this requires `npm run setup`. */
export const RUNNER_PACKAGES = ["tsx@4", "zod@4", "axios@1"];

// The block lives in RUNNER_DIR so its imports resolve from RUNNER_DIR/node_modules.
export const BLOCK_PATH = `${RUNNER_DIR}/block.mts`;
export const INPUT_PATH = "/tmp/input.json";
export const OUTPUT_PATH = "/tmp/output.json";
const DEFAULT_TIMEOUT_SECONDS = 10;
const MAX_LOG_CHARS = 64 * 1024;
// GNU `timeout` exits 124 when it stops the command, or 137 if it has to SIGKILL it.
const TIMEOUT_EXIT_CODES = new Set([124, 137]);

export interface CodeBlock {
  /** TypeScript source written by the end user. Must `export default` a function of the block's input. */
  code: string;
  /** HTTPS hosts the block may call. Empty means no outbound network at all. */
  allowedDomains?: string[];
  /** Wall-clock limit for the user's code. */
  timeoutSeconds?: number;
}

export interface BlockResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  logs: string;
  timedOut: boolean;
  sandboxId: string;
  durationMs: number;
}

let client: SandboxesClient | undefined;
export function sandboxes(): SandboxesClient {
  client ??= new Render().experimental.sandboxes;
  return client;
}

/**
 * Runs one code block in a fresh sandbox and returns its output.
 * Each call gets its own microVM, so blocks can't see each other or the caller.
 */
export async function runCodeBlock(block: CodeBlock, input: unknown): Promise<BlockResult> {
  const started = Date.now();
  const timeoutSeconds = block.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  const sandbox = await withRetry(() =>
    sandboxes().create({
      snapshotName: RUNNER_SNAPSHOT,
      // Always pass a policy: a snapshot restore without one comes up with no working egress.
      networkPolicy: networkPolicyFor(block.allowedDomains ?? []),
      // Backstop so a lost controller can't leave a sandbox running.
      timeoutSeconds: timeoutSeconds + 120,
    }),
  );

  try {
    await waitForRunning(sandbox.id);
    await withRetry(() => sandboxes().upload(sandbox.id, BLOCK_PATH, block.code));
    await withRetry(() => sandboxes().upload(sandbox.id, INPUT_PATH, JSON.stringify(input ?? null)));

    const { exitCode, logs } = await execCollect(sandbox.id, blockCommand(timeoutSeconds));
    const timedOut = TIMEOUT_EXIT_CODES.has(exitCode);
    const result = timedOut ? undefined : await readOutput(sandbox.id);

    return {
      ok: result?.ok === true,
      output: result?.output,
      error: timedOut
        ? `Timed out after ${timeoutSeconds}s`
        : result?.ok
          ? undefined
          : (result?.error ?? `Block exited with code ${exitCode} without writing output`),
      logs,
      timedOut,
      sandboxId: sandbox.id,
      durationMs: Date.now() - started,
    };
  } finally {
    await sandboxes()
      .terminate(sandbox.id)
      .catch(() => {});
  }
}

/** The command that runs a block inside the runner snapshot. Shared with setup's smoke test. */
export function blockCommand(timeoutSeconds: number): string {
  return [
    `cd ${RUNNER_DIR} &&`,
    `timeout -k 2 ${timeoutSeconds}`,
    "node --import tsx --max-old-space-size=512",
    `harness.mts ${BLOCK_PATH} ${INPUT_PATH} ${OUTPUT_PATH}`,
  ].join(" ");
}

export function networkPolicyFor(domains: string[]): SandboxNetworkPolicy {
  if (domains.length === 0) return { type: "deny-all" };
  return { type: "allow-list", rules: domains.map((domain) => ({ domain })) };
}

export async function waitForRunning(sandboxId: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await withRetry(() => sandboxes().get(sandboxId));
    if (status === "running") return;
    if (status === "errored" || status === "terminated") {
      throw new Error(`Sandbox ${sandboxId} is ${status}`);
    }
    await sleep(500);
  }
  throw new Error(`Sandbox ${sandboxId} was not running after ${timeoutMs}ms`);
}

export async function execCollect(
  sandboxId: string,
  command: string,
): Promise<{ exitCode: number; logs: string }> {
  // Retrying is safe only here, before the stream opens and the command starts.
  const events = await withRetry(() => sandboxes().exec(sandboxId, command));
  let logs = "";
  let exitCode = -1;
  for await (const event of events) {
    if (event.type === "output") {
      if (logs.length < MAX_LOG_CHARS) logs += event.data;
    } else {
      exitCode = event.exit_code;
    }
  }
  return { exitCode, logs: logs.slice(0, MAX_LOG_CHARS) };
}

async function readOutput(
  sandboxId: string,
): Promise<{ ok: boolean; output?: unknown; error?: string } | undefined> {
  try {
    const file = await withRetry(() => sandboxes().download(sandboxId, OUTPUT_PATH));
    return JSON.parse(file.data.toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Retries rate limits, server errors, and the 404 a sandbox returns while it finishes booting. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof SandboxEndedError || err instanceof SandboxSnapshotNotFoundError) return false;
  if (err instanceof ServerError) return true;
  return err instanceof ClientError && [404, 409, 429].includes(err.statusCode);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
