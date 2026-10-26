// Runs inside the sandbox. Loads the user's block, calls it with the input, and writes the result
// to a file so the block's own console output can't be mistaken for its return value.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [blockPath, inputPath, outputPath] = process.argv.slice(2);

async function run(): Promise<unknown> {
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const block = await import(pathToFileURL(blockPath).href);
  if (typeof block.default !== "function") {
    throw new Error("A code block must `export default` a function.");
  }
  return await block.default(input);
}

try {
  const output = await run();
  await writeFile(outputPath, JSON.stringify({ ok: true, output: output ?? null }));
} catch (err) {
  const error = err instanceof Error ? err.message : String(err);
  await writeFile(outputPath, JSON.stringify({ ok: false, error }));
  process.exitCode = 1;
}

// Timers or sockets the block left open would otherwise hold the process until the time limit.
process.exit();
