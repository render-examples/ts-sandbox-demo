import { expect, loadExample, outputOf, runCases } from "./support.ts";

const ORDERS = {
  orders: [
    { id: "o_1", amount: 120, currency: "USD" },
    { id: "o_2", amount: 80, currency: "USD" },
    { id: "o_3", amount: 45, currency: "EUR" },
  ],
};

export async function demonstrateBasicExecution(): Promise<number> {
  return runCases([
    {
      name: "transform (no network)",
      block: await loadExample("transform.mts"),
      input: ORDERS,
      check: (result) => {
        const totals = outputOf<{ totals: Record<string, number> }>(result).totals;
        expect(
          totals.USD === 200 && totals.EUR === 45,
          `unexpected totals ${JSON.stringify(totals)}`,
        );
        return `totals ${JSON.stringify(totals)}`;
      },
    },
    {
      name: "github-stars (allowlist: api.github.com)",
      block: await loadExample("github-stars.mts", {
        allowedDomains: ["api.github.com"],
      }),
      input: { repo: "render-oss/sdk" },
      check: (result) => {
        const { repo, stars } = outputOf<{ repo: string; stars: number }>(result);
        return `${repo} has ${stars} stars`;
      },
    },
    {
      name: "zod-axios (allowlist: api.github.com)",
      block: await loadExample("zod-axios.mts", {
        allowedDomains: ["api.github.com"],
      }),
      input: { repo: "colinhacks/zod" },
      check: (result) => {
        const { repo, stars, license } = outputOf<{
          repo: string;
          stars: number;
          license: string | null;
        }>(result);
        return `${repo}: ${stars} stars, ${license} license`;
      },
    },
    {
      name: "zod-axios with invalid input",
      block: await loadExample("zod-axios.mts", {
        allowedDomains: ["api.github.com"],
      }),
      input: { repo: "not a repo" },
      check: (result) => {
        expect(
          !result.ok && result.error?.includes("owner/name") === true,
          `expected a zod error, got ${result.error}`,
        );
        return "rejected by zod: repo must look like owner/name";
      },
    },
  ]);
}
