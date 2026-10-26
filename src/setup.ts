// One-time setup: install Node tooling in a sandbox and snapshot it, so every code block starts
// from a ready runtime instead of running `npm install`. Re-run before the snapshot expires.
import { readFile } from "node:fs/promises";
import {
  BLOCK_PATH,
  blockCommand,
  execCollect,
  INPUT_PATH,
  networkPolicyFor,
  OUTPUT_PATH,
  RUNNER_DIR,
  RUNNER_PACKAGES,
  RUNNER_SNAPSHOT,
  sandboxes,
  sleep,
  waitForRunning,
  withRetry,
} from "./runCodeBlock.ts";

async function main() {
  // The build sandbox can reach the npm registry and nothing else.
  const sandbox = await sandboxes().create({
    networkPolicy: networkPolicyFor(["registry.npmjs.org"]),
    timeoutSeconds: 900,
  });
  console.log(`Build sandbox ${sandbox.id}`);

  try {
    await waitForRunning(sandbox.id);

    await step(sandbox.id, "Check Node", "node --version && npm --version");
    await step(
      sandbox.id,
      `Install ${RUNNER_PACKAGES.join(", ")}`,
      `mkdir -p ${RUNNER_DIR} && cd ${RUNNER_DIR} && npm init -y >/dev/null && npm install --no-audit --no-fund ${RUNNER_PACKAGES.join(" ")}`,
    );

    const harness = await readFile(new URL("./harness.mts", import.meta.url));
    await withRetry(() => sandboxes().upload(sandbox.id, `${RUNNER_DIR}/harness.mts`, harness));

    await withRetry(() =>
      sandboxes().upload(
        sandbox.id,
        BLOCK_PATH,
        'import { z } from "zod";\nexport default (input: unknown) => `hello, ${z.object({ name: z.string() }).parse(input).name}`;',
      ),
    );
    await withRetry(() => sandboxes().upload(sandbox.id, INPUT_PATH, '{"name":"v5"}'));
    await step(
      sandbox.id,
      "Smoke test",
      `${blockCommand(10)} && cat ${OUTPUT_PATH} && rm ${BLOCK_PATH} ${INPUT_PATH} ${OUTPUT_PATH}`,
    );

    let snapshot = await sandboxes().snapshots.create({
      sandboxId: sandbox.id,
      kind: "filesystem",
      name: RUNNER_SNAPSHOT,
    });
    process.stdout.write(`Capturing snapshot ${snapshot.id}`);
    while (snapshot.status === "creating") {
      await sleep(2000);
      process.stdout.write(".");
      snapshot = await withRetry(() =>
        sandboxes().snapshots.get({ sandboxGroupId: snapshot.sandboxGroupId, snapshotId: snapshot.id }),
      );
    }
    console.log();
    if (snapshot.status !== "available") throw new Error(`Snapshot failed: ${snapshot.error}`);

    console.log(`Snapshot "${RUNNER_SNAPSHOT}" is ready (expires ${snapshot.expiresAt}).`);
  } finally {
    await sandboxes().terminate(sandbox.id);
  }
}

async function step(sandboxId: string, label: string, command: string) {
  console.log(`\n▸ ${label}`);
  const { exitCode, logs } = await execCollect(sandboxId, command);
  console.log(logs.trimEnd().split("\n").slice(-5).join("\n"));
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
