import { expect, loadExample, outputOf, runCases } from "./support.ts";

export async function demonstrateCredentialBrokering(): Promise<number> {
  if (process.env.DEMO_BROKERING !== "1") {
    console.log(
      "  skipped: configure the brokered credential (README), then set DEMO_BROKERING=1",
    );
    return 0;
  }

  return runCases([
    {
      name: "brokered-openai (allowlist: api.openai.com)",
      block: await loadExample("brokered-openai.mts", {
        allowedDomains: ["api.openai.com"],
      }),
      check: (result) => {
        const output = outputOf<{
          allowedStatus: number;
          unmatchedStatus: number;
          keyVisibleToCode: boolean;
        }>(result);

        expect(output.allowedStatus === 200, `GET /v1/models returned ${output.allowedStatus}`);
        expect(
          output.unmatchedStatus !== 200,
          "GET /v1/files should be denied by the broker rule",
        );
        expect(!output.keyVisibleToCode, "the real key was visible inside the sandbox");

        return `/v1/models → ${output.allowedStatus}, /v1/files → ${output.unmatchedStatus}, key visible: no`;
      },
    },
  ]);
}
