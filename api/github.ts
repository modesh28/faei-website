// Lets a signed-in developer edit the site's files on GitHub without having their own key:
// the admin page sends the GitHub API call here and the server adds the key it keeps.
// Only the calls the admin page needs are allowed.

import { githubToken, json, connected, notConnected, REPO, sessionAccount } from './_lib.js';

const ALLOWED = /^(|\/contents\/public\/[\w\-./%]+(\?[\w=&%.-]*)?|\/git\/ref\/heads\/main|\/git\/commits(\/[a-f0-9]{40})?|\/git\/blobs|\/git\/trees|\/git\/refs\/heads\/main)$/;

export async function POST(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const me = await sessionAccount(request);
  if (!me) return json({ error: 'not-allowed' }, 401);
  if (me.role !== 'dev') return json({ error: 'not-allowed' }, 403);
  let call: { method?: string; path?: string; body?: unknown };
  try { call = await request.json() as typeof call; } catch { return json({ error: 'bad-json' }, 400); }
  const method = call.method ?? 'GET';
  const path = call.path ?? '';
  if (!['GET', 'POST', 'PATCH'].includes(method) || !ALLOWED.test(path)) return json({ error: 'not-allowed-path' }, 400);
  const token = await githubToken();
  if (!token) return json({ error: 'no-github-key' }, 503);
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faei-admin', ...(call.body ? { 'Content-Type': 'application/json' } : {}) },
    body: call.body ? JSON.stringify(call.body) : undefined,
  });
  return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
