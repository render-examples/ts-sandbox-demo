# Run user-written TypeScript in Render Sandboxes

A minimal pattern for running end-user code inside a workflow builder. Each code block in your builder runs in its own Render Sandbox, a Firecracker microVM. Your workflow engine stays where it is. Where you would have called `node:vm`, call `runCodeBlock()`.

```
Workflow engine (your backend: holds the Render API key)
   │  runCodeBlock({ code, allowedDomains }, input)
   ▼
One sandbox per run (microVM, from the "v5-ts-runner" snapshot)
   ├─ network: deny-all, or only its allowedDomains (HTTPS)
   ├─ credentials: brokered outside the VM, never visible to user code
   └─ user code + input.json → harness → output.json
   │
   ▼  output, logs, timedOut → terminated
```

## What's here

| Path | Purpose |
| --- | --- |
| `src/runCodeBlock.ts` | The function you copy into your builder. |
| `src/harness.mts` | Runs inside the sandbox: loads the user code, calls it, writes `output.json`. |
| `src/setup.ts` | One-time setup: installs `tsx` and the libraries user code can import (`zod`, `axios`) in a sandbox and saves it as a snapshot. |
| `src/demo.ts` | Runs the examples and checks every outcome. |
| `examples/` | Sample user code: three well-behaved examples, one that uses a brokered credential, and five hostile ones. |

## Run it

Requires Node 22.9+ and a workspace with Sandboxes enabled.

```bash
cp .env.example .env      # add RENDER_API_KEY and RENDER_WORKSPACE_ID
npm install
npm run setup             # builds the runner snapshot, about a minute
npm run demo
```

The demo:

1. **Runs several examples in parallel, each in its own sandbox:**
   - a pure transform with no network access;
   - a `fetch` call to `api.github.com`, the only domain on its allowlist;
   - the same call made with axios, with input and response validated by zod;
   - the zod example again with invalid input, to show how a validation error comes back.
2. **Calls OpenAI with no key in the code or its environment.** The credential broker adds the key as matching requests leave the sandbox. This needs one-time setup (see below).
3. **Runs hostile code and confirms each attempt is contained:**
   - dumping the environment finds no secrets;
   - posting data to a domain that isn't allowlisted is blocked;
   - an infinite loop is stopped at its time limit;
   - a `node:vm` escape lands in a disposable VM with none of the host's files;
   - `rm -rf /` destroys only its own sandbox.
4. **Runs a well-behaved example again** to show the next run still gets a clean sandbox.

## Writing user code

User code is a TypeScript module that default-exports a function of its input. The function can be async, and its return value must be JSON-serializable.

```ts
import axios from "axios";
import { z } from "zod";

const Input = z.object({ repo: z.string() });

export default async function (input: unknown) {
  const { repo } = Input.parse(input);
  const { data } = await axios.get(`https://api.github.com/repos/${repo}`);
  return { stars: data.stargazers_count };
}
```

- **Imports:** Node built-ins plus the libraries preinstalled in the snapshot, currently `zod` and `axios`. User code can't install packages itself, because its sandbox can't reach the npm registry.
- **Adding a library:** add it to `RUNNER_PACKAGES` in `src/runCodeBlock.ts`, then rerun `npm run setup`.
- **Errors:** if the code throws, including on a failed zod `parse`, the result has `ok: false` and the error message.

In your builder:

```ts
const result = await runCodeBlock(
  { code: userCode, allowedDomains: ["api.github.com"], timeoutSeconds: 10 },
  previousStepOutput,
);
if (!result.ok) failStep(result.error, result.logs);
```

## Credential brokering

Brokered credentials are configured on the sandbox group, not per sandbox. Every sandbox in the group inherits the same rules. Brokering is in early access, so ask your Render contact to enable it for your workspace.

To configure the rule the demo expects, open your sandbox group in the Render Dashboard, go to **Environment → Brokered credentials**, and add:

| Field | Value |
| --- | --- |
| Key | `OPENAI_API_KEY` |
| Preset | OpenAI (`api.openai.com`, `Authorization: Bearer`) |
| Allowed requests | `GET`, path exactly `/v1/models` |
| Unmatched requests | Deny (the default) |

Then set `DEMO_BROKERING=1` in `.env` and rerun the demo. The example gets `200` from `/v1/models` and is denied on `/v1/files`.

Two rules apply:

- **A credential doesn't grant network access.** The brokered host must also be in `allowedDomains`.
- **Credentials apply to the whole group.** Use them for credentials your platform owns. Brokering each end user's own keys separately needs multiple sandbox groups or per-sandbox credential selection. Neither is available yet.

## Rules this code follows

- **No Render API key in the sandbox.** Anything the sandbox can reach, user code can reach.
- **Pass a network policy on every create.** A sandbox restored from a snapshot without an explicit policy comes up with no working egress.
- **Enforce the time limit inside the sandbox** with `timeout`. Aborting `exec` from the SDK doesn't stop the remote process.
- **Return output through a file, not stdout,** so `console.log` output from user code stays in `logs`.
- **Always terminate in `finally`.** `timeoutSeconds` on create is only a backstop.

## Limits to know

- **SDK version.** Sandboxes are under `render.experimental.sandboxes` in `@renderinc/sdk` 1.4.0. Expect the namespace to move at GA.
- **Allowlists are HTTPS only,** with wildcards only in the leftmost label. A sandbox's policy can't change after creation.
- **Rate limits.** Each run makes about 10 API calls (create, status polls, two uploads, exec, download, terminate), and every exec and file operation counts against the API rate limit. `withRetry` backs off on 429s.
- **Snapshot expiry.** The runner snapshot expires after Render's default lifetime, 30 days at the time of writing. Rerun `npm run setup` before then, or schedule it as a cron job.
