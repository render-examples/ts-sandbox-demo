export interface CodeBlock {
  /** TypeScript source written by the end user. Must default-export a function of the block's input. */
  code: string;
  /** HTTPS hosts the block may call. Empty means no outbound network at all. */
  allowedDomains?: string[];
  /** Wall-clock limit for the user's code. */
  timeoutSeconds?: number;
}

export interface BlockResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  logs: string;
  timedOut: boolean;
  sandboxId: string;
  durationMs: number;
}

export interface HarnessResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}
