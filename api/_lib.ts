// Shared helpers for the small FAEI server (Vercel functions in /api).
// Data lives in Upstash Redis, connected from the Vercel dashboard (Storage → Upstash → Connect).

declare const process: { env: Record<string, string | undefined> };

export const REPO = 'modesh28/faei-website';

const redisUrl = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
export const connected = () => !!redisUrl() && !!redisToken();

export async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const response = await fetch(`${redisUrl()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`redis ${response.status}`);
  return ((await response.json()) as { result: unknown }[]).map((item) => item.result);
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
export const notConnected = () => json({ error: 'not-connected' }, 503);

export function randomId(bytes = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Passwords are stored only as a salted PBKDF2 hash.
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const SESSION_SECONDS = 60 * 24 * 3600;

// The signed-in admin's username, or '' when the request has no valid session.
export async function sessionUser(request: Request): Promise<string> {
  const session = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!/^[a-f0-9]{48}$/.test(session)) return '';
  const [user] = await redis([['GET', `session:${session}`]]);
  return typeof user === 'string' ? user : '';
}

export async function githubToken(): Promise<string> {
  const [token] = await redis([['GET', 'config:github']]);
  return typeof token === 'string' ? token : '';
}

// True when a GitHub key may change the site's repo.
export async function githubCanPush(token: string): Promise<boolean> {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faei-admin' },
  });
  if (!response.ok) return false;
  return !!((await response.json()) as { permissions?: { push?: boolean } }).permissions?.push;
}
