// A block that calls one external API. Its sandbox may reach api.github.com and nothing else.
export default async function (input: { repo: string }) {
  const res = await fetch(`https://api.github.com/repos/${input.repo}`, {
    headers: { "user-agent": "v5-code-block" },
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const repo = (await res.json()) as { full_name: string; stargazers_count: number };
  return { repo: repo.full_name, stars: repo.stargazers_count };
}
