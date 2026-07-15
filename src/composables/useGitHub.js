import { state, setStatus } from "../store.js";

// GitHub integration, mirroring the ClickUp composable: the user's personal
// access token lives only in localStorage and is sent as a Bearer header. All
// calls are made directly from the browser. We use the GraphQL API for the PR
// list so a single request yields each PR's review decision and CI rollup
// (the REST equivalent would need several calls per PR).

export function ghReady(){ return !!state.config.githubToken; }

async function ghRest(path){
  const token = state.config.githubToken;
  if (!token) throw new Error("Missing GitHub token");
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok){
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  return res.json();
}

async function ghGraphql(query, variables){
  const token = state.config.githubToken;
  if (!token) throw new Error("Missing GitHub token");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok){
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  const json = await res.json();
  if (json.errors && json.errors.length){
    throw new Error("GitHub: " + json.errors.map(e => e.message).join("; "));
  }
  return json.data;
}

export async function ghLoadAccount(){
  const u = await ghRest("/user");
  state.ghUser = u;
}

// We query via `search` (rather than `viewer.pullRequests`) so an optional
// organisation filter is applied server-side, before the result cap — the query
// string always scopes to open PRs authored by the token owner.
const PRS_QUERY = `
query($q: String!, $n: Int!) {
  search(query: $q, type: ISSUE, first: $n) {
    nodes {
      ... on PullRequest {
        title
        number
        isDraft
        url
        createdAt
        reviewDecision
        repository { nameWithOwner }
        comments { totalCount }
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }
}`;

// Load open pull requests authored by the authenticated user, normalized into
// the flat shape the PRs view model consumes. Review decision and CI status
// come straight from GitHub's rollups. When `githubOrg` is configured, only PRs
// in repositories owned by that org/user are loaded.
export async function ghLoadPRs(){
  state.ghPrs = [];
  if (!ghReady()) return;
  try {
    let q = "is:pr is:open author:@me sort:updated-desc";
    const org = (state.config.githubOrg || "").trim();
    if (org) q += ` org:${org}`;
    const data = await ghGraphql(PRS_QUERY, { q, n: 50 });
    const nodes = (data?.search?.nodes || []).filter(n => n && n.url);
    state.ghPrs = nodes.map(n => ({
      title: n.title,
      repo: n.repository?.nameWithOwner || "",
      num: n.number,
      url: n.url,
      isDraft: n.isDraft,
      reviewDecision: n.reviewDecision || null,
      ciState: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || null,
      createdAt: n.createdAt,
      comments: n.comments?.totalCount || 0,
    }));
  } catch (err){
    setStatus("GitHub: " + err.message);
  }
}
