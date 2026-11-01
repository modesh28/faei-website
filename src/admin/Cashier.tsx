// The cashier screen (الكاش): ring up walk-in orders in a couple of taps, and accept the site's
// orders on the same screen, so nothing is typed twice. It never waits for the internet: an order
// is saved on this device the moment it's rung up and sent to the server when there's a connection
// (see useOrders and offline.ts), so it keeps working when the network drops or crawls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Minus, Pencil, Plus, Printer, Search, ShoppingBag, Trash2, Undo2, X } from 'lucide-react';

import { categories as bundledCategories, products as bundledProducts, type Menu, type Product } from '../menu';
import { markPrinted, printOrder, type Live } from './Admin';
import { isToday, newRef, nextCounterNumber, quickFetch, type LiveOrder, type OrderEdit } from './offline';

const MENU_KEY = 'faei-pos-menu';
const CART_KEY = 'faei-pos-cart';
const PRINT_KEY = 'faei-pos-print';

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* fine */ }
}

const money = (jod: number) => `${jod.toFixed(jod % 1 === 0 ? 0 : 2)}`;
// Same item name as the site's orders, so sales and "most ordered" count both together.
const lineName = (product: Product, index: number) => {
  const label = product.options[index]?.label;
  return `${product.name}${label ? ` — ${label}` : ''}`;
};

type Line = { key: string; quantity: number };
type Draft = { lines: Line[]; note: string; payment: string; fulfillment: string; ready: boolean };
// A line that isn't on today's menu (an old name, a V8 drink…) keeps its own name and price: "c|price|name".
const customKey = (name: string, price: number) => `c|${price}|${name}`;
const EMPTY: Draft = { lines: [], note: '', payment: 'كاش', fulfillment: 'محلي', ready: false };

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

export default function Cashier({ live, showSales, menu: given, editing, onEdit }: { live: Live; showSales: boolean; menu: Menu | null; editing: LiveOrder | null; onEdit: (order: LiveOrder | null) => void }) {
  const menu = useMenu(given);
  const byId = useMemo(() => new Map(menu.products.map((product) => [product.id, product])), [menu]);
  const byName = useMemo(() => new Map(menu.products.flatMap((product) => product.options.map((_, index) => [lineName(product, index), `${product.id}::${index}`] as const))), [menu]);
  const [newDraft, setNewDraft] = useState<Draft>(() => ({ ...EMPTY, ...load<Partial<Draft>>(CART_KEY, {}) }));
  // Changing an order that was already placed (any status): its own ticket, the new-order ticket waits untouched.
  const [fixDraft, setFixDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (!editing) { setFixDraft(null); return; }
    setFixDraft({
      lines: editing.items.map((item) => ({ key: byName.get(item.name) ?? customKey(item.name, item.price), quantity: item.quantity })),
      note: editing.extras, payment: editing.payment, fulfillment: editing.fulfillment, ready: false,
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
  const clear = () => { setDraft((current) => ({ ...EMPTY, payment: current.payment, fulfillment: current.fulfillment })); setPaid(0); };

  // A changed order keeps its site discount (e.g. the launch 15%) as the same percentage, and its delivery.
  const oldSum = editing ? editing.items.reduce((sum, item) => sum + item.price * item.quantity, 0) : 0;
  const discount = editing && oldSum > 0 && editing.discount ? Math.round((editing.discount / oldSum) * total * 1000) / 1000 : 0;
  const delivery = editing && typeof editing.delivery === 'number' ? editing.delivery : 0;
  const finalTotal = editing ? Math.max(0, Math.round((total - discount + delivery) * 1000) / 1000) : total;

  function saveEdit() {
    if (!editing || !fixDraft || !lines.length) return;
    const edit: OrderEdit = {
      items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price })),
      extras: fixDraft.note.trim(), payment: fixDraft.payment, fulfillment: fixDraft.fulfillment,
      discount, total: finalTotal,
    };
    live.editOrder(editing.ref, edit);
    if (printOn) void printOrder({ ...editing, ...edit, editedAt: Date.now() });
    setToast({ order: { ...editing, ...edit }, at: Date.now(), edited: true });
    setPaid(0);
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
      // "Ready now" (a drink, chips…) skips the kitchen; everything else shows on the kitchen screen.
      status: draft.ready ? 'تم' : 'جديد',
      items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price })),
      extras: draft.note.trim(),
      fulfillment: draft.fulfillment,
      address: '',
      time: 'هسه',
      payment: draft.payment,
      preorder: false,
      discount: 0,
      delivery: 0,
      total,
      ...(draft.payment === 'كاش' && paid > total ? { paid } : {}),
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

  // Keyboard on the counter PC: type to search, Enter adds the first match, Ctrl+Enter (or F9) rings up.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || event.key === 'F9') { event.preventDefault(); ringUp(); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  const q = query.trim().toLocaleLowerCase('ar');
  const shown = menu.products.filter((product) => (q
    ? product.name.toLocaleLowerCase('ar').includes(q) || product.category.toLocaleLowerCase('ar').includes(q)
    : !category || product.category === category));
  const qtyOf = (product: Product) => draft.lines.filter((line) => line.key.startsWith(`${product.id}::`)).reduce((sum, line) => sum + line.quantity, 0);

  const all = live.orders ?? [];
  const siteNew = all.filter((order) => order.source !== 'pos' && order.shop !== 'v8' && order.status === 'جديد').sort((a, b) => a.createdAt - b.createdAt);
  const counterToday = all.filter((order) => order.source === 'pos' && isToday(order.createdAt)).sort((a, b) => b.createdAt - a.createdAt);
  const todayValid = all.filter((order) => order.shop !== 'v8' && isToday(order.createdAt) && order.status !== 'ملغي');
  const sum = (list: LiveOrder[]) => list.reduce((total, order) => total + order.total, 0);
  const drawer = {
    cash: sum(todayValid.filter((order) => order.source === 'pos' && order.payment !== 'كليك')),
    cliq: sum(todayValid.filter((order) => order.payment === 'كليك')),
    site: sum(todayValid.filter((order) => order.source !== 'pos')),
    all: sum(todayValid),
    count: todayValid.length,
  };

  const ticket = (
    <section className="pos-ticket" data-testid="pos-ticket">
      <header>
        <h2>{editing ? <><Pencil size={16} /> تعديل طلب <b dir="ltr">#{editing.id}</b></> : <><ShoppingBag size={17} /> الطلب</>} {pieces > 0 && <i>{pieces}</i>}</h2>
        {lines.length > 0 && <button type="button" className="admin-link" onClick={clear} data-testid="pos-clear"><Trash2 size={14} /> فضّي</button>}
        <button type="button" className="pos-sheet-close" onClick={() => setSheet(false)} aria-label="سكّر"><X size={18} /></button>
      </header>
      {editing && <p className="pos-editing">{editing.source === 'pos' ? 'طلب كاش' : 'طلب من الموقع'} · {editing.status}. زيد أو نقّص أو ضيف أصناف من المنيو، وبعدين احفظ. المبيعات بتتعدل لحالها.
        <button type="button" className="admin-link" onClick={() => onEdit(null)} data-testid="pos-edit-cancel">إلغاء التعديل</button></p>}
      {!lines.length && <p className="pos-empty">{editing ? 'الطلب فاضي. ضيف صنف، أو إذا بدك تلغيه ألغيه من قائمة الطلبات.' : 'اكبس على الصنف عشان ينضاف. كبسة كمان بتزيد العدد.'}</p>}
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
      {editing && editing.source !== 'pos' && <p className="pos-editing-meta">الاستلام: {editing.fulfillment}{editing.address ? ` · ${editing.address}` : ''}{typeof editing.delivery === 'number' && editing.delivery > 0 ? ` (توصيل ${money(editing.delivery)})` : ''}{discount ? ` · خصم الموقع ${money(discount)}` : ''}</p>}
      <div className={`pos-seg${editing && editing.source !== 'pos' ? ' is-pay-only' : ''}`}>
        {(!editing || editing.source === 'pos') && (['محلي', 'سفري'] as const).map((value) => <button key={value} type="button" className={draft.fulfillment === value ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, fulfillment: value }))}>{value === 'محلي' ? 'هون' : 'سفري'}</button>)}
        {(['كاش', 'كليك'] as const).map((value) => <button key={value} type="button" className={draft.payment === value ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, payment: value }))} data-testid={`pos-pay-${value}`}>{value}</button>)}
      </div>
      {!editing && <label className="pos-ready"><input type="checkbox" checked={draft.ready} onChange={(event) => { const ready = event.target.checked; setDraft((current) => ({ ...current, ready })); }} /> جاهز فوراً (ما بيروح عالمطبخ)</label>}
      {draft.payment === 'كاش' && total > 0 && (
        <div className="pos-change">
          <small>الزبون دفع:</small>
          {[1, 5, 10, 20].filter((note) => note >= finalTotal || note === 20).map((note) => <button key={note} type="button" className={paid === note ? 'is-active' : ''} onClick={() => setPaid(paid === note ? 0 : note)}>{note}</button>)}
          {paid > 0 && <b className={paid >= finalTotal ? '' : 'is-short'}>{paid >= finalTotal ? `الباقي ${money(paid - finalTotal)}` : `ناقص ${money(finalTotal - paid)}`}</b>}
        </div>
      )}
      <div className="pos-total"><span>المجموع</span><b data-testid="pos-total">{money(finalTotal)} د.أ</b></div>
      <button type="button" className="pos-ring" disabled={!lines.length} onClick={ringUp} data-testid="pos-ring"><Check size={20} /> {editing ? 'احفظ التعديل' : 'دق الطلب'}</button>
      <label className="pos-print"><input type="checkbox" checked={printOn} onChange={(event) => { setPrintOn(event.target.checked); save(PRINT_KEY, event.target.checked); }} /> <Printer size={14} /> اطبع فاتورة مع كل طلب</label>
    </section>
  );

  return (
    <div className="pos" data-testid="cashier">
      {!live.online && <p className="admin-offline">بدون نت هسه، والكاش شغّال عادي. الطلبات بتنحفظ عالجهاز وبتنبعت لحالها لما يرجع النت{live.pending ? ` (${live.pending} مستنيين)` : ''}.</p>}
      {!live.soundOn && <button type="button" className="admin-sound" onClick={live.enableSound}>اكبس هون عشان يرنّ لما يوصل طلب من الموقع</button>}
      {siteNew.length > 0 && (
        <section className="pos-site" data-testid="pos-site-orders">
          <h2>طلبات الموقع الجديدة <i>{siteNew.length}</i></h2>
          <div className="pos-site-list">
            {siteNew.map((order) => (
              <article key={order.ref} className={live.fresh.has(order.ref) ? 'is-fresh' : ''}>
                <header><b dir="ltr">#{order.id}</b><span>{order.fulfillment}{order.payment === 'كليك' ? ' · كليك' : ''}</span><em>{money(order.total)} د.أ</em></header>
                <p>{order.items.map((item) => `${item.quantity}× ${item.name}`).join('، ')}{order.extras ? ` · ${order.extras}` : ''}</p>
                <footer>
                  <button type="button" className="admin-primary" onClick={() => void live.setStatus(order.ref, 'عم يتحضّر')} data-testid={`pos-accept-${order.ref}`}><Check size={15} /> اقبله</button>
                  <button type="button" className="admin-print" onClick={() => { onEdit(order); setSheet(true); }} aria-label="عدّل"><Pencil size={15} /></button>
                  <button type="button" className="admin-print" onClick={() => { markPrinted(order.ref); void printOrder(order); }} aria-label="اطبع"><Printer size={15} /></button>
                </footer>
              </article>
            ))}
          </div>
          <p className="admin-hint">طلبات الموقع محسوبة لحالها بالمبيعات، ما في داعي تدقها عالكاش.</p>
        </section>
      )}
      <div className="pos-main">
        <section className="pos-menu">
          <div className="pos-search">
            <Search size={16} />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على صنف…" data-testid="pos-search"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
                if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && q && shown[0]) { add(shown[0], 0); setQuery(''); }
              }} />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="امسح"><X size={15} /></button>}
          </div>
          {!q && (
            <div className="pos-cats">
              <button type="button" className={!category ? 'is-active' : ''} onClick={() => setCategory('')}>الكل</button>
              {menu.categories.map((name) => <button key={name} type="button" className={category === name ? 'is-active' : ''} onClick={() => setCategory(name)}>{name}</button>)}
            </div>
          )}
          <div className="pos-grid">
            {shown.map((product) => {
              const count = qtyOf(product);
              const off = product.available === false;
              return (
                <article key={product.id} className={`pos-item${count ? ' is-in' : ''}${off ? ' is-off' : ''}`} data-testid={`pos-item-${product.id}`}>
                  {product.options.length === 1
                    ? <button type="button" className="pos-item-main" onClick={() => add(product, 0)}><span>{product.name}</span><em>{money(product.options[0].priceFils / 1000)}</em></button>
                    : <>
                      <span className="pos-item-name">{product.name}</span>
                      <div className="pos-opts">{product.options.map((option, index) => <button key={index} type="button" onClick={() => add(product, index)}>{option.label || 'عادي'} <em>{money(option.priceFils / 1000)}</em></button>)}</div>
                    </>}
                  {count > 0 && <i className="pos-count">{count}</i>}
                  {off && <small className="pos-off">مش متوفر</small>}
                </article>
              );
            })}
            {!shown.length && <p className="pos-empty">ما لقينا اشي بهالاسم.</p>}
          </div>
        </section>
        <div className={`pos-side${sheet ? ' is-open' : ''}`}>{ticket}</div>
      </div>

      <section className="admin-card pos-today">
        <h2>طلبات الكاش اليوم ({counterToday.length})</h2>
        {showSales && (
          <div className="pos-drawer" data-testid="pos-drawer">
            <div><small>كاش بالدرج</small><b>{money(drawer.cash)}</b></div>
            <div><small>كليك</small><b>{money(drawer.cliq)}</b></div>
            <div><small>من الموقع</small><b>{money(drawer.site)}</b></div>
            <div><small>مجموع اليوم ({drawer.count})</small><b>{money(drawer.all)}</b></div>
          </div>
        )}
        {!counterToday.length && <p className="admin-hint">لسا ما انضرب ولا طلب عالكاش اليوم.</p>}
        <ul className="pos-history">
          {counterToday.slice(0, 30).map((order) => (
            <li key={order.ref} className={order.status === 'ملغي' ? 'is-cancelled' : ''}>
              <b>#{order.id}</b>
              <span>{order.items.map((item) => `${item.quantity}× ${item.name}`).join('، ')}</span>
              <em>{money(order.total)}{order.payment === 'كليك' ? ' كليك' : ''}</em>
              {live.pendingRefs.has(order.ref) ? <Clock size={14} aria-label="مستني النت" className="pos-wait" /> : <small>{order.status}</small>}
              <button type="button" className="admin-print" onClick={() => { onEdit(order); setSheet(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="عدّل" data-testid={`pos-edit-${order.ref}`}><Pencil size={14} /></button>
              <button type="button" className="admin-print" onClick={() => void printOrder(order)} aria-label="اطبع"><Printer size={14} /></button>
              {order.status !== 'ملغي' && <button type="button" className="admin-print" onClick={() => { if (confirm(`إلغاء طلب الكاش #${order.id}؟`)) void live.setStatus(order.ref, 'ملغي'); }} aria-label="إلغاء"><X size={14} /></button>}
            </li>
          ))}
        </ul>
      </section>

      {(lines.length > 0 || editing) && !sheet && (
        <button type="button" className="pos-bar" onClick={() => setSheet(true)} data-testid="pos-bar">
          <span><ShoppingBag size={17} /> {pieces} قطعة</span><b>{money(total)} د.أ</b><span>كمّل ←</span>
        </button>
      )}
      {toast && (
        <div className="pos-toast" role="status" data-testid="pos-toast">
          <span>{toast.edited ? 'انعدّل' : 'انضرب'} طلب <b>#{toast.order.id}</b> · {money(toast.order.total)} د.أ{live.pendingRefs.has(toast.order.ref) ? ' (محفوظ، بينبعت لما يرجع النت)' : ''}</span>
          {!toast.edited && <button type="button" onClick={() => { void live.setStatus(toast.order.ref, 'ملغي'); setToast(null); }}><Undo2 size={15} /> تراجع</button>}
        </div>
      )}
    </div>
  );
}
