// The cashier's inventory (جرد) and barcodes, kept on the server in Redis (api/pos.ts) and on this
// device for offline use. Counted items lose pieces with every sale (site or counter) and get them
// back on a cancel; an item that reaches 0 shows "مش متوفر" on the site.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Plus, Search, Trash2, X } from 'lucide-react';

import type { Product } from '../menu';
import type { Live } from './Admin';
import { quickFetch } from './offline';

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

// Stock take and goods: set what's on the shelf, add what arrived, barcodes, and the shop's own goods.
export function StockManager({ products, categories, pos, canManage, onClose }: { products: Product[]; categories: string[]; pos: Pos; canManage: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'counted' | 'low'>('all');
  const [category, setCategory] = useState('');
  const [state, setState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [adding, setAdding] = useState({ name: '', price: '', category: 'بضاعة', count: '', code: '' });
  const [message, setMessage] = useState('');
  const stock = pos.data.stock;
  const codesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    Object.entries(pos.data.catalog.barcodes).forEach(([code, key]) => { const id = key.split('::')[0]; map.set(id, [...(map.get(id) ?? []), code]); });
    return map;
  }, [pos.data.catalog.barcodes]);
  const q = query.trim().toLocaleLowerCase('ar');
  const shown = products.filter((product) => (!q || product.name.toLocaleLowerCase('ar').includes(q) || (codesOf.get(product.id) ?? []).some((code) => code.includes(q)))
    && (!category || product.category === category)
    && (filter === 'all' || (product.id in stock && (filter === 'counted' || stock[product.id] <= LOW_STOCK))));
  const low = products.filter((product) => product.id in stock && stock[product.id] <= LOW_STOCK).length;

  async function change(id: string, value: { set: number | null } | { add: number }) {
    setState((current) => ({ ...current, [id]: 'saving' }));
    const ok = await pos.setStock(id, value);
    setState((current) => ({ ...current, [id]: ok ? 'saved' : 'error' }));
  }
  async function removeCode(code: string) {
    const barcodes = { ...pos.data.catalog.barcodes };
    delete barcodes[code];
    if (!await pos.saveCatalog({ ...pos.data.catalog, barcodes })) setMessage('ما انحفظ، تأكد من النت.');
  }
  async function removeGood(good: Product) {
    if (!confirm(`نشيل "${good.name}" من بضاعة المحل؟`)) return;
    const barcodes = Object.fromEntries(Object.entries(pos.data.catalog.barcodes).filter(([, key]) => !key.startsWith(`${good.id}::`)));
    if (await pos.saveCatalog({ goods: pos.data.catalog.goods.filter((item) => item.id !== good.id), barcodes })) void pos.setStock(good.id, { set: null });
    else setMessage('ما انحفظ، تأكد من النت.');
  }
  async function addGood() {
    const priceFils = Math.round(Number(adding.price) * 1000);
    if (!adding.name.trim() || !adding.price || !(priceFils >= 0)) { setMessage('اكتب الاسم والسعر.'); return; }
    const good: Good = { id: `g-${Date.now().toString(36)}`, name: adding.name.trim(), priceFils, category: adding.category.trim() || 'بضاعة' };
    const barcodes = adding.code.trim() ? { ...pos.data.catalog.barcodes, [adding.code.trim()]: `${good.id}::0` } : pos.data.catalog.barcodes;
    if (!await pos.saveCatalog({ goods: [...pos.data.catalog.goods, good], barcodes })) { setMessage('ما انحفظ، تأكد من النت.'); return; }
    if (adding.count !== '') await pos.setStock(good.id, { set: Number(adding.count) || 0 });
    setAdding({ name: '', price: '', category: adding.category, count: '', code: '' });
    setMessage(`انضاف ${good.name} ✅`);
  }

  return (
    <div className="admin-sheet-wrap" data-no-scan onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="admin-sheet pos-stock" role="dialog" aria-label="المخزون" data-testid="stock-manager">
        <header><h2>المخزون والجرد</h2><button type="button" className="pos-sheet-close" onClick={onClose} aria-label="سكّر"><X size={18} /></button></header>
        <p className="admin-hint">اكتب كم حبة عندك من الصنف (جرد). كل بيعة من الكاش أو الموقع بتنقص لحالها، والإلغاء برجّعها. لما يخلص الصنف بيصير "مش متوفر" عالموقع. الصنف اللي ما إله رقم ما بنعدّه.</p>
        <div className="pos-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر بالاسم أو الباركود…" data-testid="stock-search" /></div>
        <div className="pos-cats">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>الكل</button>
          <button type="button" className={filter === 'counted' ? 'is-active' : ''} onClick={() => setFilter('counted')}>المعدود</button>
          <button type="button" className={filter === 'low' ? 'is-active' : ''} onClick={() => setFilter('low')} data-testid="stock-low">قرب يخلص{low ? ` (${low})` : ''}</button>
          <select className="admin-input pos-cat-select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">كل الأقسام</option>{categories.map((name) => <option key={name}>{name}</option>)}</select>
        </div>
        <ul className="pos-stock-list">
          {shown.map((product) => {
            const left = product.id in stock ? stock[product.id] : null;
            const isGood = product.id.startsWith('g-');
            return (
              <li key={product.id} className={left !== null && left <= LOW_STOCK ? (left <= 0 ? 'is-out' : 'is-low') : ''} data-testid={`stock-${product.id}`}>
                {product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="pos-thumb-empty">{product.name.slice(0, 2)}</span>}
                <div className="pos-stock-name">
                  <b>{product.name}</b>
                  <small>{product.category}{isGood ? ` · ${priceText(product.options[0].priceFils)} د.أ` : ''}</small>
                  {(codesOf.get(product.id) ?? []).map((code) => <span key={code} className="pos-code" dir="ltr"><Barcode size={11} /> {code}{canManage && <button type="button" onClick={() => void removeCode(code)} aria-label="شيل الباركود"><X size={10} /></button>}</span>)}
                </div>
                <div className="pos-stock-count">
                  <b className="pos-left">{left === null ? '—' : left <= 0 ? 'خلص' : left}</b>
                  {canManage && <>
                    <input className="admin-input" inputMode="numeric" placeholder="جرد" aria-label="الكمية بالجرد" data-testid={`stock-set-${product.id}`}
                      onKeyDown={(event) => { if (event.key === 'Enter') { const value = (event.target as HTMLInputElement).value; if (value !== '') { void change(product.id, { set: Number(value) || 0 }); (event.target as HTMLInputElement).value = ''; } } }}
                      onBlur={(event) => { const value = event.target.value; if (value !== '') { void change(product.id, { set: Number(value) || 0 }); event.target.value = ''; } }} />
                    <button type="button" className="admin-print" onClick={() => { const value = prompt(`كم حبة وصلت من ${product.name}؟`); if (value && Number(value)) void change(product.id, { add: Number(value) }); }} title="وصلت بضاعة" aria-label="وصلت بضاعة"><Plus size={14} /></button>
                    {left !== null && <button type="button" className="admin-link" onClick={() => void change(product.id, { set: null })} title="بطّل تعدّه">بطّل عدّ</button>}
                    {isGood && <button type="button" className="admin-print" onClick={() => void removeGood(product)} aria-label="احذف"><Trash2 size={14} /></button>}
                  </>}
                  {state[product.id] === 'saving' && <small>…</small>}
                  {state[product.id] === 'error' && <small className="is-error">ما انحفظ</small>}
                </div>
              </li>
            );
          })}
        </ul>
        {canManage && (
          <section className="pos-add-good">
            <h3>ضيف صنف من بضاعة المحل (مشروبات، شيبس…)</h3>
            <p className="admin-hint">بيطلع بالكاش بس، مش عالموقع. أسرع إشي: امسح الباركود وهو مفتوح الكاش وبيسألك.</p>
            <div className="pos-form">
              <input className="admin-input" value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} placeholder="الاسم" />
              <input className="admin-input" value={adding.price} onChange={(event) => setAdding({ ...adding, price: event.target.value })} placeholder="السعر د.أ" inputMode="decimal" />
              <input className="admin-input" value={adding.category} onChange={(event) => setAdding({ ...adding, category: event.target.value })} placeholder="القسم" list="pos-categories" />
              <datalist id="pos-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
              <input className="admin-input" value={adding.count} onChange={(event) => setAdding({ ...adding, count: event.target.value })} placeholder="الكمية (اختياري)" inputMode="numeric" />
              <input className="admin-input" value={adding.code} onChange={(event) => setAdding({ ...adding, code: event.target.value })} placeholder="الباركود (امسحه هون)" dir="ltr" onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} />
              <button type="button" className="admin-primary" onClick={() => void addGood()}><Plus size={15} /> ضيف</button>
            </div>
          </section>
        )}
        {message && <p className="admin-hint" role="status">{message}</p>}
      </div>
    </div>
  );
}
