// Keeps the panel working with no internet or a weak one.
// Every change the panel makes (a counter order, a status change) goes into an "outbox" saved on
// this device first, so it shows on screen at once and survives a reload or a closed browser.
// The outbox is sent to the server in order whenever there's a connection; the order's ref makes
// sending the same thing twice harmless.

export type OrderItem = { name: string; quantity: number; price: number };
export type LiveOrder = {
  ref: string; id: string; createdAt: number; status: string; items: OrderItem[]; extras: string;
  fulfillment: string; address: string; phone?: string; time: string; payment: string; preorder: boolean;
  discount: number; delivery: number | string; total: number;
  customerSent?: number; cancelledBy?: 'customer' | 'edit'; shop?: 'v8';
  // Rung up at the counter (the cashier screen), and by which account.
  source?: 'pos'; by?: string; paid?: number;
  // Changed after it was placed (from the orders list or the cashier).
  editedAt?: number; edits?: number;
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
export function nextCounterNumber(known: LiveOrder[]): string {
  const today = dayOf(Date.now());
  const stored = load<{ day: string; n: number }>(COUNTER_KEY, { day: today, n: 0 });
  const local = stored.day === today ? stored.n : 0;
  const seen = known.filter((order) => order.source === 'pos' && isToday(order.createdAt)).reduce((max, order) => Math.max(max, Number(order.id) || 0), 0);
  const n = Math.max(local, seen) + 1;
  save(COUNTER_KEY, { day: today, n });
  return String(n);
}
