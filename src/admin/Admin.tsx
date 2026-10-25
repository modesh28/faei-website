import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Camera, ExternalLink, LogOut, Pencil, Plus, Search, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react';

import type { Menu, Product } from '../menu';
import { checkKey, commitFiles, fileSha, GitHubError, readJson, type NewFile } from './github';

const KEY_STORAGE = 'faei-admin-key';
const SHEET_STORAGE = 'faei-admin-sheet';
const MENU_PATH = 'public/menu.json';
const OFFER_PATH = 'public/offer.json';
const NEW_KEY_URL = 'https://github.com/settings/tokens/new?scopes=public_repo&description=FAEI%20admin';

type Offer = { show: boolean; title: string; text: string; productId?: string; optionIndex?: number; discountPercent?: number; endsAt?: string };

function read(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function write(key: string, value: string) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* fine */ } }

const jod = (fils: number) => `${(fils / 1000).toFixed(fils % 1000 === 0 ? 0 : fils % 100 === 0 ? 1 : 2)} د.أ`;
const stringify = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`;

export default function Admin() {
  const [key, setKey] = useState(() => read(KEY_STORAGE));
  if (!key) return <Login onKey={(value) => { write(KEY_STORAGE, value); setKey(value); }} />;
  return <Dashboard token={key} onLogout={() => { write(KEY_STORAGE, ''); setKey(''); }} />;
}

function Login({ onKey }: { onKey: (key: string) => void }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'wrong'>('idle');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (!token) return;
    setState('checking');
    try {
      if (await checkKey(token)) onKey(token);
      else setState('wrong');
    } catch { setState('wrong'); }
  }
  return (
    <main className="admin-login">
      <img src="/images/faei-logo.webp" alt="FAEI" />
      <h1>لوحة إدارة FAEI</h1>
      <p>المفتاح بتعمله مرة وحدة بس، وبيضل محفوظ على هاد التلفون.</p>
      <ol>
        <li>اكبس <a href={NEW_KEY_URL} target="_blank" rel="noreferrer">اعمل مفتاح جديد <ExternalLink size={14} /></a> وسجّل دخول على GitHub.</li>
        <li>عند <b>Expiration</b> اختار <b>No expiration</b>.</li>
        <li>انزل لتحت واكبس <b>Generate token</b>، وبعدين انسخ المفتاح اللي بيبلّش بـ <code>ghp_</code>.</li>
      </ol>
      <form onSubmit={submit}>
        <input value={value} onChange={(event) => { setValue(event.target.value); setState('idle'); }} placeholder="الصق المفتاح هون" dir="ltr" autoComplete="off" spellCheck={false} data-testid="input-key" />
        <button type="submit" disabled={state === 'checking'} data-testid="button-login">{state === 'checking' ? 'لحظة…' : 'دخول'}</button>
      </form>
      {state === 'wrong' && <p className="admin-error">المفتاح مش شغال. تأكد إنك نسخته كامل، وإنه معلّم عليه <b>public_repo</b>.</p>}
    </main>
  );
}

type Tab = 'items' | 'offer' | 'sales';

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('items');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [saved, setSaved] = useState({ menu: '', offer: '', menuSha: '', offerSha: '' });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'live-wait' | 'live' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const pollTimer = useRef(0);

  async function load() {
    setLoadError('');
    try {
      const [loadedMenu, loadedOffer] = await Promise.all([readJson<Menu>(token, MENU_PATH), readJson<Offer>(token, OFFER_PATH)]);
      setMenu(loadedMenu.data);
      setOffer(loadedOffer.data);
      setSaved({ menu: stringify(loadedMenu.data), offer: stringify(loadedOffer.data), menuSha: loadedMenu.sha, offerSha: loadedOffer.sha });
      setPhotos({});
    } catch (error) {
      if (error instanceof GitHubError && error.status === 401) onLogout();
      else setLoadError('ما قدرنا نجيب المنيو. تأكد من النت وجرّب كمان مرة.');
    }
  }
  useEffect(() => { void load(); return () => window.clearInterval(pollTimer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const menuText = menu ? stringify(menu) : '';
  const offerText = offer ? stringify(offer) : '';
  const dirty = !!menu && (menuText !== saved.menu || offerText !== saved.offer);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function updateProduct(product: Product) {
    setMenu((current) => {
      if (!current) return current;
      const exists = current.products.some((item) => item.id === product.id);
      const categories = current.categories.includes(product.category) ? current.categories : [...current.categories, product.category];
      return { categories, products: exists ? current.products.map((item) => (item.id === product.id ? product : item)) : [...current.products, product] };
    });
  }
  function removeProduct(id: string) {
    setMenu((current) => current && { ...current, products: current.products.filter((item) => item.id !== id) });
  }
  function toggle(id: string) {
    setMenu((current) => current && {
      ...current,
      products: current.products.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item };
        if (item.available === false) delete next.available; else next.available = false;
        return next;
      }),
    });
  }
  function moveCategory(category: string, direction: -1 | 1) {
    setMenu((current) => {
      if (!current) return current;
      const list = [...current.categories];
      const from = list.indexOf(category);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return current;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...current, categories: list };
    });
  }

  async function save() {
    if (!menu || !offer || saving === 'saving') return;
    setSaving('saving');
    setSaveError('');
    try {
      const [menuSha, offerSha] = await Promise.all([fileSha(token, MENU_PATH), fileSha(token, OFFER_PATH)]);
      if (menuSha !== saved.menuSha || offerSha !== saved.offerSha) {
        setSaving('error');
        setSaveError('في حدا ثاني عدّل من جهاز ثاني. حدّث الصفحة وأعد تعديلك.');
        return;
      }
      // Empty sections disappear from the site, so drop them here too.
      const cleanMenu: Menu = { categories: menu.categories.filter((category) => menu.products.some((item) => item.category === category)), products: menu.products };
      const files: NewFile[] = [];
      const newMenuText = stringify(cleanMenu);
      if (newMenuText !== saved.menu) files.push({ path: MENU_PATH, text: newMenuText });
      if (offerText !== saved.offer) files.push({ path: OFFER_PATH, text: offerText });
      Object.entries(photos).forEach(([path, base64]) => {
        if (cleanMenu.products.some((item) => item.image === path)) files.push({ path: `public${path}`, base64: base64.split(',')[1] });
      });
      if (!files.length) { setSaving('idle'); return; }
      await commitFiles(token, files, 'تعديل من لوحة الإدارة');
      const [nextMenuSha, nextOfferSha] = await Promise.all([fileSha(token, MENU_PATH), fileSha(token, OFFER_PATH)]);
      setMenu(cleanMenu);
      setSaved({ menu: newMenuText, offer: offerText, menuSha: nextMenuSha, offerSha: nextOfferSha });
      setPhotos({});
      setSaving('live-wait');
      waitForLive(newMenuText, offerText);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 401) { onLogout(); return; }
      setSaving('error');
      setSaveError('ما انحفظ. تأكد من النت وجرّب كمان مرة.');
    }
  }
  // Watch the live site until the new menu shows up (Vercel takes about a minute).
  function waitForLive(menuJson: string, offerJson: string) {
    window.clearInterval(pollTimer.current);
    const started = Date.now();
    const same = (a: string, b: string) => JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    pollTimer.current = window.setInterval(() => {
      if (Date.now() - started > 5 * 60_000) { window.clearInterval(pollTimer.current); setSaving('live'); return; }
      Promise.all([fetch(`/menu.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()), fetch(`/offer.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())])
        .then(([liveMenu, liveOffer]) => {
          if (same(liveMenu, menuJson) && same(liveOffer, offerJson)) { window.clearInterval(pollTimer.current); setSaving('live'); }
        })
        .catch(() => {});
    }, 8000);
  }

  if (loadError) return <main className="admin-shell"><p className="admin-error">{loadError}</p><button type="button" className="admin-primary" onClick={() => void load()}>جرّب كمان مرة</button></main>;
  if (!menu || !offer) return <main className="admin-shell admin-loading">لحظة، عم نجيب المنيو…</main>;

  return (
    <div className="admin-app">
      <header className="admin-top">
        <img src="/images/faei-logo.webp" alt="FAEI" />
        <strong>لوحة الإدارة</strong>
        <a href="/" target="_blank" rel="noreferrer" className="admin-ghost">الموقع <ExternalLink size={14} /></a>
        <button type="button" className="admin-ghost" onClick={() => { if (!dirty || confirm('في تعديلات ما انحفظت. أكيد بدك تطلع؟')) onLogout(); }} aria-label="تسجيل خروج"><LogOut size={16} /></button>
      </header>
      <nav className="admin-tabs">
        <button type="button" className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')} data-testid="tab-items"><UtensilsCrossed size={16} /> الأصناف</button>
        <button type="button" className={tab === 'offer' ? 'is-active' : ''} onClick={() => setTab('offer')} data-testid="tab-offer"><Tag size={16} /> العرض</button>
        <button type="button" className={tab === 'sales' ? 'is-active' : ''} onClick={() => setTab('sales')} data-testid="tab-sales"><BarChart3 size={16} /> المبيعات</button>
      </nav>
      <main className="admin-shell">
        {tab === 'items' && <Items menu={menu} photos={photos} onToggle={toggle} onEdit={setEditing} onNew={() => setEditing({ id: '', name: '', category: menu.categories[0] ?? '', options: [{ label: '', priceFils: 0 }] })} onMove={moveCategory} />}
        {tab === 'offer' && <OfferForm offer={offer} onChange={setOffer} />}
        {tab === 'sales' && <Sales />}
      </main>
      {(dirty || saving !== 'idle') && (
        <div className={`admin-savebar is-${saving}`} data-testid="savebar">
          {saving === 'saving' ? <span>عم نحفظ…</span>
            : saving === 'live-wait' && !dirty ? <span>انحفظ ✅ بيظهر عالموقع خلال دقيقة تقريباً…</span>
            : saving === 'live' && !dirty ? <><span>صار عالموقع ✅</span><button type="button" onClick={() => setSaving('idle')} aria-label="سكّر"><X size={16} /></button></>
            : saving === 'error' ? <><span>{saveError}</span><button type="button" className="admin-primary" onClick={() => void save()}>جرّب كمان مرة</button></>
            : <><span>عندك تعديلات ما انحفظت</span><button type="button" className="admin-primary" onClick={() => void save()} data-testid="button-save">احفظ ونزّل عالموقع</button></>}
        </div>
      )}
      {editing && (
        <ItemForm
          product={editing}
          categories={menu.categories}
          photo={editing.image ? photos[editing.image] : undefined}
          onClose={() => setEditing(null)}
          onSave={(product, photo) => {
            if (photo && product.image) setPhotos((current) => ({ ...current, [product.image!]: photo }));
            updateProduct(product);
            setEditing(null);
          }}
          onDelete={editing.id && menu.products.some((item) => item.id === editing.id) ? () => { removeProduct(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function Items({ menu, photos, onToggle, onEdit, onNew, onMove }: { menu: Menu; photos: Record<string, string>; onToggle: (id: string) => void; onEdit: (product: Product) => void; onNew: () => void; onMove: (category: string, direction: -1 | 1) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('ar');
  const off = menu.products.filter((item) => item.available === false).length;
  return (
    <>
      <div className="admin-row">
        <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على صنف" /></label>
        <button type="button" className="admin-primary" onClick={onNew} data-testid="button-new-item"><Plus size={16} /> صنف جديد</button>
      </div>
      {off > 0 && <p className="admin-note">{off === 1 ? 'في صنف واحد موقّف' : `في ${off} أصناف موقّفة`}.</p>}
      {menu.categories.map((category, index) => {
        const items = menu.products.filter((item) => item.category === category && (!q || item.name.toLocaleLowerCase('ar').includes(q)));
        if (!items.length) return null;
        return (
          <section key={category} className="admin-category">
            <div className="admin-category-head">
              <h2>{category}</h2>
              {!q && <>
                <button type="button" onClick={() => onMove(category, -1)} disabled={index === 0} aria-label="طلّع القسم لفوق"><ArrowUp size={15} /></button>
                <button type="button" onClick={() => onMove(category, 1)} disabled={index === menu.categories.length - 1} aria-label="نزّل القسم لتحت"><ArrowDown size={15} /></button>
              </>}
            </div>
            {items.map((item) => {
              const on = item.available !== false;
              const image = item.image ? photos[item.image] ?? item.image : undefined;
              return (
                <article key={item.id} className={`admin-item${on ? '' : ' is-off'}`} data-testid={`admin-item-${item.id}`}>
                  <button type="button" className="admin-item-main" onClick={() => onEdit(item)}>
                    {image ? <img src={image} alt="" loading="lazy" /> : <span className="admin-noimg"><Camera size={18} /></span>}
                    <span className="admin-item-text">
                      <b>{item.name}</b>
                      <small>{item.options.map((option) => `${option.label ? `${option.label} ` : ''}${jod(option.priceFils)}`).join(' · ')}</small>
                    </span>
                    <Pencil size={15} className="admin-item-edit" />
                  </button>
                  <label className="admin-switch" title={on ? 'متوفر' : 'موقّف'}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(item.id)} data-testid={`toggle-${item.id}`} />
                    <span />
                    <em>{on ? 'متوفر' : 'موقّف'}</em>
                  </label>
                </article>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

// Crops and shrinks a photo to 800×600 so the menu stays fast.
async function preparePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    const scale = Math.max(800 / image.naturalWidth, 600 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (800 - width) / 2, (600 - height) / 2, width, height);
    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function slug() { return `item-${Date.now().toString(36)}`; }

function ItemForm({ product, categories, photo, onClose, onSave, onDelete }: { product: Product; categories: string[]; photo?: string; onClose: () => void; onSave: (product: Product, photo?: string) => void; onDelete?: () => void }) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [newCategory, setNewCategory] = useState('');
  const [options, setOptions] = useState(product.options.map((option) => ({ label: option.label, price: option.priceFils ? String(option.priceFils / 1000) : '' })));
  const [popular, setPopular] = useState(!!product.popular);
  const [available, setAvailable] = useState(product.available !== false);
  const [newPhoto, setNewPhoto] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = !product.id;
  const preview = newPhoto ?? photo ?? product.image;

  async function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try { setNewPhoto(await preparePhoto(file)); } catch { setError('ما قدرنا نفتح الصورة. جرّب صورة ثانية.'); }
    setBusy(false);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const finalCategory = category === '__new' ? newCategory.trim() : category;
    const cleanOptions = options.map((option) => ({ label: option.label.trim(), priceFils: Math.round(Number(option.price.replace(',', '.')) * 1000) }));
    if (!name.trim()) return setError('اكتب اسم الصنف.');
    if (!finalCategory) return setError('اختار القسم أو اكتب اسم قسم جديد.');
    if (!cleanOptions.length || cleanOptions.some((option) => !(option.priceFils > 0 && option.priceFils < 100_000))) return setError('اكتب سعر صحيح لكل خيار (مثلاً 1.25).');
    if (cleanOptions.length > 1 && cleanOptions.some((option) => !option.label)) return setError('لما يكون في أكثر من سعر، اكتب اسم لكل واحد (مثلاً صغير، كبير).');
    const id = product.id || slug();
    const image = newPhoto ? `/images/menu/${id}-${Date.now().toString(36)}.${newPhoto.startsWith('data:image/webp') ? 'webp' : 'jpg'}` : product.image;
    const next: Product = { id, name: name.trim(), category: finalCategory, options: cleanOptions };
    if (image) next.image = image;
    if (product.alt) next.alt = product.alt;
    if (popular) next.popular = true;
    if (!available) next.available = false;
    onSave(next, newPhoto);
  }
  return (
    <div className="admin-sheet-wrap" role="dialog" aria-modal="true">
      <button type="button" className="admin-sheet-backdrop" onClick={onClose} aria-label="سكّر" />
      <form className="admin-sheet" onSubmit={submit} data-testid="item-form">
        <div className="admin-sheet-head">
          <h2>{isNew ? 'صنف جديد' : 'تعديل الصنف'}</h2>
          <button type="button" onClick={onClose} aria-label="سكّر"><X size={18} /></button>
        </div>
        <label className="admin-photo">
          {preview ? <img src={preview} alt="" /> : <span><Camera size={26} /> زيد صورة</span>}
          <em>{busy ? 'لحظة…' : preview ? 'غيّر الصورة' : 'اختار صورة'}</em>
          <input type="file" accept="image/*" onChange={pickPhoto} data-testid="input-photo" />
        </label>
        <label className="admin-field">اسم الصنف<input value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً: وجبة شاورما سوبر" data-testid="input-name" /></label>
        <label className="admin-field">القسم
          <select value={category} onChange={(event) => setCategory(event.target.value)} data-testid="select-category">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__new">+ قسم جديد…</option>
          </select>
        </label>
        {category === '__new' && <label className="admin-field">اسم القسم الجديد<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="مثلاً: مشروبات" /></label>}
        <fieldset className="admin-options">
          <legend>الأسعار (بالدينار)</legend>
          {options.map((option, index) => (
            <div key={index} className="admin-option">
              <input value={option.label} onChange={(event) => setOptions(options.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} placeholder={options.length > 1 ? 'الحجم (صغير…)' : 'الحجم (اختياري)'} />
              <input value={option.price} onChange={(event) => setOptions(options.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)))} placeholder="1.25" inputMode="decimal" dir="ltr" data-testid={`input-price-${index}`} />
              {options.length > 1 && <button type="button" onClick={() => setOptions(options.filter((_, i) => i !== index))} aria-label="احذف هالسعر"><X size={15} /></button>}
            </div>
          ))}
          <button type="button" className="admin-link" onClick={() => setOptions([...options, { label: '', price: '' }])}><Plus size={14} /> زيد حجم ثاني</button>
        </fieldset>
        <label className="admin-check"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /> متوفر</label>
        <label className="admin-check"><input type="checkbox" checked={popular} onChange={(event) => setPopular(event.target.checked)} /> علامة "الأكثر طلباً"</label>
        {error && <p className="admin-error">{error}</p>}
        <div className="admin-sheet-actions">
          <button type="submit" className="admin-primary" disabled={busy} data-testid="button-item-done">تمام</button>
          {onDelete && <button type="button" className="admin-danger" onClick={() => { if (confirm(`أكيد بدك تحذف "${product.name}" من المنيو؟`)) onDelete(); }} data-testid="button-delete"><Trash2 size={15} /> احذف</button>}
        </div>
        <p className="admin-hint">التعديل بيصير عالموقع لما تكبس "احفظ ونزّل عالموقع" تحت.</p>
      </form>
    </div>
  );
}

// The offer's last day is stored as the moment after it ends: midnight Amman time.
function lastDayOf(endsAt?: string): string {
  if (!endsAt) return '';
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(end - 60_000));
}
function endsAtFor(lastDay: string): string | undefined {
  if (!lastDay) return undefined;
  const next = new Date(`${lastDay}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString().slice(0, 10)}T00:00:00+03:00`;
}

function OfferForm({ offer, onChange }: { offer: Offer; onChange: (offer: Offer) => void }) {
  const set = (patch: Partial<Offer>) => {
    const next: Offer = { ...offer, ...patch };
    (Object.keys(next) as (keyof Offer)[]).forEach((field) => { if (next[field] === undefined) delete next[field]; });
    onChange(next);
  };
  const ended = !!offer.endsAt && Date.now() >= Date.parse(offer.endsAt);
  return (
    <section className="admin-card">
      <h2>شريط العرض</h2>
      <p className="admin-hint">الشريط الأصفر اللي تحت أول الموقع. إذا حطيت نسبة خصم، بتنخصم تلقائياً بالسلة وبرسالة الواتساب.</p>
      <label className="admin-check"><input type="checkbox" checked={offer.show} onChange={(event) => set({ show: event.target.checked })} data-testid="offer-show" /> العرض ظاهر عالموقع</label>
      {ended && offer.show && <p className="admin-note">انتهى تاريخ هالعرض، فهو مخفي تلقائياً. غيّر آخر يوم عشان يرجع.</p>}
      <label className="admin-field">العنوان<input value={offer.title} onChange={(event) => set({ title: event.target.value })} placeholder="مثلاً: عرض الإطلاق" /></label>
      <label className="admin-field">النص<textarea value={offer.text} onChange={(event) => set({ text: event.target.value })} rows={3} placeholder="مثلاً: خصم 15% على كل المنيو لما تطلب من الموقع" data-testid="offer-text" /></label>
      <label className="admin-field">نسبة الخصم على كل المنيو (اتركها فاضية إذا ما في خصم)
        <input value={offer.discountPercent ?? ''} onChange={(event) => { const n = Number(event.target.value); set({ discountPercent: event.target.value && n > 0 ? Math.min(90, Math.round(n)) : undefined }); }} inputMode="numeric" dir="ltr" placeholder="15" data-testid="offer-percent" />
      </label>
      <label className="admin-field">آخر يوم للعرض (اتركه فاضي إذا ما إله نهاية)
        <input type="date" value={lastDayOf(offer.endsAt)} onChange={(event) => set({ endsAt: endsAtFor(event.target.value) })} dir="ltr" data-testid="offer-end" />
      </label>
    </section>
  );
}

// Sales come from the orders Google Sheet. Its link is kept only on this phone.
type Order = { date: string; time: string; id: string; items: string; total: number; status: string; payment: string; fulfillment: string };
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function Sales() {
  const [sheet, setSheet] = useState(() => read(SHEET_STORAGE));
  const [draft, setDraft] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const sheetId = sheet.match(/\/d\/([\w-]{20,})/)?.[1] ?? '';

  async function load() {
    if (!sheetId) return;
    setError('');
    try {
      const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('الطلبات')}&t=${Date.now()}`, { cache: 'no-store' });
      const text = await response.text();
      if (!response.ok || text.trimStart().startsWith('<')) throw new Error('private');
      const rows = parseCsv(text).slice(1).filter((row) => row[2]);
      setOrders(rows.map((row) => ({ date: row[0], time: row[1], id: row[2], items: row[3], total: Number(row[7]) || 0, fulfillment: row[8], payment: row[11], status: row[14] ?? '' })).reverse());
    } catch {
      setOrders(null);
      setError('ما قدرنا نقرأ الشيت. تأكد إنه مشارك "Anyone with the link" كـ Viewer.');
    }
  }
  useEffect(() => { void load(); }, [sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());
  const weekAgo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(Date.now() - 6 * 86_400_000));
  const stats = useMemo(() => {
    const valid = (orders ?? []).filter((order) => order.status !== 'ملغي');
    const sum = (list: Order[]) => list.reduce((total, order) => total + order.total, 0);
    const todays = valid.filter((order) => order.date === today);
    const week = valid.filter((order) => order.date >= weekAgo);
    const counts = new Map<string, number>();
    week.forEach((order) => order.items.split('، ').forEach((part) => {
      const match = part.match(/^(.*) × (\d+)$/);
      if (match) counts.set(match[1], (counts.get(match[1]) ?? 0) + Number(match[2]));
    }));
    return {
      todayTotal: sum(todays), todayCount: todays.length, weekTotal: sum(week), weekCount: week.length,
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [orders, today, weekAgo]);

  if (!sheetId) return (
    <section className="admin-card">
      <h2>اربط شيت الطلبات</h2>
      <p className="admin-hint">مرة وحدة بس: افتح شيت الطلبات ← <b>Share</b> ← تحت <b>General access</b> اختار <b>Anyone with the link</b> (Viewer) ← <b>Copy link</b>، والصقه هون.</p>
      <form className="admin-row" onSubmit={(event) => { event.preventDefault(); write(SHEET_STORAGE, draft.trim()); setSheet(draft.trim()); }}>
        <input className="admin-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" dir="ltr" data-testid="input-sheet" />
        <button type="submit" className="admin-primary">اربط</button>
      </form>
    </section>
  );
  return (
    <>
      <div className="admin-stats">
        <div><small>مبيعات اليوم</small><b>{stats.todayTotal.toFixed(2)} د.أ</b><em>{stats.todayCount} طلب</em></div>
        <div><small>آخر 7 أيام</small><b>{stats.weekTotal.toFixed(2)} د.أ</b><em>{stats.weekCount} طلب</em></div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-row">
        <button type="button" className="admin-ghost-dark" onClick={() => void load()}>تحديث</button>
        <a className="admin-ghost-dark" href={sheet} target="_blank" rel="noreferrer">افتح الشيت <ExternalLink size={14} /></a>
        <button type="button" className="admin-link" onClick={() => { write(SHEET_STORAGE, ''); setSheet(''); setOrders(null); }}>غيّر الشيت</button>
      </div>
      {stats.top.length > 0 && (
        <section className="admin-card">
          <h2>الأكثر طلباً هالأسبوع</h2>
          <ol className="admin-top-list">{stats.top.map(([item, count]) => <li key={item}><span>{item}</span><b>{count}</b></li>)}</ol>
        </section>
      )}
      <section className="admin-card">
        <h2>آخر الطلبات</h2>
        {orders === null && !error && <p className="admin-hint">لحظة…</p>}
        {orders?.length === 0 && <p className="admin-hint">لسا ما في طلبات.</p>}
        <ul className="admin-orders">
          {orders?.slice(0, 30).map((order) => (
            <li key={`${order.date}-${order.id}`} className={order.status === 'ملغي' ? 'is-cancelled' : ''}>
              <div><b dir="ltr">#{order.id}</b><span>{order.date === today ? 'اليوم' : order.date} {order.time}</span>{order.status && <em>{order.status}</em>}</div>
              <p>{order.items}</p>
              <div><span>{order.fulfillment} · {order.payment}</span><b>{order.total.toFixed(2)} د.أ</b></div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

