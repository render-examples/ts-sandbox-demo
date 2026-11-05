import { expect, loadExample, runCases } from "./support.ts";

export async function demonstrateTimeLimits(): Promise<number> {
  return runCases([
    {
      name: "infinite-loop (3s limit)",
      block: await loadExample("hostile/infinite-loop.mts", {
        timeoutSeconds: 3,
      }),
      check: (result) => {
        expect(result.timedOut, "the block was not stopped");
        return result.error!;
      },
    },
  ]);
}
