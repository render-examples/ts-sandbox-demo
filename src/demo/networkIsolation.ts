import { expect, loadExample, outputOf, runCases } from "./support.ts";

export async function demonstrateNetworkIsolation(): Promise<number> {
  return runCases([
    {
      name: "exfiltrate (allowlist: api.github.com)",
      block: await loadExample("hostile/exfiltrate.mts", {
        allowedDomains: ["api.github.com"],
      }),
      check: (result) => {
        const { attempts } = outputOf<{
          attempts: { target: string; reached: boolean; error?: string }[];
        }>(result);
        const leaked = attempts.filter((attempt) => attempt.reached);

        expect(
          leaked.length === 0,
          `reached ${leaked.map((attempt) => attempt.target).join(", ")}`,
        );

        return attempts
          .map(
            (attempt) =>
              `${new URL(attempt.target).host} blocked (${attempt.error})`,
          )
          .join(", ");
      },
    },
  ]);
}
