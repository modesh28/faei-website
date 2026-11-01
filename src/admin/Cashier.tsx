// The cashier screen (الكاش): ring up walk-in orders in a couple of taps, and accept the site's
// orders on the same screen, so nothing is typed twice. It never waits for the internet: an order
// is saved on this device the moment it's rung up and sent to the server when there's a connection
// (see useOrders and offline.ts), so it keeps working when the network drops or crawls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Barcode, Bike, Boxes, Check, Clock, Globe, Minus, Pencil, Percent, Plus, Printer, ReceiptText, Search, ShoppingBag, Trash2, Undo2, X } from 'lucide-react';

import { categories as bundledCategories, products as bundledProducts, type Menu, type Product } from '../menu';
import { markPrinted, printOrder, type Live } from './Admin';
import { dueText, isDelivery, isToday, newRef, nextCounterNumber, orderNo, quickFetch, scheduledAt, type LiveOrder, type OrderEdit } from './offline';
import { BarcodeDialog, LOW_STOCK, StockManager, usePos, type PosData } from './Stock';

const MENU_KEY = 'faei-pos-menu';
const CART_KEY = 'faei-pos-cart';
const PRINT_KEY = 'faei-pos-print';

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* fine */ }
}

const money = (jod: number) => String(Math.round(jod * 1000) / 1000);
// Same item name as the site's orders, so sales and "most ordered" count both together.
const lineName = (product: Product, index: number) => {
  const label = product.options[index]?.label;
  return `${product.name}${label ? ` — ${label}` : ''}`;
};

type Line = { key: string; quantity: number };
type Discount = { kind: '%' | 'jod'; value: number } | null;
type Draft = { lines: Line[]; note: string; payment: string; fulfillment: string; ready: boolean; discount?: Discount };
// A line that isn't on today's menu (an old name, a V8 drink…) keeps its own name and price: "c|price|name".
const customKey = (name: string, price: number) => `c|${price}|${name}`;
const EMPTY: Draft = { lines: [], note: '', payment: 'كاش', fulfillment: 'من الكاش', ready: false, discount: null };
const round3 = (value: number) => Math.round(value * 1000) / 1000;

// The menu plus the counter-only shop goods (drinks, chips…) as one list of products.
export function allProducts(menu: Menu, pos: PosData): { categories: string[]; products: Product[] } {
  const goods: Product[] = pos.catalog.goods.map((good) => ({ id: good.id, name: good.name, category: good.category, options: [{ label: '', priceFils: good.priceFils }], image: good.image }));
  const categories = [...menu.categories];
  goods.forEach((good) => { if (!categories.includes(good.category)) categories.push(good.category); });
  return { categories, products: [...menu.products, ...goods] };
}

// The newest menu this device has seen: the panel's own copy, then the last download, then the one built in.
function useMenu(given: Menu | null): Menu {
  const [menu, setMenu] = useState<Menu>(() => given ?? load<Menu | null>(MENU_KEY, null) ?? { categories: bundledCategories, products: bundledProducts });
  useEffect(() => {
    if (given) { setMenu(given); save(MENU_KEY, given); return; }
    quickFetch(`/menu.json?t=${Date.now()}`, {}, 8000)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Menu | null) => { if (data?.products?.length) { setMenu(data); save(MENU_KEY, data); } })
      .catch(() => {});
  }, [given]);
  return menu;
}

export default function Cashier({ live, showSales, menu: given, editing, onEdit, session, canManage }: { live: Live; showSales: boolean; menu: Menu | null; editing: LiveOrder | null; onEdit: (order: LiveOrder | null) => void; session: string; canManage: boolean }) {
  const baseMenu = useMenu(given);
  const pos = usePos(session, live);
  const menu = useMemo(() => allProducts(baseMenu, pos.data), [baseMenu, pos.data]);
  const byId = useMemo(() => new Map(menu.products.map((product) => [product.id, product])), [menu]);
  const byName = useMemo(() => new Map(menu.products.flatMap((product) => product.options.map((_, index) => [lineName(product, index), `${product.id}::${index}`] as const))), [menu]);
  const [newDraft, setNewDraft] = useState<Draft>(() => ({ ...EMPTY, ...load<Partial<Draft>>(CART_KEY, {}) }));
  // Changing an order that was already placed (any status): its own ticket, the new-order ticket waits untouched.
  const [fixDraft, setFixDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (!editing) { setFixDraft(null); return; }
    const oldItems = editing.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setFixDraft({
      lines: editing.items.map((item) => ({ key: byName.get(item.name) ?? customKey(item.name, item.price), quantity: item.quantity })),
      note: editing.extras, payment: editing.payment, fulfillment: editing.fulfillment, ready: false,
      // The discount it had stays the same percentage of whatever the order becomes.
      discount: editing.discount && oldItems > 0 ? { kind: '%', value: Math.round((editing.discount / oldItems) * 10000) / 100 } : null,
    });
  }, [editing?.ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = fixDraft ?? newDraft;
  const setDraft = (update: (current: Draft) => Draft) => {
    if (fixDraft) { setFixDraft((current) => current && update(current)); return; }
    setNewDraft((current) => { const next = update(current); save(CART_KEY, next); return next; });
  };
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [paid, setPaid] = useState(0);
  const [otherPaid, setOtherPaid] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [managing, setManaging] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'ring' | 'site' | 'counter'>('ring');
  // Ticks every 30 s so "due in…" times stay fresh.
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
  const [printOn, setPrintOn] = useState(() => load(PRINT_KEY, false));
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ order: LiveOrder; at: number; edited?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const lines = draft.lines.flatMap((line): { key: string; quantity: number; product: Product | null; index: number; name: string; price: number }[] => {
    if (line.key.startsWith('c|')) {
      const [, price, ...name] = line.key.split('|');
      return [{ ...line, product: null, index: 0, name: name.join('|'), price: Number(price) || 0 }];
    }
    const [id, index] = line.key.split('::');
    const product = byId.get(id);
    const option = product?.options[Number(index)];
    return product && option ? [{ ...line, product, index: Number(index), name: lineName(product, Number(index)), price: option.priceFils / 1000 }] : [];
  });
  const total = Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 1000) / 1000;
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);

  function add(product: Product | null, index: number, step = 1, key = `${product?.id}::${index}`) {
    setDraft((current) => {
      const found = current.lines.find((line) => line.key === key);
      const next = found
        ? current.lines.map((line) => (line.key === key ? { ...line, quantity: Math.min(99, line.quantity + step) } : line)).filter((line) => line.quantity > 0)
        : step > 0 ? [...current.lines, { key, quantity: step }] : current.lines;
      return { ...current, lines: next };
    });
  }
  const clear = () => { setDraft((current) => ({ ...EMPTY, payment: current.payment })); setPaid(0); setOtherPaid(''); setShowDiscount(false); };

  // Discount: a percentage or an amount off the items. An edited order keeps its delivery.
  const discount = !draft.discount ? 0 : round3(Math.min(total, draft.discount.kind === '%' ? total * draft.discount.value / 100 : draft.discount.value));
  const delivery = editing && typeof editing.delivery === 'number' ? editing.delivery : 0;
  const finalTotal = Math.max(0, round3(total - discount + delivery));
  const setDiscount = (value: Discount) => setDraft((current) => ({ ...current, discount: value }));
  const cashGiven = Number(otherPaid) > 0 ? Number(otherPaid) : paid;

  function saveEdit() {
    if (!editing || !fixDraft || !lines.length) return;
    const edit: OrderEdit = {
      items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price, ...(line.product ? { pid: line.product.id } : {}) })),
      extras: fixDraft.note.trim(), payment: fixDraft.payment, fulfillment: fixDraft.fulfillment,
      discount, total: finalTotal,
    };
    live.editOrder(editing.ref, edit);
    if (printOn) void printOrder({ ...editing, ...edit, editedAt: Date.now() });
    setToast({ order: { ...editing, ...edit }, at: Date.now(), edited: true });
    setPaid(0); setOtherPaid('');
    onEdit(null);
  }

  function ringUp() {
    if (fixDraft) { saveEdit(); return; }
    if (!lines.length) return;
    const known = live.orders ?? [];
    const order: LiveOrder = {
      ref: newRef(),
      id: nextCounterNumber(known),
      source: 'pos',
      createdAt: Date.now(),
      status: 'جديد',
      items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price, ...(line.product ? { pid: line.product.id } : {}) })),
      extras: draft.note.trim(),
      fulfillment: 'من الكاش',
      address: '',
      time: 'هسه',
      payment: draft.payment,
      preorder: false,
      discount,
      delivery: 0,
      total: finalTotal,
      ...(draft.payment === 'كاش' && cashGiven > finalTotal ? { paid: cashGiven } : {}),
    };
    live.addOrder(order);
    if (printOn) void printOrder(order);
    setToast({ order, at: Date.now() });
    clear();
    setSheet(false);
    searchRef.current?.focus();
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // A barcode was read: add its item, or (unknown code) offer to link it to an item or a new shop good.
  function onScan(code: string) {
    const key = pos.data.catalog.barcodes[code];
    const [id, index] = (key ?? '').split('::');
    const product = key ? menu.products.find((item) => item.id === id) : undefined;
    if (product && product.options[Number(index)]) { add(product, Number(index)); setNotice(`✓ ${lineName(product, Number(index))}`); return; }
    if (canManage) setScanned(code); else setNotice(`باركود مش معروف (${code}). خلّي الإدارة تربطه بصنف.`);
  }
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2500); return () => window.clearTimeout(timer); }, [notice]);

  // Keyboard on the counter PC: type to search, Enter adds the first match, Ctrl+Enter (or F9) rings up.
  // The laser scanner types the code very fast and ends with Enter; that's told apart from a person typing.
  const scan = useRef({ text: '', last: 0, start: 0 });
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || event.key === 'F9') { event.preventDefault(); ringUp(); return; }
      const target = event.target as HTMLElement;
      // Typing in the barcode dialog or the stock screen is left alone.
      if (target.closest?.('[data-no-scan]')) return;
      const now = performance.now();
      const buffer = scan.current;
      if (event.key === 'Enter') {
        const fast = buffer.text.length >= 4 && now - buffer.last < 80 && (now - buffer.start) / buffer.text.length < 45;
        if (fast) {
          event.preventDefault();
          event.stopPropagation();
          const code = buffer.text;
          if (target === searchRef.current) setQuery((current) => current.replace(code, '').trim());
          onScanRef.current(code);
        }
        scan.current = { text: '', last: 0, start: 0 };
        return;
      }
      if (event.key.length !== 1) return;
      if (now - buffer.last > 80) scan.current = { text: event.key, last: now, start: now };
      else scan.current = { ...buffer, text: buffer.text + event.key, last: now };
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  });

  const q = query.trim().toLocaleLowerCase('ar');
  const shown = menu.products.filter((product) => (q
    ? product.name.toLocaleLowerCase('ar').includes(q) || product.category.toLocaleLowerCase('ar').includes(q)
    : !category || product.category === category));
  const qtyOf = (product: Product) => draft.lines.filter((line) => line.key.startsWith(`${product.id}::`)).reduce((sum, line) => sum + line.quantity, 0);
  // Pieces left of a counted item: the server's count, minus orders still waiting on this device to be sent.
  const waitingPieces = useMemo(() => {
    const counts = new Map<string, number>();
    (live.orders ?? []).filter((order) => live.pendingRefs.has(order.ref)).forEach((order) => order.items.forEach((item) => { if (item.pid) counts.set(item.pid, (counts.get(item.pid) ?? 0) + item.quantity); }));
    return counts;
  }, [live.orders, live.pendingRefs]);
  const leftOf = (id: string) => (id in pos.data.stock ? pos.data.stock[id] - (waitingPieces.get(id) ?? 0) : null);
  const lowCount = menu.products.filter((product) => { const left = leftOf(product.id); return left !== null && left <= LOW_STOCK; }).length;
  const coverOf = (name: string) => menu.products.find((product) => product.category === name && product.image)?.image;

  const all = live.orders ?? [];
  const siteOrders = all.filter((order) => order.source !== 'pos' && order.shop !== 'v8');
  const siteOpen = siteOrders.filter((order) => ['جديد', 'عم يتحضّر', 'جاهز'].includes(order.status));
  const siteNew = siteOpen.filter((order) => order.status === 'جديد');
  const counterToday = all.filter((order) => order.source === 'pos' && isToday(order.createdAt)).sort((a, b) => b.createdAt - a.createdAt);
  const todayValid = all.filter((order) => order.shop !== 'v8' && isToday(order.createdAt) && order.status !== 'ملغي');
  const sum = (list: LiveOrder[]) => list.reduce((total, order) => total + order.total, 0);
  const drawer = {
    cash: sum(todayValid.filter((order) => order.source === 'pos' && order.payment !== 'كليك')),
    cliq: sum(todayValid.filter((order) => order.payment === 'كليك')),
    site: sum(todayValid.filter((order) => order.source !== 'pos')),
    discounts: todayValid.filter((order) => order.source === 'pos').reduce((total, order) => total + (order.discount || 0), 0),
    all: sum(todayValid),
    count: todayValid.length,
  };
  const openEdit = (order: LiveOrder) => { onEdit(order); setView('ring'); setSheet(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const ticket = (
    <section className="pos-ticket" data-testid="pos-ticket">
      <header>
        <h2>{editing ? <><Pencil size={16} /> تعديل طلب <b dir="ltr">#{orderNo(editing)}</b></> : <><ShoppingBag size={17} /> الطلب</>} {pieces > 0 && <i>{pieces}</i>}</h2>
        {lines.length > 0 && <button type="button" className="admin-link" onClick={clear} data-testid="pos-clear"><Trash2 size={14} /> فضّي</button>}
        <button type="button" className="pos-sheet-close" onClick={() => setSheet(false)} aria-label="سكّر"><X size={18} /></button>
      </header>
      {editing && <p className="pos-editing">{editing.source === 'pos' ? 'طلب كاش' : 'طلب من الموقع'} · {editing.status}. زيد أو نقّص أو ضيف أصناف من المنيو، وبعدين احفظ. المبيعات والمخزون بيتعدلوا لحالهم.
        <button type="button" className="admin-link" onClick={() => onEdit(null)} data-testid="pos-edit-cancel">إلغاء التعديل</button></p>}
      {!lines.length && <p className="pos-empty">{editing ? 'الطلب فاضي. ضيف صنف، أو إذا بدك تلغيه ألغيه من قائمة الطلبات.' : 'اكبس على الصنف أو امسح الباركود عشان ينضاف.'}</p>}
      <ul className="pos-lines">
        {lines.map((line) => (
          <li key={line.key}>
            <span>{line.name}</span>
            <div className="pos-qty">
              <button type="button" onClick={() => add(line.product, line.index, -1, line.key)} aria-label="نقّص"><Minus size={15} /></button>
              <b>{line.quantity}</b>
              <button type="button" onClick={() => add(line.product, line.index, 1, line.key)} aria-label="زيد"><Plus size={15} /></button>
            </div>
            <em>{money(line.price * line.quantity)}</em>
          </li>
        ))}
      </ul>
      <input className="admin-input pos-note" value={draft.note} onChange={(event) => { const note = event.target.value; setDraft((current) => ({ ...current, note })); }} placeholder="ملاحظة (بدون بصل، حار…)" data-testid="pos-note" />
      {editing && editing.source !== 'pos' && <p className="pos-editing-meta">الاستلام: {editing.fulfillment}{editing.address ? ` · ${editing.address}` : ''}{delivery > 0 ? ` (توصيل ${money(delivery)})` : ''}</p>}
      <div className="pos-seg is-pay-only">
        {(['كاش', 'كليك'] as const).map((value) => <button key={value} type="button" className={draft.payment === value ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, payment: value }))} data-testid={`pos-pay-${value}`}>{value}</button>)}
      </div>
      <div className="pos-discount">
        <button type="button" className={`admin-link${draft.discount ? ' is-on' : ''}`} onClick={() => setShowDiscount(!showDiscount)} data-testid="pos-discount"><Percent size={14} /> {draft.discount ? `خصم ${draft.discount.kind === '%' ? `${draft.discount.value}%` : `${money(draft.discount.value)} د.أ`}` : 'خصم'}</button>
        {(showDiscount || (draft.discount && !editing)) && (
          <div className="pos-change">
            {[5, 10, 15, 20, 50].map((value) => <button key={value} type="button" className={draft.discount?.kind === '%' && draft.discount.value === value ? 'is-active' : ''} onClick={() => setDiscount(draft.discount?.kind === '%' && draft.discount.value === value ? null : { kind: '%', value })} data-testid={`pos-discount-${value}`}>{value}%</button>)}
            <input className="admin-input pos-mini" inputMode="decimal" placeholder="مبلغ" value={draft.discount?.kind === 'jod' ? String(draft.discount.value) : ''} onChange={(event) => { const value = Number(event.target.value); setDiscount(value > 0 ? { kind: 'jod', value } : null); }} aria-label="خصم بالدينار" data-testid="pos-discount-amount" />
            {draft.discount && <button type="button" onClick={() => setDiscount(null)} aria-label="شيل الخصم"><X size={13} /></button>}
          </div>
        )}
      </div>
      {draft.payment === 'كاش' && total > 0 && (
        <div className="pos-change">
          <small>الزبون دفع:</small>
          {[1, 5, 10, 20, 50].filter((note) => note >= finalTotal || note === 20).slice(0, 4).map((note) => <button key={note} type="button" className={paid === note && !otherPaid ? 'is-active' : ''} onClick={() => { setOtherPaid(''); setPaid(paid === note ? 0 : note); }}>{note}</button>)}
          <input className="admin-input pos-mini" inputMode="decimal" placeholder="غيره" value={otherPaid} onChange={(event) => setOtherPaid(event.target.value)} aria-label="المبلغ اللي دفعه" data-testid="pos-paid" />
          {cashGiven > 0 && <b className={cashGiven >= finalTotal ? '' : 'is-short'} data-testid="pos-change">{cashGiven >= finalTotal ? `الباقي ${money(cashGiven - finalTotal)}` : `ناقص ${money(finalTotal - cashGiven)}`}</b>}
        </div>
      )}
      {discount > 0 && <div className="pos-sub"><span>الأصناف {money(total)}</span><span>خصم −{money(discount)}</span></div>}
      <div className="pos-total"><span>المجموع</span><b data-testid="pos-total">{money(finalTotal)} د.أ</b></div>
      <button type="button" className="pos-ring" disabled={!lines.length} onClick={ringUp} data-testid="pos-ring"><Check size={20} /> {editing ? 'احفظ التعديل' : 'دق الطلب'}</button>
      <label className="pos-print"><input type="checkbox" checked={printOn} onChange={(event) => { setPrintOn(event.target.checked); save(PRINT_KEY, event.target.checked); }} /> <Printer size={14} /> اطبع فاتورة مع كل طلب</label>
    </section>
  );

  const tile = (product: Product) => {
    const count = qtyOf(product);
    const off = product.available === false;
    const left = leftOf(product.id);
    return (
      <article key={product.id} className={`pos-item${count ? ' is-in' : ''}${off || (left !== null && left <= 0) ? ' is-off' : ''}`} data-testid={`pos-item-${product.id}`}>
        <div className="pos-item-head" onClick={product.options.length === 1 ? () => add(product, 0) : undefined} role={product.options.length === 1 ? 'button' : undefined}>
          {product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="pos-thumb-empty">{product.name.slice(0, 2)}</span>}
          <span className="pos-item-name">{product.name}</span>
          {product.options.length === 1 && <em>{money(product.options[0].priceFils / 1000)}</em>}
        </div>
        {product.options.length > 1 && <div className="pos-opts">{product.options.map((option, index) => <button key={index} type="button" onClick={() => add(product, index)}>{option.label || 'عادي'} <em>{money(option.priceFils / 1000)}</em></button>)}</div>}
        {count > 0 && <i className="pos-count">{count}</i>}
        {off ? <small className="pos-off">مش متوفر</small> : left !== null && <small className={`pos-left-tag${left <= LOW_STOCK ? ' is-low' : ''}`}>{left <= 0 ? 'خلص' : `باقي ${left}`}</small>}
      </article>
    );
  };

  const siteCard = (order: LiveOrder) => {
    const due = scheduledAt(order);
    const next = order.status === 'جديد' ? { status: 'عم يتحضّر', label: 'بلّشنا' } : order.status === 'عم يتحضّر' ? { status: 'جاهز', label: 'جاهز ✅' } : { status: 'تم', label: 'استلمه 👍' };
    return (
      <article key={order.ref} className={`${live.fresh.has(order.ref) ? 'is-fresh' : ''}${due && order.status === 'جديد' && due - Date.now() < 30 * 60_000 ? ' is-due' : ''}`} data-testid={`pos-site-${order.ref}`}>
        <header><b dir="ltr">#{orderNo(order)}</b><span>{isDelivery(order) ? order.fulfillment.replace(/^توصيل\s*/, '') : order.fulfillment}{order.payment === 'كليك' ? ' · كليك' : ''}{order.phone ? ` · ${order.phone}` : ''}</span><em>{money(order.total)} د.أ</em></header>
        {isDelivery(order) && <p className="pos-delivery" data-testid="pos-delivery"><Bike size={15} /> توصيل{order.address ? `: ${order.address}` : ''}</p>}
        {due && <p className="pos-due">⏰ موعده {order.time}{order.status === 'جديد' ? ` · ${dueText(due)}` : ''}</p>}
        <p>{order.items.map((item) => `${item.quantity}× ${item.name}`).join('، ')}{order.extras ? ` · ${order.extras}` : ''}</p>
        <footer>
          <button type="button" className={next.status === 'جاهز' ? 'admin-green' : 'admin-primary'} onClick={() => void live.setStatus(order.ref, next.status)} data-testid={`pos-next-${order.ref}`}><Check size={15} /> {next.label}</button>
          <button type="button" className="admin-print" onClick={() => openEdit(order)} aria-label="عدّل"><Pencil size={15} /></button>
          <button type="button" className="admin-print" onClick={() => { markPrinted(order.ref); void printOrder(order); }} aria-label="اطبع"><Printer size={15} /></button>
        </footer>
      </article>
    );
  };
  const scheduled = siteOpen.filter((order) => order.status === 'جديد' && scheduledAt(order)).sort((a, b) => scheduledAt(a)! - scheduledAt(b)!);
  const groups: [string, LiveOrder[]][] = [
    ['جديدة', siteNew.filter((order) => !scheduledAt(order)).sort((a, b) => a.createdAt - b.createdAt)],
    ['مجدولة بوقت', scheduled],
    ['عم يتحضّر', siteOpen.filter((order) => order.status === 'عم يتحضّر')],
    ['جاهز', siteOpen.filter((order) => order.status === 'جاهز')],
  ];

  return (
    <div className="pos" data-testid="cashier">
      {!live.online && <p className="admin-offline">بدون نت هسه، والكاش شغّال عادي. الطلبات بتنحفظ عالجهاز وبتنبعت لحالها لما يرجع النت{live.pending ? ` (${live.pending} مستنيين)` : ''}.</p>}
      {!live.soundOn && <button type="button" className="admin-sound" onClick={live.enableSound}>اكبس هون عشان يرنّ لما يوصل طلب من الموقع</button>}
      <div className="pos-views" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'ring'} className={view === 'ring' ? 'is-active' : ''} onClick={() => setView('ring')} data-testid="pos-view-ring"><ShoppingBag size={16} /> دق طلب</button>
        <button type="button" role="tab" aria-selected={view === 'site'} className={`${view === 'site' ? 'is-active' : ''}${siteNew.length ? ' has-new' : ''}`} onClick={() => setView('site')} data-testid="pos-view-site"><Globe size={16} /> طلبات الموقع{siteOpen.length > 0 && <i>{siteOpen.length}</i>}</button>
        <button type="button" role="tab" aria-selected={view === 'counter'} className={view === 'counter' ? 'is-active' : ''} onClick={() => setView('counter')} data-testid="pos-view-counter"><ReceiptText size={16} /> طلبات الكاش{counterToday.length > 0 && <i>{counterToday.length}</i>}</button>
        <button type="button" className="pos-stock-btn" onClick={() => setManaging(true)} data-testid="pos-stock"><Boxes size={16} /> المخزون{lowCount > 0 && <i className="is-low">{lowCount}</i>}</button>
      </div>

      {view === 'ring' && <>
        {siteNew.length > 0 && <button type="button" className="pos-site-hint" onClick={() => setView('site')} data-testid="pos-site-hint">🌐 في {siteNew.length} طلب جديد من الموقع، شوفهم ←</button>}
        <div className="pos-main">
          <section className="pos-menu">
            <div className="pos-search">
              <Search size={16} />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على صنف، أو امسح الباركود…" data-testid="pos-search"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setQuery('');
                  if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && q && shown[0]) { add(shown[0], 0); setQuery(''); }
                }} />
              <Barcode size={16} aria-label="الباركود شغّال" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="امسح"><X size={15} /></button>}
            </div>
            {!q && category && (
              <div className="pos-cats">
                <button type="button" onClick={() => setCategory('')} data-testid="pos-back"><ArrowRight size={14} /> كل الأقسام</button>
                {menu.categories.map((name) => <button key={name} type="button" className={category === name ? 'is-active' : ''} onClick={() => setCategory(name)}>{name}</button>)}
              </div>
            )}
            {!q && !category
              ? <div className="pos-catgrid" data-testid="pos-categories">
                {menu.categories.map((name) => {
                  const cover = coverOf(name);
                  const inCart = draft.lines.reduce((sum, line) => sum + (menu.products.find((product) => line.key.startsWith(`${product.id}::`))?.category === name ? line.quantity : 0), 0);
                  return (
                    <button key={name} type="button" className="pos-cat" onClick={() => setCategory(name)} data-testid={`pos-cat-${name}`}>
                      {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="pos-thumb-empty">{name.slice(0, 2)}</span>}
                      <b>{name}</b>
                      <small>{menu.products.filter((product) => product.category === name).length} صنف</small>
                      {inCart > 0 && <i className="pos-count">{inCart}</i>}
                    </button>
                  );
                })}
              </div>
              : <div className="pos-grid">
                {shown.map(tile)}
                {!shown.length && <p className="pos-empty">ما لقينا اشي بهالاسم.</p>}
              </div>}
          </section>
          <div className={`pos-side${sheet ? ' is-open' : ''}`}>{ticket}</div>
        </div>
      </>}

      {view === 'site' && (
        <section className="pos-site" data-testid="pos-site-orders">
          {!siteOpen.length && <p className="pos-empty">ما في طلبات موقع مفتوحة هسه. أول ما يوصل طلب بيرنّ وبيطلع هون.</p>}
          {groups.filter(([, list]) => list.length).map(([title, list]) => (
            <div key={title} className="pos-site-group">
              <h2>{title} <i>{list.length}</i></h2>
              <div className="pos-site-list">{list.map(siteCard)}</div>
            </div>
          ))}
          <p className="admin-hint">طلبات الموقع بتنحسب بالمبيعات لحالها، ما في داعي تدقها عالكاش. الطلب المجدول بيذكّرك قبل موعده بنص ساعة، وبيضل يسأل كل 10 دقايق لحد ما تكبس "بلّشنا".</p>
        </section>
      )}

      {view === 'counter' && (
        <section className="admin-card pos-today">
          <h2>طلبات الكاش اليوم ({counterToday.length})</h2>
          {showSales && (
            <div className="pos-drawer" data-testid="pos-drawer">
              <div><small>كاش بالدرج</small><b>{money(drawer.cash)}</b></div>
              <div><small>كليك</small><b>{money(drawer.cliq)}</b></div>
              <div><small>من الموقع</small><b>{money(drawer.site)}</b></div>
              <div><small>خصومات الكاش</small><b>{money(drawer.discounts)}</b></div>
              <div><small>مجموع اليوم ({drawer.count})</small><b>{money(drawer.all)}</b></div>
            </div>
          )}
          {!counterToday.length && <p className="admin-hint">لسا ما انضرب ولا طلب عالكاش اليوم.</p>}
          <ul className="pos-history">
            {counterToday.map((order) => (
              <li key={order.ref} className={order.status === 'ملغي' ? 'is-cancelled' : ''}>
                <b>#{orderNo(order)}</b>
                <span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join('، ')}</span>
                <em>{money(order.total)}{order.payment === 'كليك' ? ' كليك' : ''}{order.discount ? ` (خصم ${money(order.discount)})` : ''}</em>
                {live.pendingRefs.has(order.ref) ? <Clock size={14} aria-label="مستني النت" className="pos-wait" /> : <small>{order.status}</small>}
                <button type="button" className="admin-print" onClick={() => openEdit(order)} aria-label="عدّل" data-testid={`pos-edit-${order.ref}`}><Pencil size={14} /></button>
                <button type="button" className="admin-print" onClick={() => void printOrder(order)} aria-label="اطبع"><Printer size={14} /></button>
                {order.status !== 'ملغي' && <button type="button" className="admin-print" onClick={() => { if (confirm(`إلغاء طلب الكاش #${orderNo(order)}؟`)) void live.setStatus(order.ref, 'ملغي'); }} aria-label="إلغاء"><X size={14} /></button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'ring' && (lines.length > 0 || editing) && !sheet && (
        <button type="button" className="pos-bar" onClick={() => setSheet(true)} data-testid="pos-bar">
          <span><ShoppingBag size={17} /> {pieces} قطعة</span><b>{money(finalTotal)} د.أ</b><span>كمّل ←</span>
        </button>
      )}
      {toast && (
        <div className="pos-toast" role="status" data-testid="pos-toast">
          <span>{toast.edited ? 'انعدّل' : 'انضرب'} طلب <b>#{orderNo(all.find((order) => order.ref === toast.order.ref) ?? toast.order)}</b> · {money(toast.order.total)} د.أ{live.pendingRefs.has(toast.order.ref) ? ' (محفوظ، بينبعت لما يرجع النت)' : ''}</span>
          {!toast.edited && <button type="button" onClick={() => { void live.setStatus(toast.order.ref, 'ملغي'); setToast(null); }}><Undo2 size={15} /> تراجع</button>}
        </div>
      )}
      {notice && <div className="pos-toast is-notice" role="status" data-testid="pos-notice">{notice}</div>}
      {scanned && <BarcodeDialog code={scanned} products={menu.products} pos={pos} onDone={(key) => {
        setScanned(null);
        if (!key) return;
        const [id, index] = key.split('::');
        const product = menu.products.find((item) => item.id === id) ?? (id.startsWith('g-') ? { id, name: '', category: '', options: [{ label: '', priceFils: 0 }] } : undefined);
        if (product) add(product as Product, Number(index));
      }} />}
      {managing && <StockManager products={menu.products} categories={menu.categories} pos={pos} canManage={canManage} onClose={() => setManaging(false)} />}
    </div>
  );
}
