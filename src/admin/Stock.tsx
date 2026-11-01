// The cashier's inventory (جرد) and barcodes, kept on the server in Redis (api/pos.ts) and on this
// device for offline use. Counted items lose pieces with every sale (site or counter) and get them
// back on a cancel; an item that reaches 0 shows "مش متوفر" on the site.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Plus, Search, Trash2, X } from 'lucide-react';

import type { Product } from '../menu';
import type { Live } from './Admin';
import { quickFetch, type LiveOrder } from './offline';

export type Good = { id: string; name: string; priceFils: number; category: string; image?: string };
export type PosData = { catalog: { goods: Good[]; barcodes: Record<string, string> }; stock: Record<string, number>; version: number };
const EMPTY: PosData = { catalog: { goods: [], barcodes: {} }, stock: {}, version: 0 };
const DATA_KEY = 'faei-pos-data';
export const LOW_STOCK = 5;

function load(): PosData {
  try { const raw = localStorage.getItem(DATA_KEY); return raw ? { ...EMPTY, ...JSON.parse(raw) as PosData } : EMPTY; } catch { return EMPTY; }
}

export type Pos = {
  data: PosData;
  reload: () => Promise<void>;
  saveCatalog: (catalog: PosData['catalog']) => Promise<boolean>;
  setStock: (id: string, change: { set: number | null } | { add: number }) => Promise<boolean>;
};

// Downloads the catalog and stock now and then, and again after orders change (a sale takes pieces off).
export function usePos(session: string, live: Live): Pos {
  const [data, setData] = useState<PosData>(load);
  const keep = (next: PosData) => { setData(next); try { localStorage.setItem(DATA_KEY, JSON.stringify(next)); } catch { /* fine */ } };
  async function reload() {
    try {
      const response = await quickFetch('/api/pos', { headers: { Authorization: `Bearer ${session}` } }, 8000);
      if (response.ok) keep(await response.json() as PosData);
    } catch { /* offline: the saved copy stays */ }
  }
  const ordersKey = (live.orders ?? []).map((order) => `${order.ref}${order.status}${order.editedAt ?? ''}`).join().length + (live.orders?.length ?? 0) * 7 + live.pending;
  const timer = useRef(0);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void reload(), 1500);
    return () => window.clearTimeout(timer.current);
  }, [ordersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const every = window.setInterval(() => void reload(), 60_000); return () => window.clearInterval(every); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>): Promise<Response | null> {
    try {
      return await quickFetch('/api/pos', { method: 'POST', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 10000);
    } catch { return null; }
  }
  return {
    data,
    reload,
    async saveCatalog(catalog) {
      const response = await post({ action: 'catalog', catalog });
      if (!response?.ok) return false;
      keep({ ...data, catalog });
      void reload();
      return true;
    },
    async setStock(id, change) {
      const response = await post({ action: 'stock', id, ...change });
      if (!response?.ok) return false;
      keep(await response.json() as PosData);
      return true;
    },
  };
}

const priceText = (fils: number) => (fils / 1000).toFixed(fils % 1000 === 0 ? 0 : 2);

// A code nobody knows yet: link it to an item on the menu, or add it as a new shop good.
export function BarcodeDialog({ code, products, pos, onDone }: { code: string; products: Product[]; pos: Pos; onDone: (key?: string) => void }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = query.trim().toLocaleLowerCase('ar');
  const matches = q ? products.filter((product) => product.name.toLocaleLowerCase('ar').includes(q)).slice(0, 12) : [];
  async function link(key: string) {
    setBusy(true); setError('');
    const ok = await pos.saveCatalog({ ...pos.data.catalog, barcodes: { ...pos.data.catalog.barcodes, [code]: key } });
    setBusy(false);
    if (ok) onDone(key); else setError('ما انحفظ. لازم يكون في نت عشان تربط باركود.');
  }
  async function create() {
    const priceFils = Math.round(Number(price) * 1000);
    if (!name.trim() || !(priceFils >= 0) || !price) { setError('اكتب الاسم والسعر.'); return; }
    setBusy(true); setError('');
    const good: Good = { id: `g-${Date.now().toString(36)}`, name: name.trim(), priceFils, category: 'بضاعة' };
    const ok = await pos.saveCatalog({ goods: [...pos.data.catalog.goods, good], barcodes: { ...pos.data.catalog.barcodes, [code]: `${good.id}::0` } });
    if (ok && count !== '') await pos.setStock(good.id, { set: Number(count) || 0 });
    setBusy(false);
    if (ok) onDone(`${good.id}::0`); else setError('ما انحفظ. لازم يكون في نت عشان تضيف صنف.');
  }
  return (
    <div className="admin-sheet-wrap" data-no-scan onClick={(event) => { if (event.target === event.currentTarget) onDone(); }}>
      <div className="admin-sheet pos-dialog" role="dialog" aria-label="باركود جديد" data-testid="barcode-dialog">
        <header><h2><Barcode size={18} /> باركود جديد <code dir="ltr">{code}</code></h2><button type="button" className="pos-sheet-close" onClick={() => onDone()} aria-label="سكّر"><X size={18} /></button></header>
        <h3>صنف جديد من بضاعة المحل</h3>
        <div className="pos-form">
          <input className="admin-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="الاسم (مثلاً: بيبسي علبة)" autoFocus data-testid="good-name" />
          <input className="admin-input" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="السعر د.أ" inputMode="decimal" data-testid="good-price" />
          <input className="admin-input" value={count} onChange={(event) => setCount(event.target.value)} placeholder="الكمية عندك (اختياري)" inputMode="numeric" />
          <button type="button" className="admin-primary" disabled={busy} onClick={() => void create()} data-testid="good-save"><Plus size={15} /> ضيف</button>
        </div>
        <h3>أو اربطه بصنف موجود</h3>
        <div className="pos-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على الصنف…" /></div>
        <ul className="pos-pick">
          {matches.flatMap((product) => product.options.map((option, index) => (
            <li key={`${product.id}${index}`}><button type="button" disabled={busy} onClick={() => void link(`${product.id}::${index}`)}>{product.name}{option.label ? ` — ${option.label}` : ''} <em>{priceText(option.priceFils)}</em></button></li>
          )))}
        </ul>
        {error && <p className="admin-error">{error}</p>}
      </div>
    </div>
  );
}

// Stock, kept simple: only the items you chose to count are on the list. Each shows what's left,
// how many days that lasts at the current pace, and three quick actions: sold/spoilt −1, goods arrived +,
// and "جرد" to type the real count. Adding an item to the list or a new shop good is one small form.
type SoldRate = Map<string, number>;
export function StockManager({ products, pos, canManage, orders, onClose }: { products: Product[]; categories: string[]; pos: Pos; canManage: boolean; orders: LiveOrder[]; onClose: () => void }) {
  const [state, setState] = useState<Record<string, 'saving' | 'error'>>({});
  const [editing, setEditing] = useState<{ id: string; mode: 'set' | 'add' } | null>(null);
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState<'' | 'menu' | 'good'>('');
  const [query, setQuery] = useState('');
  const [good, setGood] = useState({ name: '', price: '', count: '', code: '' });
  const [message, setMessage] = useState('');
  const stock = pos.data.stock;
  const counted = products.filter((product) => product.id in stock);
  // Pieces sold per day over the days we have orders for (at most a week), per item.
  const rate: SoldRate = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    const recent = orders.filter((order) => order.status !== 'ملغي' && order.createdAt > since);
    const days = Math.max(1, Math.min(7, (Date.now() - Math.min(Date.now() - 86_400_000, ...recent.map((order) => order.createdAt))) / 86_400_000));
    const map: SoldRate = new Map();
    recent.forEach((order) => order.items.forEach((item) => { if (item.pid) map.set(item.pid, (map.get(item.pid) ?? 0) + item.quantity); }));
    map.forEach((count, id) => map.set(id, count / days));
    return map;
  }, [orders]);
  const daysLeft = (id: string) => { const perDay = rate.get(id) ?? 0; return perDay > 0 ? stock[id] / perDay : null; };
  const sorted = [...counted].sort((a, b) => stock[a.id] - stock[b.id]);
  const low = sorted.filter((product) => stock[product.id] <= LOW_STOCK || (daysLeft(product.id) ?? 99) < 2);

  async function change(id: string, update: { set: number | null } | { add: number }) {
    setState((current) => ({ ...current, [id]: 'saving' }));
    const ok = await pos.setStock(id, update);
    setState((current) => { const next = { ...current }; if (ok) delete next[id]; else next[id] = 'error'; return next; });
    if (!ok) setMessage('ما انحفظ، لازم يكون في نت.');
  }
  function submit() {
    if (!editing || value === '' || !Number.isFinite(Number(value))) { setEditing(null); return; }
    void change(editing.id, editing.mode === 'set' ? { set: Math.round(Number(value)) } : { add: Math.round(Number(value)) });
    setEditing(null); setValue('');
  }
  async function addGood() {
    const priceFils = Math.round(Number(good.price) * 1000);
    if (!good.name.trim() || !good.price || !(priceFils >= 0)) { setMessage('اكتب الاسم والسعر.'); return; }
    const item: Good = { id: `g-${Date.now().toString(36)}`, name: good.name.trim(), priceFils, category: 'بضاعة' };
    const barcodes = good.code.trim() ? { ...pos.data.catalog.barcodes, [good.code.trim()]: `${item.id}::0` } : pos.data.catalog.barcodes;
    if (!await pos.saveCatalog({ goods: [...pos.data.catalog.goods, item], barcodes })) { setMessage('ما انحفظ، لازم يكون في نت.'); return; }
    await pos.setStock(item.id, { set: Number(good.count) || 0 });
    setGood({ name: '', price: '', count: '', code: '' }); setAdding(''); setMessage(`انضاف ${item.name} ✅`);
  }
  async function removeGood(product: Product) {
    if (!confirm(`نشيل "${product.name}" من بضاعة المحل؟`)) return;
    const barcodes = Object.fromEntries(Object.entries(pos.data.catalog.barcodes).filter(([, key]) => !key.startsWith(`${product.id}::`)));
    if (await pos.saveCatalog({ goods: pos.data.catalog.goods.filter((item) => item.id !== product.id), barcodes })) void pos.setStock(product.id, { set: null });
  }
  const q = query.trim().toLocaleLowerCase('ar');
  const candidates = q ? products.filter((product) => !(product.id in stock) && product.name.toLocaleLowerCase('ar').includes(q)).slice(0, 8) : [];

  return (
    <div className="admin-sheet-wrap" data-no-scan onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="admin-sheet pos-stock" role="dialog" aria-label="المخزون" data-testid="stock-manager">
        <header><h2>المخزون</h2><button type="button" className="pos-sheet-close" onClick={onClose} aria-label="سكّر"><X size={18} /></button></header>
        {!counted.length && (
          <div className="pos-stock-empty">
            <b>لسا ما في أصناف بتنعد.</b>
            <p>ضيف الأصناف اللي بدك تعرف قديش ضايل منها (مشروبات، علب، خبز…). كل بيعة بتنقص لحالها، ولما يخلص الصنف بيصير "مش متوفر" عالموقع.</p>
          </div>
        )}
        {low.length > 0 && <p className="pos-stock-alert" data-testid="stock-low">⚠️ قرب يخلص: {low.map((product) => `${product.name} (${stock[product.id] <= 0 ? 'خلص' : stock[product.id]})`).join('، ')}</p>}
        <ul className="pos-stock-list">
          {sorted.map((product) => {
            const left = stock[product.id];
            const days = daysLeft(product.id);
            const isOpen = editing?.id === product.id;
            return (
              <li key={product.id} className={left <= 0 ? 'is-out' : left <= LOW_STOCK || (days ?? 99) < 2 ? 'is-low' : ''} data-testid={`stock-${product.id}`}>
                {product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="pos-thumb-empty">{product.name.slice(0, 2)}</span>}
                <div className="pos-stock-name">
                  <b>{product.name}</b>
                  <small>{days !== null ? (days < 1 ? 'بيخلص اليوم' : `بيكفي حوالي ${Math.round(days)} يوم`) : 'ما انباع منه مؤخراً'}</small>
                </div>
                <b className="pos-left">{left <= 0 ? 'خلص' : left}</b>
                {canManage && (isOpen
                  ? <form className="pos-stock-edit" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                    <input className="admin-input" autoFocus inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} placeholder={editing.mode === 'set' ? 'العدد الحقيقي' : 'كم وصل؟'} data-testid={`stock-input-${product.id}`} />
                    <button type="submit" className="admin-primary">تمام</button>
                  </form>
                  : <div className="pos-stock-actions">
                    <button type="button" onClick={() => void change(product.id, { add: -1 })} aria-label="نقّص واحد (تلف)" title="نقّص واحد">−1</button>
                    <button type="button" className="is-add" onClick={() => { setEditing({ id: product.id, mode: 'add' }); setValue(''); }} data-testid={`stock-add-${product.id}`}>+ وصل</button>
                    <button type="button" onClick={() => { setEditing({ id: product.id, mode: 'set' }); setValue(String(Math.max(0, left))); }} data-testid={`stock-set-${product.id}`}>جرد</button>
                    <details className="pos-stock-more"><summary aria-label="أكثر">⋯</summary>
                      <button type="button" onClick={() => void change(product.id, { set: null })}>بطّل عدّه</button>
                      {product.id.startsWith('g-') && <button type="button" onClick={() => void removeGood(product)}><Trash2 size={13} /> احذفه</button>}
                    </details>
                  </div>)}
                {state[product.id] === 'saving' && <small>…</small>}
              </li>
            );
          })}
        </ul>
        {canManage && (
          <div className="pos-stock-add">
            {adding === '' && <>
              <button type="button" className="admin-primary" onClick={() => setAdding('menu')} data-testid="stock-add-menu"><Plus size={15} /> عدّ صنف من المنيو</button>
              <button type="button" className="admin-link" onClick={() => setAdding('good')} data-testid="stock-add-good"><Plus size={15} /> بضاعة جديدة (مش عالمنيو)</button>
            </>}
            {adding === 'menu' && <>
              <div className="pos-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اكتب اسم الصنف…" data-testid="stock-search" /><button type="button" onClick={() => { setAdding(''); setQuery(''); }} aria-label="سكّر"><X size={15} /></button></div>
              <ul className="pos-pick">{candidates.map((product) => <li key={product.id}><button type="button" onClick={() => { void change(product.id, { set: 0 }).then(() => { setEditing({ id: product.id, mode: 'set' }); setValue(''); }); setQuery(''); setAdding(''); }}>{product.name} <em>ضيف</em></button></li>)}</ul>
            </>}
            {adding === 'good' && <div className="pos-form">
              <input className="admin-input" autoFocus value={good.name} onChange={(event) => setGood({ ...good, name: event.target.value })} placeholder="الاسم (مثلاً: مي صغيرة)" />
              <input className="admin-input" value={good.price} onChange={(event) => setGood({ ...good, price: event.target.value })} placeholder="السعر د.أ" inputMode="decimal" />
              <input className="admin-input" value={good.count} onChange={(event) => setGood({ ...good, count: event.target.value })} placeholder="كم عندك؟" inputMode="numeric" />
              <input className="admin-input" value={good.code} onChange={(event) => setGood({ ...good, code: event.target.value })} placeholder="الباركود (اختياري)" dir="ltr" onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} />
              <button type="button" className="admin-primary" onClick={() => void addGood()}><Plus size={15} /> ضيف</button>
              <button type="button" className="admin-link" onClick={() => setAdding('')}>إلغاء</button>
            </div>}
          </div>
        )}
        {message && <p className="admin-hint" role="status">{message}</p>}
      </div>
    </div>
  );
}
