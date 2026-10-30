// Live orders for the admin page. Orders are kept in a small Redis database (Upstash, added
// from the Vercel dashboard: Storage → Upstash Redis → Connect). Until it's connected every
// call answers 503 and the site works as before: WhatsApp + the Google Sheet.
//
//   POST  /api/orders          the website records a new order (public)
//   POST  /api/orders {action: 'sent' | 'cancel', ref}
//                              the customer, back from WhatsApp, says they sent the message, or takes
//                              the order back (to change it or cancel). Only the customer's phone knows the ref.
//   GET   /api/orders?ref=…    a customer's phone asks for its order's status (public, status only)
//   GET   /api/orders?version  a number that changes with every order or status change (public),
//                              so the admin page only downloads the list when something changed
//   GET   /api/orders?busy     whether FAEI is swamped right now (public), so the site shows "rush hour" outside 11–1 too
//   GET   /api/orders?popular  the most ordered FAEI items of the last 14 days (public), for the "الأكثر طلباً" badge
//   GET   /api/orders          the admin page lists recent orders (needs a signed-in account)
//   PATCH /api/orders          the admin page changes an order's status (needs a signed-in admin)

import { connected, countCustomerOrder, json, notConnected, redis, type Role, sessionAccount } from './_lib.js';

// The admin screens ask for the version every few seconds. An instance that answered in the
// last second and a half reuses its answer, which keeps the free Redis plan well within limits.
let lastVersion = { value: 0, at: 0 };
// The most ordered items change slowly, so one count serves everyone for ten minutes.
let lastPopular = { names: [] as string[], at: 0 };
const POPULAR_TOP = 4;
// "Busy" = this many FAEI orders still open (new or being made), or arrived in the last 20 minutes.
const BUSY_OPEN = 6;
const BUSY_RECENT = 6;
let lastBusy = { busy: false, at: 0 };
const POPULAR_MIN = 3;

// Kept 35 days, so the sales page can show the last few weeks.
const KEEP_SECONDS = 35 * 24 * 3600;
const STATUSES = ['جديد', 'عم يتحضّر', 'جاهز', 'تم', 'ملغي'];
const validRef = (ref: unknown): ref is string => typeof ref === 'string' && /^[a-z0-9]{8,20}$/.test(ref);

const text = (value: unknown, max = 300) => String(value ?? '').slice(0, max);
const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1000 ? value : 0);

export async function POST(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const raw = await request.text();
  if (raw.length > 8000) return json({ error: 'too-big' }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return json({ error: 'bad-json' }, 400); }
  if (!validRef(body.ref)) return json({ error: 'bad-ref' }, 400);
  if (body.action === 'sent' || body.action === 'cancel') return customerAnswer(body.ref, body.action, body.reason === 'edit');
  const items = Array.isArray(body.items) ? body.items.slice(0, 40).map((item) => {
    const line = item as Record<string, unknown>;
    return { name: text(line.name, 120), quantity: Math.min(99, Math.max(1, Math.round(Number(line.quantity) || 1))), price: amount(line.price) };
  }) : [];
  const order = {
    ref: body.ref,
    id: text(body.id, 20),
    // Orders for V8 (the coffee house inside FAEI) show on their own list.
    ...(body.shop === 'v8' ? { shop: 'v8' } : {}),
    createdAt: Date.now(),
    status: 'جديد',
    items,
    extras: text(body.extras, 500),
    fulfillment: text(body.fulfillment, 60),
    address: text(body.address, 300),
    phone: text(body.phone, 20).replace(/[^\d+]/g, ''),
    time: text(body.time, 40),
    payment: text(body.payment, 30),
    preorder: body.preorder === true,
    discount: amount(body.discount),
    delivery: typeof body.delivery === 'string' ? text(body.delivery, 30) : amount(body.delivery),
    total: amount(body.total),
  };
  const [created] = await redis([['SET', `order:${order.ref}`, JSON.stringify(order), 'EX', KEEP_SECONDS, 'NX']]);
  if (created !== 'OK') return json({ ok: true, duplicate: true });
  // A customer who came back to change their order: the old one leaves the shop's screen while it's still new.
  if (validRef(body.replaces) && body.replaces !== order.ref) {
    const [old] = await redis([['GET', `order:${body.replaces}`]]);
    const previous = old ? JSON.parse(old as string) as Record<string, unknown> : null;
    if (previous && previous.status === 'جديد') {
      Object.assign(previous, { status: 'ملغي', 'at_ملغي': Date.now(), cancelledBy: 'edit', replacedBy: order.id });
      await redis([['SET', `order:${body.replaces}`, JSON.stringify(previous), 'KEEPTTL']]);
      await countCustomerOrder(previous, -1);
    }
  }
  const [, , version] = await redis([['LPUSH', 'orders', order.ref], ['LTRIM', 'orders', 0, 1999], ['INCR', 'orders:version']]);
  await countCustomerOrder(order, 1);
  lastVersion = { value: Number(version) || 0, at: Date.now() };
  return json({ ok: true });
}

async function customerAnswer(ref: string, action: 'sent' | 'cancel', edit: boolean): Promise<Response> {
  const [stored] = await redis([['GET', `order:${ref}`]]);
  if (!stored) return json({ error: 'not-found' }, 404);
  const order = JSON.parse(stored as string) as Record<string, unknown>;
  if (action === 'cancel') {
    // Once the kitchen started, the customer has to talk to the shop instead.
    if (order.status !== 'جديد') return json({ error: 'started', status: order.status }, 409);
    Object.assign(order, { status: 'ملغي', 'at_ملغي': Date.now(), cancelledBy: edit ? 'edit' : 'customer' });
    await countCustomerOrder(order, -1);
  } else {
    order.customerSent = Date.now();
  }
  const [, version] = await redis([['SET', `order:${ref}`, JSON.stringify(order), 'KEEPTTL'], ['INCR', 'orders:version']]);
  lastVersion = { value: Number(version) || 0, at: Date.now() };
  return json({ ok: true });
}

// Counts real orders from the last 14 days (cancelled ones and V8's left out). An item needs a
// few orders before it gets the badge, so one order doesn't make anything "the most ordered".
async function popular(): Promise<Response> {
  if (Date.now() - lastPopular.at > 10 * 60_000) {
    const [refs] = await redis([['LRANGE', 'orders', 0, 1999]]) as [string[]];
    const counts = new Map<string, number>();
    if (refs.length) {
      const [values] = await redis([['MGET', ...refs.map((item) => `order:${item}`)]]) as [(string | null)[]];
      const since = Date.now() - 14 * 24 * 3600_000;
      for (const value of values) {
        if (!value) continue;
        const order = JSON.parse(value) as { shop?: string; status?: string; createdAt?: number; items?: { name: string; quantity: number }[] };
        if (order.shop === 'v8' || order.status === 'ملغي' || (order.createdAt ?? 0) < since) continue;
        for (const item of order.items ?? []) {
          if (item.name.startsWith('V8 · ')) continue;
          counts.set(item.name, (counts.get(item.name) ?? 0) + (item.quantity || 1));
        }
      }
    }
    const names = [...counts].filter(([, count]) => count >= POPULAR_MIN).sort((a, b) => b[1] - a[1]).slice(0, POPULAR_TOP).map(([name]) => name);
    lastPopular = { names, at: Date.now() };
  }
  return new Response(JSON.stringify({ names: lastPopular.names }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}

async function busy(): Promise<Response> {
  if (Date.now() - lastBusy.at > 30_000) {
    const [refs] = await redis([['LRANGE', 'orders', 0, 59]]) as [string[]];
    let open = 0;
    let recent = 0;
    if (refs.length) {
      const [values] = await redis([['MGET', ...refs.map((item) => `order:${item}`)]]) as [(string | null)[]];
      const since = Date.now() - 20 * 60_000;
      const stale = Date.now() - 90 * 60_000;
      for (const value of values) {
        if (!value) continue;
        const order = JSON.parse(value) as { shop?: string; status?: string; createdAt?: number };
        if (order.shop === 'v8' || order.status === 'ملغي') continue;
        const created = order.createdAt ?? 0;
        // Orders nobody closed for hours don't count, so a forgotten card doesn't keep the site "busy".
        if ((order.status === 'جديد' || order.status === 'عم يتحضّر') && created > stale) open += 1;
        if (created > since) recent += 1;
      }
    }
    lastBusy = { busy: open >= BUSY_OPEN || recent >= BUSY_RECENT, at: Date.now() };
  }
  return new Response(JSON.stringify({ busy: lastBusy.busy }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
}

export async function GET(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const params = new URL(request.url).searchParams;
  if (params.has('version')) {
    if (Date.now() - lastVersion.at < 1500) return json({ version: lastVersion.value });
    const [version] = await redis([['GET', 'orders:version']]);
    lastVersion = { value: Number(version) || 0, at: Date.now() };
    return json({ version: lastVersion.value });
  }
  if (params.has('popular')) return popular();
  if (params.has('busy')) return busy();
  const ref = params.get('ref');
  if (ref !== null) {
    if (!validRef(ref)) return json({ error: 'bad-ref' }, 400);
    const [stored] = await redis([['GET', `order:${ref}`]]);
    return json({ status: stored ? (JSON.parse(stored as string) as { status: string }).status : '' });
  }
  const me = await sessionAccount(request);
  if (!me) return json({ error: 'not-allowed' }, 401);
  // Staff see today's work; the long list behind the sales page is for the shop's managers.
  const limit = Math.min(me.role === 'staff' ? 150 : 1000, Math.max(1, Number(params.get('limit')) || 150));
  const [refs, version] = await redis([['LRANGE', 'orders', 0, limit - 1], ['GET', 'orders:version']]) as [string[], string | null];
  if (!refs.length) return json({ orders: [], version: Number(version) || 0 });
  const [values] = await redis([['MGET', ...refs.map((item) => `order:${item}`)]]) as [(string | null)[]];
  const orders = values.filter(Boolean).map((value) => JSON.parse(value as string) as { shop?: string }).filter((order) => seesOrder(me.role, order));
  return json({ orders, version: Number(version) || 0 });
}

// V8's orders (the coffee house inside FAEI) go to V8's own employee accounts and the developer;
// FAEI's staff and managers don't see them, and V8's employees see nothing else.
function seesOrder(role: Role, order: { shop?: string }): boolean {
  return role === 'dev' || (role === 'v8') === (order.shop === 'v8');
}

export async function PATCH(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const me = await sessionAccount(request);
  if (!me) return json({ error: 'not-allowed' }, 401);
  let body: { ref?: unknown; status?: unknown };
  try { body = await request.json() as { ref?: unknown; status?: unknown }; } catch { return json({ error: 'bad-json' }, 400); }
  if (!validRef(body.ref) || typeof body.status !== 'string' || !STATUSES.includes(body.status)) return json({ error: 'bad-request' }, 400);
  const [stored] = await redis([['GET', `order:${body.ref}`]]);
  if (!stored) return json({ error: 'not-found' }, 404);
  const before = JSON.parse(stored as string) as Record<string, unknown>;
  if (!seesOrder(me.role, before as { shop?: string })) return json({ error: 'not-allowed' }, 403);
  const order = { ...before, status: body.status, [`at_${body.status}`]: Date.now() };
  if (before.status !== 'ملغي' && body.status === 'ملغي') await countCustomerOrder(order, -1);
  if (before.status === 'ملغي' && body.status !== 'ملغي') await countCustomerOrder(order, 1);
  const [, version] = await redis([['SET', `order:${body.ref}`, JSON.stringify(order), 'KEEPTTL'], ['INCR', 'orders:version']]);
  lastVersion = { value: Number(version) || 0, at: Date.now() };
  return json({ ok: true, order });
}
