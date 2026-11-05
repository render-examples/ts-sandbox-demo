import { Render } from "@renderinc/sdk";
import {
  BLOCK_PATH,
  blockCommand,
  DEFAULT_TIMEOUT_SECONDS,
  INPUT_PATH,
  MAX_LOG_CHARS,
  OUTPUT_PATH,
  RUNNER_SNAPSHOT,
  TIMEOUT_EXIT_CODES,
} from "./runnerConfig.ts";
import { networkPolicyFor, sleep } from "./sandboxUtilities.ts";
import type { BlockResult, CodeBlock, HarnessResult } from "./types.ts";

export type { BlockResult, CodeBlock } from "./types.ts";

/**
 * Runs one code block in a fresh sandbox and returns its output.
 * Each call gets its own microVM, so blocks can't see each other or the caller.
 */
export async function runCodeBlock(block: CodeBlock, input: unknown): Promise<BlockResult> {
  const startedAt = Date.now();
  const timeoutSeconds = block.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const sandboxes = new Render().experimental.sandboxes;

  // 1. Create one isolated sandbox for this execution.
  const sandbox = await sandboxes.create({
    snapshotName: RUNNER_SNAPSHOT,
    networkPolicy: networkPolicyFor(block.allowedDomains ?? []),
    timeoutSeconds: timeoutSeconds + 120,
  });

  try {
    // 2. Wait for the microVM to boot.
    const bootDeadline = Date.now() + 60_000;
    let isRunning = false;
    while (Date.now() < bootDeadline) {
      const current = await sandboxes.get(sandbox.id);
      if (current.status === "running") {
        isRunning = true;
        break;
      }
      if (current.status === "errored" || current.status === "terminated") {
        throw new Error(`Sandbox ${sandbox.id} is ${current.status}`);
      }
      await sleep(500);
    }

    if (!isRunning) {
      throw new Error(`Sandbox ${sandbox.id} was not running after 60000ms`);
    }

    // 3. Copy the user code and its input into the sandbox.
    await sandboxes.upload(sandbox.id, BLOCK_PATH, block.code);
    await sandboxes.upload(sandbox.id, INPUT_PATH, JSON.stringify(input ?? null));

    // 4. Run the trusted harness and collect the block's console output.
    const events = await sandboxes.exec(sandbox.id, blockCommand(timeoutSeconds));
    let logs = "";
    let exitCode = -1;
    for await (const event of events) {
      if (event.type === "output") {
        if (logs.length < MAX_LOG_CHARS) logs += event.data;
      } else {
        exitCode = event.exit_code;
      }
    }
    logs = logs.slice(0, MAX_LOG_CHARS);

    // 5. Read the structured result written by the harness.
    const timedOut = TIMEOUT_EXIT_CODES.has(exitCode);
    let harnessResult: HarnessResult | undefined;
    if (!timedOut) {
      try {
        const outputFile = await sandboxes.download(sandbox.id, OUTPUT_PATH);
        harnessResult = JSON.parse(outputFile.data.toString("utf8")) as HarnessResult;
      } catch {
        // The process may have exited before it could write a result.
      }
    }

    let error: string | undefined;
    if (timedOut) {
      error = `Timed out after ${timeoutSeconds}s`;
    } else if (!harnessResult) {
      error = `Block exited with code ${exitCode} without writing output`;
    } else if (!harnessResult.ok) {
      error = harnessResult.error ?? "Block failed without an error message";
    }

    return {
      ok: harnessResult?.ok === true,
      output: harnessResult?.output,
      error,
      logs,
      timedOut,
      sandboxId: sandbox.id,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    // 6. Every execution gets a disposable sandbox.
    await sandboxes.terminate(sandbox.id).catch(() => {});
  }
}
