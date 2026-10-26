// Uses libraries preinstalled in the runner snapshot: zod validates the input and the API
// response, axios makes the call. The sandbox may reach api.github.com and nothing else.
import axios from "axios";
import { z } from "zod";

const Input = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "repo must look like owner/name"),
});

const Repo = z.object({
  full_name: z.string(),
  stargazers_count: z.number(),
  license: z.object({ spdx_id: z.string() }).nullable(),
});

export default async function (input: unknown) {
  const { repo } = Input.parse(input);
  const { data } = await axios.get(`https://api.github.com/repos/${repo}`, {
    headers: { "user-agent": "v5-code-block" },
    timeout: 5000,
  });
  const parsed = Repo.parse(data);
  return { repo: parsed.full_name, stars: parsed.stargazers_count, license: parsed.license?.spdx_id ?? null };
}
