// The shop's customers (by phone number), for the admin page's customers tab and giveaways.
// Developers only.
//
//   GET /api/customers   → { customers: Customer[] }

import { connected, countCustomerOrder, json, notConnected, redis, sessionAccount, type Customer } from './_lib.js';

// The first time, count the orders that were already in the database before customers were kept.
async function backfill() {
  const [done] = await redis([['GET', 'config:customers']]);
  if (done === '1') return;
  await redis([['SET', 'config:customers', '1']]);
  const [refs] = await redis([['LRANGE', 'orders', 0, 1999]]) as [string[]];
  if (!refs.length) return;
  const [values] = await redis([['MGET', ...refs.map((ref) => `order:${ref}`)]]) as [(string | null)[]];
  for (const value of values) {
    if (!value) continue;
    const order = JSON.parse(value) as { status?: string };
    if (order.status !== 'ملغي') await countCustomerOrder(order, 1);
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!connected()) return notConnected();
  const me = await sessionAccount(request);
  if (!me) return json({ error: 'not-allowed' }, 401);
  if (me.role !== 'dev') return json({ error: 'not-allowed' }, 403);
  await backfill();
  const [all] = await redis([['HGETALL', 'customers']]) as [string[]];
  const customers: Customer[] = [];
  for (let i = 0; i < all.length; i += 2) {
    const customer = JSON.parse(all[i + 1]) as Customer;
    if (customer.orders > 0) customers.push(customer);
  }
  return json({ customers });
}
