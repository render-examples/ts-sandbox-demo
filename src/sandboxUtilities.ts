import { Render } from "@renderinc/sdk";
import type { SandboxesClient, SandboxNetworkPolicy } from "@renderinc/sdk/experimental";

let client: SandboxesClient | undefined;

export function getSandboxes(): SandboxesClient {
  client ??= new Render().experimental.sandboxes;
  return client;
}

export function networkPolicyFor(domains: string[]): SandboxNetworkPolicy {
  if (domains.length === 0) return { type: "deny-all" };
  return { type: "allow-list", rules: domains.map((domain) => ({ domain })) };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
