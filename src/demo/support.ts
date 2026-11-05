import { readFile } from "node:fs/promises";
import { type BlockResult, type CodeBlock, runCodeBlock } from "../runCodeBlock.ts";

export interface DemoCase {
  name: string;
  block: CodeBlock;
  input?: unknown;
  /** Returns a one-line summary when the outcome is expected, or throws with the reason. */
  check: (result: BlockResult) => string;
}

export async function loadExample(
  file: string,
  options: Omit<CodeBlock, "code"> = {},
): Promise<CodeBlock> {
  const code = await readFile(new URL(`../../examples/${file}`, import.meta.url), "utf8");
  return { code, ...options };
}

/** Runs independent examples in parallel and reports how many checks failed. */
export async function runCases(cases: DemoCase[]): Promise<number> {
  const results = await Promise.allSettled(
    cases.map(({ block, input }) => runCodeBlock(block, input)),
  );
  let failures = 0;

  results.forEach((settled, index) => {
    const { name, check } = cases[index];

    if (settled.status === "rejected") {
      failures++;
      const reason =
        settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      console.log(`  ✗ ${name}: ${reason}`);
      return;
    }

    const result = settled.value;
    const metadata = `${result.sandboxId}, ${(result.durationMs / 1000).toFixed(1)}s`;

    try {
      console.log(`  ✓ ${name}: ${check(result)}  [${metadata}]`);
    } catch (error) {
      failures++;
      console.log(`  ✗ ${name}: ${(error as Error).message}  [${metadata}]`);
      if (result.logs) console.log(indent(result.logs.trimEnd()));
    }
  });

  return failures;
}

export function outputOf<T>(result: BlockResult): T {
  expect(result.ok, result.error ?? "block failed");
  return result.output as T;
}

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}
