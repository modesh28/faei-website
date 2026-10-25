// The admin page saves by committing straight to the site's GitHub repo; Vercel then
// redeploys in about a minute. Calls go through /api/github, which adds the GitHub key
// kept on the server, so the admin only needs a username and password.
const BRANCH = 'main';

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(session: string, path: string, init: { method?: string; body?: string } = {}): Promise<T> {
  const response = await fetch('/api/github', {
    method: 'POST',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body) : undefined }),
  });
  if (!response.ok) throw new GitHubError(`GitHub ${response.status}`, response.status);
  return response.json() as Promise<T>;
}

function fromBase64Utf8(base64: string): string {
  const bytes = Uint8Array.from(atob(base64.replace(/\s/g, '')), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Reads a JSON file from the repo, with its version (sha) to detect someone else's edit.
export async function readJson<T>(session: string, path: string): Promise<{ data: T; sha: string }> {
  const file = await call<{ content: string; sha: string }>(session, `/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  return { data: JSON.parse(fromBase64Utf8(file.content)) as T, sha: file.sha };
}

export async function fileSha(session: string, path: string): Promise<string> {
  return (await call<{ sha: string }>(session, `/contents/${path}?ref=${BRANCH}&t=${Date.now()}`)).sha;
}

export type NewFile = { path: string; text?: string; base64?: string };

// Writes several files in a single commit, so the site redeploys once.
export async function commitFiles(session: string, files: NewFile[], message: string): Promise<void> {
  const ref = await call<{ object: { sha: string } }>(session, `/git/ref/heads/${BRANCH}`);
  const head = await call<{ tree: { sha: string } }>(session, `/git/commits/${ref.object.sha}`);
  const tree = await Promise.all(files.map(async (file) => {
    const blob = await call<{ sha: string }>(session, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(file.base64 !== undefined ? { content: file.base64, encoding: 'base64' } : { content: file.text ?? '', encoding: 'utf-8' }),
    });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const newTree = await call<{ sha: string }>(session, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const commit = await call<{ sha: string }>(session, '/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }) });
  await call(session, `/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
}
