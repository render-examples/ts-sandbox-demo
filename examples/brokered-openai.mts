// No API key anywhere in this code or its environment. Render's credential broker adds it to
// requests that match the sandbox group's rule (GET /v1/models) as they leave the sandbox.
export default async function () {
  const allowed = await fetch("https://api.openai.com/v1/models");
  const unmatched = await fetch("https://api.openai.com/v1/files");
  const key = process.env.OPENAI_API_KEY;

  return {
    allowedStatus: allowed.status,
    unmatchedStatus: unmatched.status,
    keyVisibleToCode: typeof key === "string" && key.startsWith("sk-"),
  };
}
