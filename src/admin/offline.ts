// Keeps the panel working with no internet or a weak one.
// Every change the panel makes (a counter order, a status change) goes into an "outbox" saved on
// this device first, so it shows on screen at once and survives a reload or a closed browser.
// The outbox is sent to the server in order whenever there's a connection; the order's ref makes
// sending the same thing twice harmless.

export type OrderItem = { name: string; quantity: number; price: number; pid?: string };
export type LiveOrder = {
  ref: string; id: string; createdAt: number; status: string; items: OrderItem[]; extras: string;
  fulfillment: string; address: string; phone?: string; time: string; payment: string; preorder: boolean;
  discount: number; delivery: number | string; total: number;
  customerSent?: number; cancelledBy?: 'customer' | 'edit'; shop?: 'v8';
  // Rung up at the counter (the cashier screen), and by which account.
  source?: 'pos'; by?: string; paid?: number;
  // Changed after it was placed (from the orders list or the cashier).
  editedAt?: number; edits?: number;
  // The day's order number from the server (site and counter share it).
  num?: number;
};

export type OrderEdit = { items: OrderItem[]; extras: string; payment: string; fulfillment: string; discount: number; total: number };

export type OutboxEntry =
  | { kind: 'order'; order: LiveOrder; tries?: number }
  | { kind: 'status'; ref: string; status: string; at: number; tries?: number }
  | { kind: 'edit'; ref: string; edit: OrderEdit; at: number; tries?: number };

const OUTBOX_KEY = 'faei-admin-outbox';
const CACHE_KEY = 'faei-admin-orders-cache';

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: still works in memory */ }
}

export const readOutbox = () => load<OutboxEntry[]>(OUTBOX_KEY, []);
export const writeOutbox = (entries: OutboxEntry[]) => save(OUTBOX_KEY, entries);
export const readCachedOrders = () => load<{ orders: LiveOrder[]; version: number } | null>(CACHE_KEY, null);
export const cacheOrders = (orders: LiveOrder[], version: number) => save(CACHE_KEY, { orders: orders.slice(0, 200), version });

// A fetch that gives up after a few seconds, so a weak connection never freezes the screen.
export async function quickFetch(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { cache: 'no-store', ...init, signal: controller.signal }); } finally { window.clearTimeout(timer); }
}

// The server's list with this device's not-yet-sent orders and status changes laid on top.
export function mergeOutbox(server: LiveOrder[], outbox: OutboxEntry[]): LiveOrder[] {
  const byRef = new Map(server.map((order) => [order.ref, order]));
  const extra: LiveOrder[] = [];
  for (const entry of outbox) {
    if (entry.kind === 'order' && !byRef.has(entry.order.ref)) { byRef.set(entry.order.ref, entry.order); extra.push(entry.order); }
  }
  for (const entry of outbox) {
    if (entry.kind === 'order') continue;
    const order = byRef.get(entry.ref);
    if (!order) continue;
    byRef.set(entry.ref, entry.kind === 'status' ? { ...order, status: entry.status } : { ...order, ...entry.edit, editedAt: entry.at });
  }
  return [...extra.map((order) => byRef.get(order.ref)!), ...server.map((order) => byRef.get(order.ref)!)];
}

export const newRef = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]).join('');

const dayOf = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(time));
export const isToday = (time: number) => dayOf(time) === dayOf(Date.now());

// Counter orders get a short number that restarts every day (1, 2, 3 …), easy to call out.
const COUNTER_KEY = 'faei-pos-counter';
// The number shown at once: the next after the newest number of today's orders (site and counter).
// The server hands out the real one when the order arrives; online that's the same number.
export function nextCounterNumber(known: LiveOrder[]): string {
  const today = dayOf(Date.now());
  const stored = load<{ day: string; n: number }>(COUNTER_KEY, { day: today, n: 0 });
  const local = stored.day === today ? stored.n : 0;
  const todays = known.filter((order) => isToday(order.createdAt) && order.shop !== 'v8');
  const newest = todays.reduce((best, order) => (order.num && order.createdAt >= best.at ? { at: order.createdAt, n: order.num } : best), { at: 0, n: 0 });
  const waiting = todays.filter((order) => !order.num && order.source === 'pos' && order.createdAt > newest.at).length;
  const n = Math.max(newest.n + waiting, newest.n ? 0 : local) % 500 + 1;
  save(COUNTER_KEY, { day: today, n });
  return String(n);
}

// The order number everyone sees: the server's daily number (1, 2, 3 … back to 1 after 500),
// or, until the server gave one, the order's own id.
export const orderNo = (order: LiveOrder) => (order.num ? String(order.num) : order.id);

// A site order for a set time ("1:30 م"): when it's due, as a time stamp. Orders "بأسرع وقت" give null.
// The time is on the day the order was placed, or the next day if that time had already passed (a preorder at night).
export function scheduledAt(order: LiveOrder): number | null {
  const match = /(\d{1,2}):(\d{2})\s*([صم])/.exec(order.time || '');
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'م') hour += 12;
  const minutes = hour * 60 + Number(match[2]);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(order.createdAt));
  let at = ammanTime(day, minutes);
  if (at < order.createdAt - 5 * 60_000) at += 24 * 3600_000;
  return at;
}
function ammanTime(day: string, minutes: number): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Amman's offset from UTC at that moment (+2 or +3).
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return guess - (shown - guess);
}
export function dueText(at: number): string {
  const minutes = Math.round((at - Date.now()) / 60_000);
  if (minutes > 60) return `بعد ${Math.floor(minutes / 60)} س ${minutes % 60} د`;
  if (minutes > 0) return `بعد ${minutes} د`;
  return minutes === 0 ? 'هسه' : `متأخر ${-minutes} د`;
}
export const isDelivery = (order: LiveOrder) => order.fulfillment.startsWith('توصيل');
