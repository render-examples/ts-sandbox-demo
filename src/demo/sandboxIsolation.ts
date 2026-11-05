import { hostname } from "node:os";
import { expect, loadExample, outputOf, runCases } from "./support.ts";

const ORDERS = {
  orders: [
    { id: "o_1", amount: 120, currency: "USD" },
    { id: "o_2", amount: 80, currency: "USD" },
    { id: "o_3", amount: 45, currency: "EUR" },
  ],
};

export async function demonstrateSandboxIsolation(): Promise<number> {
  return runCases([
    {
      name: "env-dump",
      block: await loadExample("hostile/env-dump.mts"),
      check: (result) => {
        const { secretsFound, envKeys } = outputOf<{
          secretsFound: number;
          envKeys: string[];
        }>(result);
        expect(secretsFound === 0, `found ${secretsFound} secret-shaped values`);
        return `0 secrets in ${envKeys.length} env vars`;
      },
    },
    {
      name: "vm-escape",
      block: await loadExample("hostile/vm-escape.mts"),
      input: { hostPath: process.cwd() },
      check: (result) => {
        const output = outputOf<{
          gotProcess: boolean;
          user: string;
          hostname: string;
          sawHostFiles: boolean;
        }>(result);
        expect(output.hostname !== hostname(), "the block ran on the host");
        expect(!output.sawHostFiles, "the block could read the host's files");
        return `escaped to ${output.user}@${output.hostname}, a disposable microVM; host files not visible`;
      },
    },
    {
      name: "wipe-disk",
      block: await loadExample("hostile/wipe-disk.mts", {
        timeoutSeconds: 30,
      }),
      check: (result) => `destroyed its own sandbox (${result.error ?? "completed"})`,
    },
  ]);
}

export async function demonstrateCleanNextRun(): Promise<number> {
  return runCases([
    {
      name: "transform after hostile blocks",
      block: await loadExample("transform.mts"),
      input: ORDERS,
      check: (result) => {
        const { totals } = outputOf<{ totals: unknown }>(result);
        return `totals ${JSON.stringify(totals)}`;
      },
    },
  ]);
}
