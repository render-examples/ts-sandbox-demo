import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { type BlockResult, type CodeBlock, runCodeBlock } from "./runCodeBlock.ts";

interface Case {
  name: string;
  block: CodeBlock;
  input?: unknown;
  /** Returns a one-line summary when the outcome is what we expect, or throws with the reason. */
  check: (result: BlockResult) => string;
}

const ORDERS = {
  orders: [
    { id: "o_1", amount: 120, currency: "USD" },
    { id: "o_2", amount: 80, currency: "USD" },
    { id: "o_3", amount: 45, currency: "EUR" },
  ],
};

async function main() {
  let failures = 0;

  section("A workflow run: two code blocks in parallel, each in its own sandbox");
  failures += await runAll([
    {
      name: "transform (no network)",
      block: await example("transform.mts"),
      input: ORDERS,
      check: (r) => {
        const totals = output<{ totals: Record<string, number> }>(r).totals;
        expect(totals.USD === 200 && totals.EUR === 45, `unexpected totals ${JSON.stringify(totals)}`);
        return `totals ${JSON.stringify(totals)}`;
      },
    },
    {
      name: "github-stars (allowlist: api.github.com)",
      block: await example("github-stars.mts", { allowedDomains: ["api.github.com"] }),
      input: { repo: "render-oss/sdk" },
      check: (r) => {
        const { repo, stars } = output<{ repo: string; stars: number }>(r);
        return `${repo} has ${stars} stars`;
      },
    },
  ]);

  section("Credential brokering: the block calls OpenAI without ever seeing a key");
  if (process.env.DEMO_BROKERING === "1") {
    failures += await runAll([
      {
        name: "brokered-openai (allowlist: api.openai.com)",
        block: await example("brokered-openai.mts", { allowedDomains: ["api.openai.com"] }),
        check: (r) => {
          const o = output<{ allowedStatus: number; unmatchedStatus: number; keyVisibleToCode: boolean }>(r);
          expect(o.allowedStatus === 200, `GET /v1/models returned ${o.allowedStatus}`);
          expect(o.unmatchedStatus !== 200, "GET /v1/files should be denied by the broker rule");
          expect(!o.keyVisibleToCode, "the real key was visible inside the sandbox");
          return `/v1/models → ${o.allowedStatus}, /v1/files → ${o.unmatchedStatus}, key visible: no`;
        },
      },
    ]);
  } else {
    console.log("  skipped: configure the brokered credential (README), then set DEMO_BROKERING=1");
  }

  section("Hostile blocks: what a node:vm escape gets you inside a sandbox");
  failures += await runAll([
    {
      name: "env-dump",
      block: await example("hostile/env-dump.mts"),
      check: (r) => {
        const { secretsFound, envKeys } = output<{ secretsFound: number; envKeys: string[] }>(r);
        expect(secretsFound === 0, `found ${secretsFound} secret-shaped values`);
        return `0 secrets in ${envKeys.length} env vars`;
      },
    },
    {
      name: "exfiltrate (allowlist: api.github.com)",
      block: await example("hostile/exfiltrate.mts", { allowedDomains: ["api.github.com"] }),
      check: (r) => {
        const { attempts } = output<{ attempts: { target: string; reached: boolean; error?: string }[] }>(r);
        const leaked = attempts.filter((a) => a.reached);
        expect(leaked.length === 0, `reached ${leaked.map((a) => a.target).join(", ")}`);
        return attempts.map((a) => `${new URL(a.target).host} blocked (${a.error})`).join(", ");
      },
    },
    {
      name: "infinite-loop (3s limit)",
      block: await example("hostile/infinite-loop.mts", { timeoutSeconds: 3 }),
      check: (r) => {
        expect(r.timedOut, "the block was not stopped");
        return r.error!;
      },
    },
    {
      name: "vm-escape",
      block: await example("hostile/vm-escape.mts"),
      input: { hostPath: process.cwd() },
      check: (r) => {
        const o = output<{ gotProcess: boolean; user: string; hostname: string; sawHostFiles: boolean }>(r);
        expect(o.hostname !== hostname(), "the block ran on the host");
        expect(!o.sawHostFiles, "the block could read the host's files");
        return `escaped to ${o.user}@${o.hostname}, a disposable microVM; host files not visible`;
      },
    },
    {
      name: "wipe-disk",
      block: await example("hostile/wipe-disk.mts", { timeoutSeconds: 30 }),
      check: (r) => `destroyed its own sandbox (${r.error ?? "completed"})`,
    },
  ]);

  section("After the attacks: the next block still gets a clean sandbox");
  failures += await runAll([
    {
      name: "transform again",
      block: await example("transform.mts"),
      input: ORDERS,
      check: (r) => `totals ${JSON.stringify(output<{ totals: unknown }>(r).totals)}`,
    },
  ]);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

async function runAll(cases: Case[]): Promise<number> {
  const results = await Promise.allSettled(cases.map((c) => runCodeBlock(c.block, c.input)));
  let failures = 0;
  results.forEach((settled, i) => {
    const { name, check } = cases[i];
    if (settled.status === "rejected") {
      failures++;
      console.log(`  ✗ ${name}: ${settled.reason instanceof Error ? settled.reason.message : settled.reason}`);
      return;
    }
    const r = settled.value;
    const meta = `${r.sandboxId}, ${(r.durationMs / 1000).toFixed(1)}s`;
    try {
      console.log(`  ✓ ${name}: ${check(r)}  [${meta}]`);
    } catch (err) {
      failures++;
      console.log(`  ✗ ${name}: ${(err as Error).message}  [${meta}]`);
      if (r.logs) console.log(indent(r.logs.trimEnd()));
    }
  });
  return failures;
}

async function example(file: string, options: Omit<CodeBlock, "code"> = {}): Promise<CodeBlock> {
  const code = await readFile(new URL(`../examples/${file}`, import.meta.url), "utf8");
  return { code, ...options };
}

function output<T>(result: BlockResult): T {
  expect(result.ok, result.error ?? "block failed");
  return result.output as T;
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function section(title: string) {
  console.log(`\n${title}`);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
