// The cashier's own data, kept in Redis (no GitHub, no Google Sheet):
//   pos:catalog  JSON { goods: [...], barcodes: { code: "productId::option" } }
//                goods = shop items sold at the counter only (drinks, chips…), not shown on the site.
//   stock        hash productId → pieces left (only items someone counted are tracked).
//
//   GET  /api/pos                      catalog + stock (signed-in FAEI account)
//   POST /api/pos {action:'catalog', catalog, version}   save goods and barcodes (admin/dev)
//   POST /api/pos {action:'stock', id, set?: number|null, add?: number}
//        set = the count from a stock take (null stops tracking), add = goods received (admin/dev)

import { connected, json, notConnected, preflight, redis, sessionAccount, validPid } from './_lib.js';

type Good = { id: string; name: string; priceFils: number; category: string; image?: string };
type Catalog = { goods: Good[]; barcodes: Record<string, string> };

export function OPTIONS(): Response { return preflight(); }

async function readAll() {
  const [catalog, stock, version] = await redis([['GET', 'pos:catalog'], ['HGETALL', 'stock'], ['GET', 'pos:version']]) as [string | null, string[], string | null];
  const counts: Record<string, number> = {};
  for (let i = 0; i < (stock?.length ?? 0); i += 2) counts[stock[i]] = Number(stock[i + 1]) || 0;
  return { catalog: (catalog ? JSON.parse(catalog) : { goods: [], barcodes: {} }) as Catalog, stock: counts, version: Number(version) || 0 };
}

export async function GET(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const me = await sessionAccount(request);
  if (!me || me.role === 'v8') return json({ error: 'not-allowed' }, 401);
  return json(await readAll());
}

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export async function POST(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const me = await sessionAccount(request);
  if (!me || me.role === 'v8') return json({ error: 'not-allowed' }, 401);
  if (me.role === 'staff') return json({ error: 'not-allowed' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: 'bad-json' }, 400); }

  if (body.action === 'catalog') {
    const given = body.catalog as Partial<Catalog> | undefined;
    if (!given || !Array.isArray(given.goods)) return json({ error: 'bad-request' }, 400);
    const goods: Good[] = given.goods.slice(0, 500).flatMap((item) => {
      const good = item as Partial<Good>;
      if (!validPid(good.id) || !good.id.startsWith('g-')) return [];
      const name = clean(good.name, 80);
      const priceFils = Math.round(Number(good.priceFils));
      if (!name || !Number.isFinite(priceFils) || priceFils < 0 || priceFils > 1_000_000) return [];
      return [{ id: good.id, name, priceFils, category: clean(good.category, 40) || 'بضاعة', ...(typeof good.image === 'string' && good.image.startsWith('/images/') ? { image: good.image.slice(0, 200) } : {}) }];
    });
    const barcodes: Record<string, string> = {};
    for (const [code, key] of Object.entries(given.barcodes ?? {}).slice(0, 2000)) {
      if (/^[\w-]{3,40}$/.test(code) && typeof key === 'string' && /^[a-z0-9-]{1,60}::\d{1,2}$/.test(key)) barcodes[code] = key;
    }
    const [, version] = await redis([['SET', 'pos:catalog', JSON.stringify({ goods, barcodes })], ['INCR', 'pos:version']]);
    return json({ ok: true, version: Number(version) || 0 });
  }

  if (body.action === 'stock') {
    if (!validPid(body.id)) return json({ error: 'bad-request' }, 400);
    if (body.set === null) await redis([['HDEL', 'stock', body.id], ['INCR', 'pos:version']]);
    else if (typeof body.set === 'number' && Number.isFinite(body.set)) await redis([['HSET', 'stock', body.id, Math.max(-999, Math.min(99999, Math.round(body.set)))], ['INCR', 'pos:version']]);
    else if (typeof body.add === 'number' && Number.isFinite(body.add)) await redis([['HINCRBY', 'stock', body.id, Math.max(-9999, Math.min(9999, Math.round(body.add)))], ['INCR', 'pos:version']]);
    else return json({ error: 'bad-request' }, 400);
    return json({ ok: true, ...(await readAll()) });
  }
  return json({ error: 'bad-request' }, 400);
}
