// One-time setup: install Node tooling in a sandbox and snapshot it, so every code block starts
// from a ready runtime instead of running `npm install`. Re-run before the snapshot expires.
import { readFile } from "node:fs/promises";
import {
  BLOCK_PATH,
  blockCommand,
  HARNESS_PATH,
  INPUT_PATH,
  OUTPUT_PATH,
  RUNNER_DIR,
  RUNNER_PACKAGES,
  RUNNER_SNAPSHOT,
} from "./runnerConfig.ts";
import { getSandboxes, networkPolicyFor, sleep } from "./sandboxUtilities.ts";

async function main() {
  const sandboxes = getSandboxes();

  // The build sandbox can reach the npm registry and nothing else.
  const sandbox = await sandboxes.create({
    networkPolicy: networkPolicyFor(["registry.npmjs.org"]),
    timeoutSeconds: 900,
  });
  console.log(`Build sandbox ${sandbox.id}`);

  try {
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
    if (!isRunning) throw new Error(`Sandbox ${sandbox.id} was not running after 60000ms`);

    await step(sandboxes, sandbox.id, "Check Node", "node --version && npm --version");
    await step(
      sandboxes,
      sandbox.id,
      `Install ${RUNNER_PACKAGES.join(", ")}`,
      `mkdir -p ${RUNNER_DIR} && cd ${RUNNER_DIR} && npm init -y >/dev/null && npm install --no-audit --no-fund ${RUNNER_PACKAGES.join(" ")}`,
    );

    const harness = await readFile(new URL("./harness.mts", import.meta.url));
    await sandboxes.upload(sandbox.id, HARNESS_PATH, harness);

    await sandboxes.upload(
      sandbox.id,
      BLOCK_PATH,
      'import { z } from "zod";\nexport default (input: unknown) => `hello, ${z.object({ name: z.string() }).parse(input).name}`;',
    );
    await sandboxes.upload(sandbox.id, INPUT_PATH, '{"name":"v5"}');
    await step(
      sandboxes,
      sandbox.id,
      "Smoke test",
      `${blockCommand(10)} && cat ${OUTPUT_PATH} && rm ${BLOCK_PATH} ${INPUT_PATH} ${OUTPUT_PATH}`,
    );

    let snapshot = await sandboxes.snapshots.create({
      sandboxId: sandbox.id,
      kind: "filesystem",
      name: RUNNER_SNAPSHOT,
    });
    process.stdout.write(`Capturing snapshot ${snapshot.id}`);
    while (snapshot.status === "creating") {
      await sleep(2000);
      process.stdout.write(".");
      snapshot = await sandboxes.snapshots.get({
        sandboxGroupId: snapshot.sandboxGroupId,
        snapshotId: snapshot.id,
      });
    }
    console.log();
    if (snapshot.status !== "available") throw new Error(`Snapshot failed: ${snapshot.error}`);

    console.log(`Snapshot "${RUNNER_SNAPSHOT}" is ready (expires ${snapshot.expiresAt}).`);
  } finally {
    await sandboxes.terminate(sandbox.id);
  }
}

async function step(
  sandboxes: ReturnType<typeof getSandboxes>,
  sandboxId: string,
  label: string,
  command: string,
) {
  console.log(`\n▸ ${label}`);
  const events = await sandboxes.exec(sandboxId, command);
  let logs = "";
  let exitCode = -1;
  for await (const event of events) {
    if (event.type === "output") logs += event.data;
    else exitCode = event.exit_code;
  }
  console.log(logs.trimEnd().split("\n").slice(-5).join("\n"));
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
