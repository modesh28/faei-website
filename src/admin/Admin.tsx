import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Bell, Camera, ClipboardList, ExternalLink, LogOut, Pencil, Plus, Search, Tag, Trash2, UserPlus, Users, UtensilsCrossed, X } from 'lucide-react';

import type { Menu, Product } from '../menu';
import { commitFiles, fileSha, GitHubError, readJson, type NewFile } from './github';

const SESSION_STORAGE = 'faei-admin-session';
const MENU_PATH = 'public/menu.json';
const OFFER_PATH = 'public/offer.json';
const NEW_KEY_URL = 'https://github.com/settings/tokens/new?scopes=public_repo&description=FAEI%20admin';

type Offer = { show: boolean; title: string; text: string; productId?: string; optionIndex?: number; discountPercent?: number; endsAt?: string };

function read(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function write(key: string, value: string) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* fine */ } }

const jod = (fils: number) => `${(fils / 1000).toFixed(fils % 1000 === 0 ? 0 : fils % 100 === 0 ? 1 : 2)} د.أ`;
const stringify = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`;

type Session = { session: string; username: string; role: 'admin' | 'staff' };
function readSession(): Session | null { try { return JSON.parse(read(SESSION_STORAGE) || 'null') as Session | null; } catch { return null; } }

export async function adminCall<T = Record<string, unknown>>(body: Record<string, unknown>, session?: string): Promise<{ status: number; data: T }> {
  const response = await fetch('/api/admin', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: JSON.stringify(body),
  });
  let data = {} as T;
  try { data = await response.json() as T; } catch { /* not JSON */ }
  return { status: response.status, data };
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [state, setState] = useState<'loading' | 'offline' | 'not-connected' | 'setup' | 'ready'>('loading');
  async function check() {
    setState('loading');
    try {
      const { status, data } = await adminCall<{ setUp?: boolean }>({ action: 'state' });
      setState(status === 503 ? 'not-connected' : status !== 200 ? 'offline' : data.setUp ? 'ready' : 'setup');
    } catch { setState('offline'); }
  }
  useEffect(() => { void check(); }, []);
  function signIn(next: Session) { write(SESSION_STORAGE, JSON.stringify(next)); setSession(next); setState('ready'); }
  function signOut() {
    if (session) void adminCall({ action: 'logout' }, session.session).catch(() => {});
    write(SESSION_STORAGE, ''); setSession(null);
  }
  if (state === 'loading') return <main className="admin-shell admin-loading">لحظة…</main>;
  if (state === 'offline') return <main className="admin-login"><p className="admin-error">ما في اتصال بالسيرفر. تأكد من النت.</p><button type="button" className="admin-primary" onClick={() => void check()}>جرّب كمان مرة</button></main>;
  if (state === 'not-connected') return <ConnectStorage onRetry={() => void check()} />;
  if (state === 'setup') return <Setup onDone={signIn} />;
  if (!session) return <Login onDone={signIn} />;
  return <Dashboard me={session} onLogout={signOut} />;
}

function ConnectStorage({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="admin-login">
      <img src="/images/faei-logo.webp" alt="FAEI" />
      <h1>خطوة وحدة قبل ما نبلّش</h1>
      <p>لوحة الإدارة بدها مخزن صغير (مجاني) للطلبات والحسابات. بتعمله مرة وحدة من Vercel:</p>
      <ol>
        <li>افتح <a href="https://vercel.com/dashboard/stores" target="_blank" rel="noreferrer">Vercel ← Storage <ExternalLink size={14} /></a>.</li>
        <li>اكبس <b>Create Database</b> ← اختار <b>Upstash</b> (Redis) ← الخطة المجانية <b>Free</b> ← <b>Create</b>.</li>
        <li>بعدها اكبس <b>Connect Project</b> واختار <b>faei-website</b> ← <b>Connect</b>.</li>
        <li>روح على المشروع ← <b>Deployments</b> ← على آخر واحد ⋯ ← <b>Redeploy</b>.</li>
      </ol>
      <button type="button" className="admin-primary" onClick={onRetry}>عملتها، جرّب</button>
    </main>
  );
}

const errors: Record<string, string> = {
  wrong: 'اليوزر أو الباسوورد غلط.',
  locked: 'محاولات غلط كثير. استنى ربع ساعة وجرّب.',
  'bad-username': 'اليوزر لازم يكون 3 أحرف أو أكثر، إنجليزي أو أرقام بس (مثلاً faei).',
  'bad-password': 'الباسوورد لازم يكون 6 خانات أو أكثر.',
  'bad-github-key': 'مفتاح GitHub مش شغال. تأكد إنك نسخته كامل وإنه معلّم عليه public_repo.',
  exists: 'هاليوزر موجود.',
};

function Login({ onDone }: { onDone: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await adminCall<Session & { error?: string }>({ action: 'login', username, password });
      if (data.session) onDone({ session: data.session, username: data.username, role: data.role });
      else setError(errors[data.error ?? ''] ?? 'صار في مشكلة. جرّب كمان مرة.');
    } catch { setError('ما في نت.'); }
    setBusy(false);
  }
  return (
    <main className="admin-login">
      <img src="/images/faei-logo.webp" alt="FAEI" />
      <h1>لوحة إدارة FAEI</h1>
      <form className="admin-stack" onSubmit={submit}>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اليوزر" dir="ltr" autoComplete="username" autoCapitalize="none" data-testid="input-username" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="الباسوورد" type="password" dir="ltr" autoComplete="current-password" data-testid="input-password" />
        <button type="submit" disabled={busy} data-testid="button-login">{busy ? 'لحظة…' : 'دخول'}</button>
      </form>
      {error && <p className="admin-error">{error}</p>}
    </main>
  );
}

function Setup({ onDone }: { onDone: (session: Session) => void }) {
  const [githubToken, setGithubToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await adminCall<Session & { error?: string }>({ action: 'setup', githubToken, username, password });
      if (data.session) onDone({ session: data.session, username: data.username, role: data.role });
      else setError(errors[data.error ?? ''] ?? 'صار في مشكلة. جرّب كمان مرة.');
    } catch { setError('ما في نت.'); }
    setBusy(false);
  }
  return (
    <main className="admin-login">
      <img src="/images/faei-logo.webp" alt="FAEI" />
      <h1>أول مرة: جهّز اللوحة</h1>
      <p>هاد بتعمله مرة وحدة بس. بعدها الدخول بيصير باليوزر والباسوورد من أي جهاز.</p>
      <form className="admin-stack" onSubmit={submit}>
        <label className="admin-field">١. مفتاح GitHub (عشان اللوحة تقدر تعدّل المنيو)
          <span className="admin-hint">اكبس <a href={NEW_KEY_URL} target="_blank" rel="noreferrer">اعمل مفتاح</a>، اختار <b>No expiration</b>، وانزل تحت اكبس <b>Generate token</b> وانسخه.</span>
          <input value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder="ghp_…" dir="ltr" autoComplete="off" spellCheck={false} data-testid="input-github" />
        </label>
        <label className="admin-field">٢. اختار يوزر
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="مثلاً faei" dir="ltr" autoCapitalize="none" autoComplete="username" data-testid="input-username" />
        </label>
        <label className="admin-field">٣. اختار باسوورد
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="6 خانات أو أكثر" dir="ltr" autoComplete="new-password" data-testid="input-password" />
        </label>
        <button type="submit" disabled={busy} data-testid="button-setup">{busy ? 'لحظة…' : 'جهّز وادخل'}</button>
      </form>
      {error && <p className="admin-error">{error}</p>}
    </main>
  );
}

type Tab = 'orders' | 'items' | 'offer' | 'sales' | 'accounts';

function Dashboard({ me, onLogout }: { me: Session; onLogout: () => void }) {
  const token = me.session;
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState<Tab>('orders');
  const live = useOrders(token, onLogout);
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
  useEffect(() => { if (isAdmin) void load(); return () => window.clearInterval(pollTimer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const menuState = loadError
    ? <><p className="admin-error">{loadError}</p><button type="button" className="admin-primary" onClick={() => void load()}>جرّب كمان مرة</button></>
    : <p className="admin-loading">لحظة، عم نجيب المنيو…</p>;

  return (
    <div className="admin-app">
      <header className="admin-top">
        <img src="/images/faei-logo.webp" alt="FAEI" />
        <strong>لوحة الإدارة <small>{me.username}</small></strong>
        <a href="/" target="_blank" rel="noreferrer" className="admin-ghost">الموقع <ExternalLink size={14} /></a>
        <button type="button" className="admin-ghost" onClick={() => { if (!dirty || confirm('في تعديلات ما انحفظت. أكيد بدك تطلع؟')) onLogout(); }} aria-label="تسجيل خروج"><LogOut size={16} /></button>
      </header>
      <nav className="admin-tabs">
        <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')} data-testid="tab-orders"><ClipboardList size={16} /> الطلبات{live.waiting > 0 && <i className="admin-badge">{live.waiting}</i>}</button>
        {isAdmin && <>
          <button type="button" className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')} data-testid="tab-items"><UtensilsCrossed size={16} /> الأصناف</button>
          <button type="button" className={tab === 'offer' ? 'is-active' : ''} onClick={() => setTab('offer')} data-testid="tab-offer"><Tag size={16} /> العرض</button>
          <button type="button" className={tab === 'sales' ? 'is-active' : ''} onClick={() => setTab('sales')} data-testid="tab-sales"><BarChart3 size={16} /> المبيعات</button>
        </>}
        <button type="button" className={tab === 'accounts' ? 'is-active' : ''} onClick={() => setTab('accounts')} data-testid="tab-accounts"><Users size={16} /> {isAdmin ? 'الحسابات' : 'حسابي'}</button>
      </nav>
      <main className="admin-shell">
        {tab === 'orders' && <Orders live={live} />}
        {tab === 'items' && (menu ? <Items menu={menu} photos={photos} onToggle={toggle} onEdit={setEditing} onNew={() => setEditing({ id: '', name: '', category: menu.categories[0] ?? '', options: [{ label: '', priceFils: 0 }] })} onMove={moveCategory} /> : menuState)}
        {tab === 'offer' && (offer ? <OfferForm offer={offer} onChange={setOffer} /> : menuState)}
        {tab === 'sales' && <Sales session={token} />}
        {tab === 'accounts' && <Accounts me={me} />}
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
      {editing && menu && (
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

// ---- Live orders ----

type OrderItem = { name: string; quantity: number; price: number };
type LiveOrder = {
  ref: string; id: string; createdAt: number; status: string; items: OrderItem[]; extras: string;
  fulfillment: string; address: string; time: string; payment: string; preorder: boolean;
  discount: number; delivery: number | string; total: number;
};
type Live = { orders: LiveOrder[] | null; error: string; waiting: number; soundOn: boolean; enableSound: () => void; setStatus: (ref: string, status: string) => Promise<void>; fresh: Set<string> };

let alertAudio: AudioContext | null = null;
function ring() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!alertAudio) alertAudio = new Ctx();
    const ctx = alertAudio;
    if (ctx.state === 'suspended') void ctx.resume();
    [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((delay, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + delay;
      oscillator.type = 'triangle';
      oscillator.frequency.value = index % 3 === 2 ? 1320 : 990;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });
  } catch { /* no sound on this device */ }
  navigator.vibrate?.([300, 120, 300]);
}

// Checks for orders every 8 seconds while the page is on screen and rings for new ones.
function useOrders(session: string, onLogout: () => void): Live {
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [error, setError] = useState('');
  const [soundOn, setSoundOn] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(false);
  const version = useRef(-1);

  // A cheap check first; the full list is only downloaded when something changed.
  async function poll() {
    try {
      const response = await fetch('/api/orders?version', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as { version: number };
      setError('');
      if (data.version !== version.current) await fetchOrders();
    } catch { setError('ما في اتصال، عم نحاول كمان مرة…'); }
  }
  async function fetchOrders() {
    try {
      const response = await fetch('/api/orders', { cache: 'no-store', headers: { Authorization: `Bearer ${session}` } });
      if (response.status === 401) { onLogout(); return; }
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as { orders: LiveOrder[]; version: number };
      setError('');
      version.current = data.version;
      setOrders(data.orders);
      const refs = new Set(data.orders.map((order) => order.ref));
      if (known.current) {
        const added = data.orders.filter((order) => !known.current!.has(order.ref) && order.status === 'جديد');
        if (added.length) {
          if (soundRef.current) ring();
          setFresh((current) => new Set([...current, ...added.map((order) => order.ref)]));
        }
      }
      known.current = refs;
    } catch { setError('ما في اتصال، عم نحاول كمان مرة…'); }
  }
  useEffect(() => {
    void fetchOrders();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 8000);
    const wake = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', wake);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a tablet at the counter awake while orders are open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const grab = () => { if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((value) => { lock = value; }).catch(() => {}); };
    grab();
    document.addEventListener('visibilitychange', grab);
    return () => { document.removeEventListener('visibilitychange', grab); void lock?.release().catch(() => {}); };
  }, []);

  const waiting = (orders ?? []).filter((order) => order.status === 'جديد').length;
  useEffect(() => { document.title = waiting ? `(${waiting}) طلب جديد · FAEI` : 'لوحة FAEI'; }, [waiting]);

  async function setStatus(ref: string, status: string) {
    setOrders((current) => current && current.map((order) => (order.ref === ref ? { ...order, status } : order)));
    setFresh((current) => { const next = new Set(current); next.delete(ref); return next; });
    try {
      const response = await fetch('/api/orders', { method: 'PATCH', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, status }) });
      if (response.status === 401) onLogout();
    } catch { /* the next poll shows the real state */ }
    void fetchOrders();
  }
  function enableSound() { soundRef.current = true; setSoundOn(true); ring(); }
  return { orders, error, waiting, soundOn, enableSound, setStatus, fresh };
}

const ago = (time: number) => {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  return minutes < 1 ? 'هلّق' : minutes < 60 ? `قبل ${minutes} د` : new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', hour: 'numeric', minute: '2-digit' }).format(new Date(time));
};
const ACTIVE = ['جديد', 'عم يتحضّر', 'جاهز'];

function Orders({ live }: { live: Live }) {
  const [, tick] = useState(0);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
  if (live.orders === null) return <>{live.error ? <p className="admin-error">{live.error}</p> : <p className="admin-loading">لحظة، عم نجيب الطلبات…</p>}</>;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());
  const isToday = (order: LiveOrder) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(order.createdAt)) === today;
  const active = live.orders.filter((order) => ACTIVE.includes(order.status)).sort((a, b) => a.createdAt - b.createdAt);
  const done = live.orders.filter((order) => !ACTIVE.includes(order.status) && isToday(order));
  const todays = live.orders.filter((order) => isToday(order) && order.status !== 'ملغي');
  return (
    <>
      {!live.soundOn && <button type="button" className="admin-sound" onClick={live.enableSound} data-testid="button-sound"><Bell size={18} /> اكبس هون عشان يرنّ لما يوصل طلب جديد</button>}
      {live.error && <p className="admin-error">{live.error}</p>}
      <div className="admin-stats">
        <div><small>طلبات اليوم</small><b>{todays.length}</b><em>{active.length} شغّالين هلّق</em></div>
        <div><small>مبيعات اليوم</small><b>{todays.reduce((sum, order) => sum + order.total, 0).toFixed(2)} د.أ</b><em>بدون الملغي</em></div>
      </div>
      {!active.length && <p className="admin-empty">ما في طلبات مفتوحة هلّق. أول ما يوصل طلب بيطلع هون. 👌</p>}
      <div className="admin-orders-grid">
        {active.map((order) => <OrderCard key={order.ref} order={order} fresh={live.fresh.has(order.ref)} onStatus={(status) => void live.setStatus(order.ref, status)} />)}
      </div>
      {done.length > 0 && (
        <section className="admin-card">
          <button type="button" className="admin-link" onClick={() => setShowDone(!showDone)}>{showDone ? 'خبّي' : 'شوف'} اللي خلصوا اليوم ({done.length})</button>
          {showDone && <div className="admin-orders-grid is-done">{done.map((order) => <OrderCard key={order.ref} order={order} fresh={false} onStatus={(status) => void live.setStatus(order.ref, status)} />)}</div>}
        </section>
      )}
    </>
  );
}

function OrderCard({ order, fresh, onStatus }: { order: LiveOrder; fresh: boolean; onStatus: (status: string) => void }) {
  const late = order.status !== 'جاهز' && ACTIVE.includes(order.status) && Date.now() - order.createdAt > 20 * 60_000;
  return (
    <article className={`admin-order is-${['جديد', 'عم يتحضّر', 'جاهز', 'تم', 'ملغي'].indexOf(order.status)}${fresh ? ' is-fresh' : ''}${late ? ' is-late' : ''}`} data-testid={`order-${order.ref}`}>
      <header>
        <b dir="ltr">#{order.id}</b>
        <span className="admin-order-status">{order.status}</span>
        <span className="admin-order-time">{ago(order.createdAt)}</span>
      </header>
      {order.preorder && <p className="admin-order-flag">طلب مسبق (انبعت والمحل مسكّر)</p>}
      <ul>
        {order.items.map((item, index) => <li key={index}><b>{item.quantity}×</b> {item.name}</li>)}
        {order.extras && <li className="admin-order-extras">من الكافتيريا: {order.extras}</li>}
      </ul>
      <dl>
        <div><dt>الاستلام</dt><dd>{order.fulfillment}{order.address ? ` · ${order.address}` : ''}</dd></div>
        <div><dt>الوقت</dt><dd>{order.time}</dd></div>
        <div><dt>الدفع</dt><dd className={order.payment === 'كليك' ? 'is-cliq' : ''}>{order.payment === 'كليك' ? 'كليك (تأكد من التحويل)' : order.payment}</dd></div>
        <div><dt>المجموع</dt><dd><b>{order.total.toFixed(2)} د.أ</b>{order.discount ? ` (بعد خصم ${order.discount.toFixed(2)})` : ''}</dd></div>
      </dl>
      <footer>
        {order.status === 'جديد' && <><button type="button" className="admin-primary" onClick={() => onStatus('عم يتحضّر')} data-testid="button-start">بلّش تحضير</button><button type="button" className="admin-danger" onClick={() => { if (confirm(`إلغاء الطلب #${order.id}؟`)) onStatus('ملغي'); }}>إلغاء</button></>}
        {order.status === 'عم يتحضّر' && <button type="button" className="admin-green" onClick={() => onStatus('جاهز')} data-testid="button-ready">جاهز ✅ (بيوصل للزبون)</button>}
        {order.status === 'جاهز' && <button type="button" className="admin-primary" onClick={() => onStatus('تم')} data-testid="button-picked">استلمه 👍</button>}
        {(order.status === 'تم' || order.status === 'ملغي') && <button type="button" className="admin-link" onClick={() => onStatus('جديد')}>رجّعه للطلبات المفتوحة</button>}
      </footer>
    </article>
  );
}

function Sales({ session }: { session: string }) {
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  useEffect(() => {
    fetch('/api/orders?limit=1000', { cache: 'no-store', headers: { Authorization: `Bearer ${session}` } })
      .then((response) => (response.ok ? response.json() : { orders: [] }))
      .then((data: { orders: LiveOrder[] }) => setOrders(data.orders))
      .catch(() => setOrders([]));
  }, [session]);
  const stats = useMemo(() => {
    const valid = (orders ?? []).filter((order) => order.status !== 'ملغي');
    const day = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(time));
    const today = day(Date.now());
    const weekAgo = day(Date.now() - 6 * 86_400_000);
    const todays = valid.filter((order) => day(order.createdAt) === today);
    const week = valid.filter((order) => day(order.createdAt) >= weekAgo);
    const sum = (list: LiveOrder[]) => list.reduce((total, order) => total + order.total, 0);
    const counts = new Map<string, number>();
    week.forEach((order) => order.items.forEach((item) => counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity)));
    const byDay = new Map<string, number>();
    week.forEach((order) => byDay.set(day(order.createdAt), (byDay.get(day(order.createdAt)) ?? 0) + order.total));
    return {
      todayTotal: sum(todays), todayCount: todays.length, weekTotal: sum(week), weekCount: week.length,
      cliq: sum(week.filter((order) => order.payment === 'كليك')),
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [orders]);
  if (orders === null) return <p className="admin-loading">لحظة…</p>;
  const most = Math.max(1, ...stats.days.map(([, total]) => total));
  return (
    <>
      <div className="admin-stats">
        <div><small>مبيعات اليوم</small><b>{stats.todayTotal.toFixed(2)} د.أ</b><em>{stats.todayCount} طلب</em></div>
        <div><small>آخر 7 أيام</small><b>{stats.weekTotal.toFixed(2)} د.أ</b><em>{stats.weekCount} طلب · كليك {stats.cliq.toFixed(2)}</em></div>
      </div>
      {stats.days.length > 0 && (
        <section className="admin-card">
          <h2>كل يوم</h2>
          <ul className="admin-days">{stats.days.map(([date, total]) => <li key={date}><span>{date.slice(5).replace('-', '/')}</span><i style={{ width: `${(total / most) * 100}%` }} /><b>{total.toFixed(2)}</b></li>)}</ul>
        </section>
      )}
      {stats.top.length > 0 && (
        <section className="admin-card">
          <h2>الأكثر طلباً هالأسبوع</h2>
          <ol className="admin-top-list">{stats.top.map(([item, count]) => <li key={item}><span>{item}</span><b>{count}</b></li>)}</ol>
        </section>
      )}
      <p className="admin-hint">المبيعات من طلبات الموقع (بدون الملغي). كل طلب كمان بينسجل بشيت الطلبات زي قبل.</p>
    </>
  );
}

function Accounts({ me }: { me: Session }) {
  const [users, setUsers] = useState<{ username: string; role: string }[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [myPassword, setMyPassword] = useState('');
  const [message, setMessage] = useState('');
  const isAdmin = me.role === 'admin';
  async function loadUsers() {
    if (!isAdmin) return;
    const { data } = await adminCall<{ users?: { username: string; role: string }[] }>({ action: 'users' }, me.session);
    setUsers(data.users ?? []);
  }
  useEffect(() => { void loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    const { data } = await adminCall<{ ok?: boolean; error?: string }>({ action: 'add-user', username, password, role }, me.session);
    setMessage(data.ok ? `انضاف ${username.trim().toLowerCase()} ✅` : errors[data.error ?? ''] ?? 'ما انضاف.');
    if (data.ok) { setUsername(''); setPassword(''); void loadUsers(); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const { data } = await adminCall<{ ok?: boolean; error?: string }>({ action: 'password', password: myPassword }, me.session);
    setMessage(data.ok ? 'تغيّر الباسوورد ✅' : errors[data.error ?? ''] ?? 'ما تغيّر.');
    if (data.ok) setMyPassword('');
  }
  return (
    <>
      {message && <p className="admin-note">{message}</p>}
      {isAdmin && (
        <section className="admin-card">
          <h2>الحسابات</h2>
          <p className="admin-hint"><b>مدير</b>: كل إشي. <b>موظف</b>: بيشوف الطلبات وبيغيّر حالتها بس.</p>
          <ul className="admin-users">
            {users.map((user) => (
              <li key={user.username}>
                <b dir="ltr">{user.username}</b><span>{user.role === 'admin' ? 'مدير' : 'موظف'}</span>
                {user.username !== me.username && <button type="button" className="admin-link" onClick={async () => { if (confirm(`حذف ${user.username}؟`)) { await adminCall({ action: 'remove-user', username: user.username }, me.session); void loadUsers(); } }}>احذف</button>}
              </li>
            ))}
          </ul>
          <form className="admin-stack" onSubmit={addUser}>
            <h3><UserPlus size={16} /> حساب جديد</h3>
            <input className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اليوزر (إنجليزي)" dir="ltr" autoCapitalize="none" data-testid="input-new-user" />
            <input className="admin-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="الباسوورد" dir="ltr" data-testid="input-new-password" />
            <select className="admin-input" value={role} onChange={(event) => setRole(event.target.value as 'staff' | 'admin')}>
              <option value="staff">موظف (الطلبات بس)</option>
              <option value="admin">مدير (كل إشي)</option>
            </select>
            <button type="submit" className="admin-primary" data-testid="button-add-user">زيد الحساب</button>
          </form>
        </section>
      )}
      <section className="admin-card">
        <h2>غيّر الباسوورد تبعك</h2>
        <form className="admin-row" onSubmit={changePassword}>
          <input className="admin-input" type="password" value={myPassword} onChange={(event) => setMyPassword(event.target.value)} placeholder="باسوورد جديد" dir="ltr" autoComplete="new-password" />
          <button type="submit" className="admin-primary">غيّر</button>
        </form>
      </section>
    </>
  );
}
