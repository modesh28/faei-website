// Admin accounts for /admin: username + password, no GitHub key needed day to day.
// The first visit sets things up once (a GitHub key the server keeps, and the first account).
// Roles: "admin" can do everything; "staff" only sees and updates orders.
//
//   POST /api/admin  { action: 'state' | 'setup' | 'login' | 'logout' | 'me' | 'users' | 'add-user' | 'remove-user' | 'password', … }

import { connected, githubCanPush, hashPassword, json, notConnected, randomId, redis, SESSION_SECONDS, sessionUser } from './_lib.js';

type Account = { salt: string; hash: string; role: 'admin' | 'staff' };
const validName = (name: unknown): name is string => typeof name === 'string' && /^[a-z0-9_.-]{3,30}$/.test(name);
const validPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= 6 && password.length <= 100;

async function account(name: string): Promise<Account | null> {
  const [stored] = await redis([['HGET', 'users', name]]);
  return typeof stored === 'string' ? JSON.parse(stored) as Account : null;
}
async function saveAccount(name: string, password: string, role: Account['role']) {
  const salt = randomId(16);
  const record: Account = { salt, hash: await hashPassword(password, salt), role };
  await redis([['HSET', 'users', name, JSON.stringify(record)]]);
}
async function startSession(name: string) {
  const session = randomId();
  await redis([['SET', `session:${session}`, name, 'EX', SESSION_SECONDS]]);
  return session;
}

export async function POST(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: 'bad-json' }, 400); }
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';

  switch (body.action) {
    case 'state': {
      const [count] = await redis([['HLEN', 'users']]);
      return json({ setUp: Number(count) > 0 });
    }
    case 'setup': {
      const [count] = await redis([['HLEN', 'users']]);
      if (Number(count) > 0) return json({ error: 'already-set-up' }, 409);
      if (!validName(username)) return json({ error: 'bad-username' }, 400);
      if (!validPassword(body.password)) return json({ error: 'bad-password' }, 400);
      const token = typeof body.githubToken === 'string' ? body.githubToken.trim() : '';
      if (!token || !(await githubCanPush(token))) return json({ error: 'bad-github-key' }, 400);
      await redis([['SET', 'config:github', token]]);
      await saveAccount(username, body.password, 'admin');
      return json({ session: await startSession(username), username, role: 'admin' });
    }
    case 'login': {
      // Ten wrong tries lock that username for 15 minutes.
      const [fails] = await redis([['GET', `login-fail:${username}`]]);
      if (Number(fails) >= 10) return json({ error: 'locked' }, 429);
      const found = validName(username) ? await account(username) : null;
      const password = typeof body.password === 'string' ? body.password : '';
      if (!found || (await hashPassword(password, found.salt)) !== found.hash) {
        await redis([['INCR', `login-fail:${username}`], ['EXPIRE', `login-fail:${username}`, 900]]);
        return json({ error: 'wrong' }, 401);
      }
      await redis([['DEL', `login-fail:${username}`]]);
      return json({ session: await startSession(username), username, role: found.role });
    }
  }

  const me = await sessionUser(request);
  const mine = me ? await account(me) : null;
  if (!me || !mine) return json({ error: 'not-allowed' }, 401);

  switch (body.action) {
    case 'me':
      return json({ username: me, role: mine.role });
    case 'logout': {
      const session = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      await redis([['DEL', `session:${session}`]]);
      return json({ ok: true });
    }
    case 'password': {
      if (!validPassword(body.password)) return json({ error: 'bad-password' }, 400);
      await saveAccount(me, body.password, mine.role);
      return json({ ok: true });
    }
  }

  if (mine.role !== 'admin') return json({ error: 'not-allowed' }, 403);
  switch (body.action) {
    case 'users': {
      const [all] = await redis([['HGETALL', 'users']]) as [string[]];
      const users: { username: string; role: string }[] = [];
      for (let i = 0; i < all.length; i += 2) users.push({ username: all[i], role: (JSON.parse(all[i + 1]) as Account).role });
      return json({ users });
    }
    case 'add-user': {
      if (!validName(username)) return json({ error: 'bad-username' }, 400);
      if (!validPassword(body.password)) return json({ error: 'bad-password' }, 400);
      if (await account(username)) return json({ error: 'exists' }, 409);
      await saveAccount(username, body.password, body.role === 'admin' ? 'admin' : 'staff');
      return json({ ok: true });
    }
    case 'remove-user': {
      if (username === me) return json({ error: 'self' }, 400);
      await redis([['HDEL', 'users', username]]);
      return json({ ok: true });
    }
  }
  return json({ error: 'unknown-action' }, 400);
}
