// The admin page saves by committing straight to the site's GitHub repo; Vercel then
// redeploys in about a minute. The key (a GitHub token) stays only on this phone.
const REPO = 'modesh28/faei-website';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}`;

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw new GitHubError(`GitHub ${response.status}`, response.status);
  return response.json() as Promise<T>;
}

// True when the key works and is allowed to change the repo.
export async function checkKey(token: string): Promise<boolean> {
  const repo = await call<{ permissions?: { push?: boolean } }>(token, '');
  return !!repo.permissions?.push;
}

function fromBase64Utf8(base64: string): string {
  const bytes = Uint8Array.from(atob(base64.replace(/\s/g, '')), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Reads a JSON file from the repo, with its version (sha) to detect someone else's edit.
export async function readJson<T>(token: string, path: string): Promise<{ data: T; sha: string }> {
  const file = await call<{ content: string; sha: string }>(token, `/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  return { data: JSON.parse(fromBase64Utf8(file.content)) as T, sha: file.sha };
}

export async function fileSha(token: string, path: string): Promise<string> {
  return (await call<{ sha: string }>(token, `/contents/${path}?ref=${BRANCH}&t=${Date.now()}`)).sha;
}

export type NewFile = { path: string; text?: string; base64?: string };

// Writes several files in a single commit, so the site redeploys once.
export async function commitFiles(token: string, files: NewFile[], message: string): Promise<void> {
  const ref = await call<{ object: { sha: string } }>(token, `/git/ref/heads/${BRANCH}`);
  const head = await call<{ tree: { sha: string } }>(token, `/git/commits/${ref.object.sha}`);
  const tree = await Promise.all(files.map(async (file) => {
    const blob = await call<{ sha: string }>(token, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(file.base64 !== undefined ? { content: file.base64, encoding: 'base64' } : { content: file.text ?? '', encoding: 'utf-8' }),
    });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const newTree = await call<{ sha: string }>(token, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
  const commit = await call<{ sha: string }>(token, '/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }) });
  await call(token, `/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
}
