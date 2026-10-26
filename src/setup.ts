// One-time setup: install Node tooling in a sandbox and snapshot it, so every code block starts
// from a ready runtime instead of running `npm install`. Re-run before the snapshot expires.
import { readFile } from "node:fs/promises";
import {
  blockCommand,
  execCollect,
  networkPolicyFor,
  RUNNER_DIR,
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
      "Install tsx",
      `mkdir -p ${RUNNER_DIR} && cd ${RUNNER_DIR} && npm init -y >/dev/null && npm install --no-audit --no-fund tsx@4`,
    );

    const harness = await readFile(new URL("./harness.mts", import.meta.url));
    await withRetry(() => sandboxes().upload(sandbox.id, `${RUNNER_DIR}/harness.mts`, harness));

    await withRetry(() =>
      sandboxes().upload(
        sandbox.id,
        "/tmp/block.mts",
        "export default (input: { name: string }) => `hello, ${input.name}`;",
      ),
    );
    await withRetry(() => sandboxes().upload(sandbox.id, "/tmp/input.json", '{"name":"v5"}'));
    await step(sandbox.id, "Smoke test", `${blockCommand(10)} && cat /tmp/output.json && rm /tmp/*.mts /tmp/*.json`);

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
