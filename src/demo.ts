import { demonstrateBasicExecution } from "./demo/basicExecution.ts";
import { demonstrateCredentialBrokering } from "./demo/credentialBrokering.ts";
import { demonstrateNetworkIsolation } from "./demo/networkIsolation.ts";
import {
  demonstrateCleanNextRun,
  demonstrateSandboxIsolation,
} from "./demo/sandboxIsolation.ts";
import { demonstrateTimeLimits } from "./demo/timeLimits.ts";

async function main() {
  let failures = 0;

  failures += await lesson(
    "1. Basic execution: independent blocks run in parallel",
    demonstrateBasicExecution,
  );
  failures += await lesson(
    "2. Network isolation: non-allowlisted hosts are unreachable",
    demonstrateNetworkIsolation,
  );
  failures += await lesson(
    "3. Time limits: runaway code is stopped inside the sandbox",
    demonstrateTimeLimits,
  );
  failures += await lesson(
    "4. Sandbox isolation: hostile code reaches only a disposable microVM",
    demonstrateSandboxIsolation,
  );
  failures += await lesson(
    "5. A fresh sandbox is unaffected by earlier hostile code",
    demonstrateCleanNextRun,
  );
  failures += await lesson(
    "6. Credential brokering: requests are authorized without exposing a key",
    demonstrateCredentialBrokering,
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

async function lesson(title: string, demonstrate: () => Promise<number>): Promise<number> {
  console.log(`\n${title}`);
  return demonstrate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
