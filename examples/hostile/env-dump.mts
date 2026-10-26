// Looks for credentials in the process environment and in PID 1's environment.
import { readFileSync } from "node:fs";

const SECRET_SHAPES = [/^rnd_/, /^sk-/, /^ghp_/, /^github_pat_/, /^xox[abp]-/, /^AKIA/];

export default function () {
  const values = [...Object.values(process.env), ...readPid1Environ()];
  const secretsFound = values.filter((v) => v && SECRET_SHAPES.some((shape) => shape.test(v)));
  return { envKeys: Object.keys(process.env).sort(), secretsFound: secretsFound.length };
}

function readPid1Environ(): string[] {
  try {
    return readFileSync("/proc/1/environ", "utf8")
      .split("\0")
      .map((entry) => entry.slice(entry.indexOf("=") + 1));
  } catch {
    return [];
  }
}
