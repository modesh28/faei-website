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

// v8: a V8 Coffee To Go employee, who sees V8's orders only.
export type Role = 'dev' | 'admin' | 'staff' | 'v8';
export const ROLES: Role[] = ['dev', 'admin', 'staff', 'v8'];

// The signed-in user's name and role, or null without a valid session.
export async function sessionAccount(request: Request): Promise<{ username: string; role: Role } | null> {
  const username = await sessionUser(request);
  if (!username) return null;
  const [stored] = await redis([['HGET', 'users', username]]);
  if (typeof stored !== 'string') return null;
  return { username, role: (JSON.parse(stored) as { role: Role }).role };
}

// Before there were three roles, "admin" could do everything. Those accounts become developers once.
export async function upgradeRoles() {
  const [done] = await redis([['GET', 'config:roles']]);
  if (done === '3') return;
  const [all] = await redis([['HGETALL', 'users']]) as [string[]];
  const commands: (string | number)[][] = [];
  for (let i = 0; i < all.length; i += 2) {
    const record = JSON.parse(all[i + 1]) as { role: string };
    if (record.role === 'admin') commands.push(['HSET', 'users', all[i], JSON.stringify({ ...record, role: 'dev' })]);
  }
  commands.push(['SET', 'config:roles', '3']);
  await redis(commands);
}

export async function githubToken(): Promise<string> {
  const [token] = await redis([['GET', 'config:github']]);
  return typeof token === 'string' ? token : '';
}

// Reads and writes one JSON file in the site's repo (a commit straight to main).
export async function githubFile(token: string, path: string): Promise<{ text: string; sha: string }> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=main`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faei-admin' },
  });
  if (!response.ok) throw new Error(`github ${response.status}`);
  const data = await response.json() as { content: string; sha: string };
  const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, '')), (char) => char.charCodeAt(0));
  return { text: new TextDecoder().decode(bytes), sha: data.sha };
}
export async function githubWrite(token: string, path: string, text: string, sha: string, message: string): Promise<number> {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faei-admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: btoa(binary), sha, branch: 'main' }),
  });
  return response.status;
}

// True when a GitHub key may change the site's repo.
export async function githubCanPush(token: string): Promise<boolean> {
  const response = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'faei-admin' },
  });
  if (!response.ok) return false;
  return !!((await response.json()) as { permissions?: { push?: boolean } }).permissions?.push;
}

// Customers, kept for good (orders expire after 35 days): one entry per phone number in the
// Redis hash "customers". Cancelled orders don't count.
export type Customer = { phone: string; orders: number; total: number; first: number; last: number; lastOrder: string; items?: Record<string, number> };
export const validPhone = (phone: unknown): phone is string => typeof phone === 'string' && /^07[789]\d{7}$/.test(phone);
export async function countCustomerOrder(order: { phone?: unknown; total?: unknown; createdAt?: unknown; id?: unknown; items?: unknown }, sign: 1 | -1) {
  if (!validPhone(order.phone)) return;
  const [stored, ready] = await redis([['HGET', 'customers', order.phone], ['GET', 'config:customers']]);
  // Until the first look at the customers tab counts the existing orders, it will count this one too.
  if (ready !== '1') return;
  const time = Number(order.createdAt) || Date.now();
  const current: Customer = typeof stored === 'string' ? JSON.parse(stored) as Customer : { phone: order.phone, orders: 0, total: 0, first: time, last: time, lastOrder: '' };
  current.orders = Math.max(0, current.orders + sign);
  current.total = Math.max(0, Math.round((current.total + sign * (Number(order.total) || 0)) * 1000) / 1000);
  // What they order, so the shop knows its regulars' favourites.
  const items = current.items ?? {};
  if (Array.isArray(order.items)) for (const line of order.items as { name?: string; quantity?: number }[]) {
    if (!line?.name) continue;
    const next = (items[line.name] ?? 0) + sign * (Number(line.quantity) || 1);
    if (next > 0) items[line.name] = next; else delete items[line.name];
  }
  current.items = items;
  if (sign > 0) {
    current.first = Math.min(current.first, time);
    if (time >= current.last) { current.last = time; current.lastOrder = String(order.id ?? ''); }
  }
  await redis([['HSET', 'customers', order.phone, JSON.stringify(current)]]);
}
