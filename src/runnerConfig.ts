/** Filesystem snapshot with Node, tsx, and the block libraries preinstalled. */
export const RUNNER_SNAPSHOT = process.env.RUNNER_SNAPSHOT ?? "v5-ts-runner";
export const RUNNER_DIR = "/opt/runner";

/** Libraries user-authored blocks may import. Re-run `npm run setup` after changing these. */
export const RUNNER_PACKAGES = ["tsx@4", "zod@4", "axios@1"];

// The block lives in RUNNER_DIR so its imports resolve from RUNNER_DIR/node_modules.
export const BLOCK_PATH = `${RUNNER_DIR}/block.mts`;
export const HARNESS_PATH = `${RUNNER_DIR}/harness.mts`;
export const INPUT_PATH = "/tmp/input.json";
export const OUTPUT_PATH = "/tmp/output.json";

export const DEFAULT_TIMEOUT_SECONDS = 10;
export const MAX_LOG_CHARS = 64 * 1024;

// GNU `timeout` exits 124 when it stops the command, or 137 if it has to SIGKILL it.
export const TIMEOUT_EXIT_CODES = new Set([124, 137]);

/** Command executed inside each sandbox. Also used by setup's smoke test. */
export function blockCommand(timeoutSeconds: number): string {
  return [
    `cd ${RUNNER_DIR} &&`,
    `timeout -k 2 ${timeoutSeconds}`,
    "node --import tsx --max-old-space-size=512",
    `harness.mts ${BLOCK_PATH} ${INPUT_PATH} ${OUTPUT_PATH}`,
  ].join(" ");
}
