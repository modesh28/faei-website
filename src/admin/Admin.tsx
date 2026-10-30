import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Coffee, Images, Printer, Bell, Contact, Download, Gift, Camera, ClipboardList, Eye, ExternalLink, GripVertical, List, Columns3, Maximize, LogOut, MessageCircle, Moon, Sun, Pencil, Plus, Search, Tag, Trash2, UserPlus, Users, UtensilsCrossed, X } from 'lucide-react';

import type { Menu, Product } from '../menu';
import { useTheme } from '../theme';
import { BRAND } from '../brand';
import { commitFiles, fileSha, GitHubError, readJson, type NewFile } from './github';

const SESSION_STORAGE = 'faei-admin-session';
const MENU_PATH = 'public/menu.json';
const OFFER_PATH = 'public/offer.json';
const V8_PATH = 'public/v8.json';
const NEW_KEY_URL = 'https://github.com/settings/tokens/new?scopes=public_repo&description=' + encodeURIComponent(`${BRAND.name} admin`);

type Offer = { show: boolean; title: string; text: string; productId?: string; optionIndex?: number; discountPercent?: number; endsAt?: string };

function read(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function write(key: string, value: string) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* fine */ } }

const jod = (fils: number) => `${(fils / 1000).toFixed(fils % 1000 === 0 ? 0 : fils % 100 === 0 ? 1 : 2)} د.أ`;
const stringify = (value: unknown) => `${JSON.stringify(value, null, 1)}\n`;

type Role = 'dev' | 'admin' | 'staff' | 'v8';
type Session = { session: string; username: string; role: Role };
const ROLE_NAMES: Record<Role, string> = { dev: 'مطوّر', admin: 'إدارة', staff: 'موظف', v8: 'موظف V8' };
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
  return <Dashboard key={session.role} me={session} onLogout={signOut} onRole={(role) => signIn({ ...session, role })} />;
}

function ConnectStorage({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="admin-login">
      <img src={BRAND.images.logo} alt={BRAND.name} />
      <h1>خطوة وحدة قبل ما نبلّش</h1>
      <p>لوحة الإدارة بدها مخزن صغير (مجاني) للطلبات والحسابات. بتعمله مرة وحدة من Vercel:</p>
      <ol>
        <li>افتح <a href="https://vercel.com/dashboard/stores" target="_blank" rel="noreferrer">Vercel ← Storage <ExternalLink size={14} /></a>.</li>
        <li>اكبس <b>Create Database</b> ← اختار <b>Upstash</b> (Redis) ← الخطة المجانية <b>Free</b> ← <b>Create</b>.</li>
        <li>بعدها اكبس <b>Connect Project</b> واختار <b>مشروع الموقع</b> ← <b>Connect</b>.</li>
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
      <img src={BRAND.images.logo} alt={BRAND.name} />
      <h1>لوحة إدارة {BRAND.name}</h1>
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
      <img src={BRAND.images.logo} alt={BRAND.name} />
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

type Tab = 'orders' | 'items' | 'offer' | 'sales' | 'customers' | 'gallery' | 'v8' | 'accounts';

function Dashboard({ me, onLogout, onRole }: { me: Session; onLogout: () => void; onRole: (role: Role) => void }) {
  const token = me.session;
  // dev: everything. admin: orders, items on/off, sales. staff: orders.
  const isDev = me.role === 'dev';
  const isAdmin = me.role === 'dev' || me.role === 'admin';
  // The role can change on the server (another account edited it), so check it once on open.
  useEffect(() => {
    adminCall<{ role?: Role }>({ action: 'me' }, token)
      .then(({ status, data }) => { if (status === 401) onLogout(); else if (data.role && data.role !== me.role) onRole(data.role); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<Tab>('orders');
  // The V8 editor stays mounted once opened, so its unsaved edits survive a tab switch.
  const [v8Opened, setV8Opened] = useState(false);
  useEffect(() => { if (tab === 'v8') setV8Opened(true); }, [tab]);
  const live = useOrders(token, onLogout);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [saved, setSaved] = useState({ menu: '', offer: '', menuSha: '', offerSha: '' });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'live-wait' | 'live' | 'error'>('idle');
  const [reviewing, setReviewing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const pollTimer = useRef(0);

  async function load() {
    setLoadError('');
    if (!isDev) {
      try {
        const response = await fetch(`/menu.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        setMenu(await response.json() as Menu);
      } catch { setLoadError('ما قدرنا نجيب المنيو. تأكد من النت وجرّب كمان مرة.'); }
      return;
    }
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
  const dirty = isDev && !!menu && (menuText !== saved.menu || offerText !== saved.offer);
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
  // The shop's managers turn an item on or off and it's saved right away (no save bar).
  const [switching, setSwitching] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  async function quickToggle(id: string) {
    const product = menu?.products.find((item) => item.id === id);
    if (!product || switching[id] === 'saving') return;
    const available = product.available === false;
    toggle(id);
    setSwitching((current) => ({ ...current, [id]: 'saving' }));
    try {
      const { status } = await adminCall({ action: 'availability', id, available }, token);
      if (status === 401) { onLogout(); return; }
      if (status !== 200) throw new Error(String(status));
      setSwitching((current) => ({ ...current, [id]: 'saved' }));
    } catch {
      toggle(id);
      setSwitching((current) => ({ ...current, [id]: 'error' }));
    }
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
        {me.role === 'v8' ? <img src="/images/v8/v8-logo.webp" alt="V8" className="admin-v8-logo" /> : <img src={BRAND.images.logo} alt={BRAND.name} />}
        <strong>لوحة الإدارة <small>{me.username} · {ROLE_NAMES[me.role]}</small></strong>
        <ThemeButton />
        <InstallPanel />
        <a href="/" target="_blank" rel="noreferrer" className="admin-ghost" aria-label="الموقع"><span>الموقع</span> <ExternalLink size={14} /></a>
        <button type="button" className="admin-ghost" onClick={() => { if (!dirty || confirm('في تعديلات ما انحفظت. أكيد بدك تطلع؟')) onLogout(); }} aria-label="تسجيل خروج"><LogOut size={16} /></button>
      </header>
      <nav className="admin-tabs">
        <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')} data-testid="tab-orders"><ClipboardList size={16} /> الطلبات{live.waiting > 0 && <i className="admin-badge">{live.waiting}</i>}</button>
        {isAdmin && <>
          <button type="button" className={tab === 'items' ? 'is-active' : ''} onClick={() => setTab('items')} data-testid="tab-items"><UtensilsCrossed size={16} /> الأصناف</button>
          {isDev && <button type="button" className={tab === 'offer' ? 'is-active' : ''} onClick={() => setTab('offer')} data-testid="tab-offer"><Tag size={16} /> العرض</button>}
          <button type="button" className={tab === 'sales' ? 'is-active' : ''} onClick={() => setTab('sales')} data-testid="tab-sales"><BarChart3 size={16} /> المبيعات</button>
          {isDev && <button type="button" className={tab === 'gallery' ? 'is-active' : ''} onClick={() => setTab('gallery')} data-testid="tab-gallery"><Images size={16} /> الصور</button>}
          {isDev && <button type="button" className={tab === 'customers' ? 'is-active' : ''} onClick={() => setTab('customers')} data-testid="tab-customers"><Contact size={16} /> الزباين</button>}
          {isDev && BRAND.innerShop && <button type="button" className={tab === 'v8' ? 'is-active' : ''} onClick={() => setTab('v8')} data-testid="tab-v8"><Coffee size={16} /> V8</button>}
        </>}
        <button type="button" className={tab === 'accounts' ? 'is-active' : ''} onClick={() => setTab('accounts')} data-testid="tab-accounts"><Users size={16} /> {isDev ? 'الحسابات' : 'حسابي'}</button>
      </nav>
      <main className="admin-shell">
        {tab === 'orders' && <Orders live={live} showSales={isAdmin} showV8={isDev && BRAND.innerShop} />}
        {tab === 'items' && (menu ? (isDev
          ? <Items menu={menu} photos={photos} onToggle={toggle} onEdit={setEditing} onNew={() => setEditing({ id: '', name: '', category: menu.categories[0] ?? '', options: [{ label: '', priceFils: 0 }] })} onMove={moveCategory} />
          : <Items menu={menu} photos={photos} onToggle={(id) => void quickToggle(id)} switching={switching} />) : menuState)}
        {tab === 'offer' && (offer ? <OfferForm offer={offer} onChange={setOffer} /> : menuState)}
        {tab === 'sales' && <Sales session={token} showV8={isDev && BRAND.innerShop} products={menu?.products ?? []} />}
        {tab === 'customers' && <Customers session={token} />}
        {isDev && tab === 'gallery' && <GalleryEditor session={token} onLogout={onLogout} />}
        {isDev && v8Opened && <div hidden={tab !== 'v8'}><V8Editor session={token} onLogout={onLogout} /></div>}
        {tab === 'accounts' && <Accounts me={me} />}
      </main>
      {(dirty || saving !== 'idle') && (
        <div className={`admin-savebar is-${saving}`} data-testid="savebar">
          {saving === 'saving' ? <span>عم نحفظ…</span>
            : saving === 'live-wait' && !dirty ? <span>انحفظ ✅ بيظهر عالموقع خلال دقيقة تقريباً…</span>
            : saving === 'live' && !dirty ? <><span>صار عالموقع ✅</span><button type="button" onClick={() => setSaving('idle')} aria-label="سكّر"><X size={16} /></button></>
            : saving === 'error' ? <><span>{saveError}</span><button type="button" className="admin-primary" onClick={() => void save()}>جرّب كمان مرة</button></>
            : <><span>عندك تعديلات ما انحفظت</span><button type="button" className="admin-primary" onClick={() => setReviewing(true)} data-testid="button-save"><Eye size={16} /> راجع ونزّل عالموقع</button></>}
        </div>
      )}
      {reviewing && menu && (
        <Review
          before={JSON.parse(saved.menu || 'null') as Menu | null}
          after={menu}
          photos={photos}
          offerChanged={offerText !== saved.offer}
          onCancel={() => setReviewing(false)}
          onConfirm={() => { setReviewing(false); void save(); }}
        />
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

// With onEdit (developers) every part of an item can change; without it (the shop's managers) only the on/off switch.
function Items({ menu, photos, onToggle, onEdit, onNew, onMove, switching = {} }: { menu: Menu; photos: Record<string, string>; onToggle: (id: string) => void; onEdit?: (product: Product) => void; onNew?: () => void; onMove?: (category: string, direction: -1 | 1) => void; switching?: Record<string, 'saving' | 'saved' | 'error'> }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('ar');
  const off = menu.products.filter((item) => item.available === false).length;
  return (
    <>
      <div className="admin-row">
        <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على صنف" /></label>
        {onNew && <button type="button" className="admin-primary" onClick={onNew} data-testid="button-new-item"><Plus size={16} /> صنف جديد</button>}
      </div>
      {!onEdit && <p className="admin-hint">سكّر الصنف لما يخلص، وبيطلع عالموقع "مش متوفر" خلال دقيقة تقريباً.</p>}
      {off > 0 && <p className="admin-note">{off === 1 ? 'في صنف واحد موقّف' : `في ${off} أصناف موقّفة`}.</p>}
      {menu.categories.map((category, index) => {
        const items = menu.products.filter((item) => item.category === category && (!q || item.name.toLocaleLowerCase('ar').includes(q)));
        if (!items.length) return null;
        return (
          <section key={category} className="admin-category">
            <div className="admin-category-head">
              <h2>{category}</h2>
              {!q && onMove && <>
                <button type="button" onClick={() => onMove(category, -1)} disabled={index === 0} aria-label="طلّع القسم لفوق"><ArrowUp size={15} /></button>
                <button type="button" onClick={() => onMove(category, 1)} disabled={index === menu.categories.length - 1} aria-label="نزّل القسم لتحت"><ArrowDown size={15} /></button>
              </>}
            </div>
            {items.map((item) => {
              const on = item.available !== false;
              const image = item.image ? photos[item.image] ?? item.image : undefined;
              return (
                <article key={item.id} className={`admin-item${on ? '' : ' is-off'}`} data-testid={`admin-item-${item.id}`}>
                  <button type="button" className="admin-item-main" onClick={() => onEdit?.(item)} disabled={!onEdit}>
                    {image ? <img src={image} alt="" loading="lazy" /> : <span className="admin-noimg"><Camera size={18} /></span>}
                    <span className="admin-item-text">
                      <b>{item.name}</b>
                      <small>{switching[item.id] === 'saving' ? 'عم نحفظ…' : switching[item.id] === 'saved' ? 'انحفظ ✅ بيظهر عالموقع خلال دقيقة' : switching[item.id] === 'error' ? 'ما انحفظ، جرّب كمان مرة' : item.options.map((option) => `${option.label ? `${option.label} ` : ''}${jod(option.priceFils)}`).join(' · ')}</small>
                    </span>
                    {onEdit && <Pencil size={15} className="admin-item-edit" />}
                  </button>
                  <label className="admin-switch" title={on ? 'متوفر' : 'مش متوفر'}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(item.id)} disabled={switching[item.id] === 'saving'} data-testid={`toggle-${item.id}`} />
                    <span />
                    <em>{on ? 'متوفر' : 'مش متوفر'}</em>
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

function ItemForm({ product, categories, photo, onClose, onSave, onDelete, simple = false }: { product: Product; categories: string[]; photo?: string; onClose: () => void; onSave: (product: Product, photo?: string) => void; onDelete?: () => void; simple?: boolean }) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [newCategory, setNewCategory] = useState('');
  const [section, setSection] = useState(product.section ?? '');
  const [nameEn, setNameEn] = useState(product.nameEn ?? '');
  const [options, setOptions] = useState(product.options.map((option) => ({ label: option.label, price: option.priceFils ? String(option.priceFils / 1000) : '' })));
  const popular = !!product.popular;
  const [available, setAvailable] = useState(product.available !== false);
  const [newPhoto, setNewPhoto] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = !product.id;
  const preview = newPhoto ?? photo ?? product.image;
  // What the item will look like on the site, updated as you type.
  const draft = useMemo<Product[]>(() => {
    const next: Product = {
      id: product.id || 'preview',
      name: name.trim() || 'اسم الصنف',
      category: category === '__new' ? newCategory.trim() : category,
      options: options.map((option) => ({ label: option.label.trim(), priceFils: Math.round(Number(option.price.replace(',', '.')) * 1000) || 0 })),
    };
    if (section.trim()) next.section = section.trim();
    if (preview) next.image = preview;
    if (popular) next.popular = true;
    if (!available) next.available = false;
    return [next];
  }, [product.id, name, category, newCategory, section, options, preview, popular, available]);

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
    if (section.trim()) next.section = section.trim();
    if (nameEn.trim()) next.nameEn = nameEn.trim();
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
        {simple && <label className="admin-field">الاسم بالإنجليزي<input value={nameEn} onChange={(event) => setNameEn(event.target.value)} dir="ltr" placeholder="Spanish Latte" data-testid="input-name-en" /></label>}
        <label className="admin-field">القسم
          <select value={category} onChange={(event) => setCategory(event.target.value)} data-testid="select-category">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__new">+ قسم جديد…</option>
          </select>
        </label>
        {category === '__new' && <label className="admin-field">اسم القسم الجديد<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="مثلاً: مشروبات" /></label>}
        {!simple && <label className="admin-field">قسم فرعي (اختياري)<input value={section} onChange={(event) => setSection(event.target.value)} placeholder="مثلاً: معجنات شامية" /></label>}
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
        {!simple && <>

          <div className="admin-preview">
            <h3><Eye size={15} /> هيك رح يطلع عالتلفون</h3>
            <SitePreview products={draft} />
          </div>
        </>}
        {error && <p className="admin-error">{error}</p>}
        <div className="admin-sheet-actions">
          <button type="submit" className="admin-primary" disabled={busy} data-testid="button-item-done">تمام</button>
          {onDelete && <button type="button" className="admin-danger" onClick={() => { if (confirm(`أكيد بدك تحذف "${product.name}" من المنيو؟`)) onDelete(); }} data-testid="button-delete"><Trash2 size={15} /> احذف</button>}
        </div>
        <p className="admin-hint">التعديل بيصير عالموقع لما تكبس {simple ? '"نزّل عالموقع"' : '"راجع ونزّل عالموقع"'} تحت وتأكد.</p>
      </form>
    </div>
  );
}

// The real site draws the products (/?preview), so the preview matches the menu exactly.
function SitePreview({ products }: { products: Product[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(130);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'faei-preview-ready') setReady(true);
      if (event.data?.type === 'faei-preview-height' && event.data.height > 0) setHeight(event.data.height + 6);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ type: 'faei-preview', products }, window.location.origin);
  }, [ready, products]);
  return <iframe ref={frame} src="/?preview" title="معاينة" className="admin-preview-frame" style={{ height }} data-testid="item-preview" />;
}

// Before anything goes live, the developer sees every change and how changed items will look.
function Review({ before, after, photos, offerChanged, onCancel, onConfirm }: { before: Menu | null; after: Menu; photos: Record<string, string>; offerChanged: boolean; onCancel: () => void; onConfirm: () => void }) {
  const old = new Map((before?.products ?? []).map((item) => [item.id, item]));
  const now = new Map(after.products.map((item) => [item.id, item]));
  const added = after.products.filter((item) => !old.has(item.id));
  const removed = (before?.products ?? []).filter((item) => !now.has(item.id));
  const changed = after.products.filter((item) => old.has(item.id) && JSON.stringify(old.get(item.id)) !== JSON.stringify(item));
  const onlySwitch = (item: Product) => { const a = { ...old.get(item.id) }; const b = { ...item }; delete a.available; delete b.available; return JSON.stringify(a) === JSON.stringify(b); };
  const switched = changed.filter(onlySwitch);
  const edited = changed.filter((item) => !onlySwitch(item));
  const reordered = JSON.stringify(before?.categories ?? []) !== JSON.stringify(after.categories.filter((category) => after.products.some((item) => item.category === category)));
  const shown = useMemo(() => [...added, ...edited].map((item) => (item.image && photos[item.image] ? { ...item, image: photos[item.image] } : item)), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="admin-sheet-wrap" role="dialog" aria-modal="true">
      <button type="button" className="admin-sheet-backdrop" onClick={onCancel} aria-label="سكّر" />
      <section className="admin-sheet" data-testid="review">
        <div className="admin-sheet-head">
          <h2>راجع قبل ما ينزل عالموقع</h2>
          <button type="button" onClick={onCancel} aria-label="سكّر"><X size={18} /></button>
        </div>
        <ul className="admin-changes">
          {added.map((item) => <li key={`a${item.id}`} className="is-add">صنف جديد: <b>{item.name}</b></li>)}
          {edited.map((item) => <li key={`e${item.id}`} className="is-edit">تعديل: <b>{item.name}</b></li>)}
          {switched.map((item) => <li key={`s${item.id}`}>{item.available === false ? 'تسكير' : 'فتح'}: <b>{item.name}</b></li>)}
          {removed.map((item) => <li key={`r${item.id}`} className="is-remove">حذف: <b>{item.name}</b></li>)}
          {reordered && <li>ترتيب الأقسام تغيّر</li>}
          {offerChanged && <li>شريط العرض تغيّر</li>}
        </ul>
        {shown.length > 0 && <div className="admin-preview"><h3><Eye size={15} /> هيك رح يطلعوا عالتلفون</h3><SitePreview products={shown} /></div>}
        <div className="admin-sheet-actions">
          <button type="button" className="admin-primary" onClick={onConfirm} data-testid="button-confirm-save">تمام، نزّل عالموقع</button>
          <button type="button" className="admin-link" onClick={onCancel}>رجوع وعدّل</button>
        </div>
      </section>
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
  fulfillment: string; address: string; phone?: string; time: string; payment: string; preorder: boolean;
  discount: number; delivery: number | string; total: number;
  customerSent?: number; cancelledBy?: 'customer' | 'edit'; shop?: 'v8';
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

function ThemeButton() {
  const [theme, toggle] = useTheme();
  return <button type="button" className="admin-ghost admin-theme" onClick={toggle} aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'} title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'} data-testid="button-theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>;
}

// "Install the panel": its own icon on the phone or computer, opening straight on the orders.
// Chrome / Edge / Samsung install directly; iPhone needs Share → Add to Home Screen.
type InstallEvent = Event & { prompt: () => Promise<void> };
function InstallPanel() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [steps, setSteps] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  if (installed) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  function start() {
    if (installEvent) { void installEvent.prompt(); setInstallEvent(null); return; }
    setSteps(true);
  }
  return <>
    <button type="button" className="admin-ghost admin-install" onClick={start} data-testid="button-install-panel" aria-label="نزّل اللوحة كتطبيق"><Download size={14} /> <span>نزّل اللوحة</span></button>
    {steps && (
      <div className="admin-sheet-back" onClick={() => setSteps(false)}>
        <div className="admin-install-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <img src="/admin-icon-192.png" alt="" />
          <h3>نزّل لوحة {BRAND.name} كتطبيق</h3>
          {ios ? <ol>
            <li>افتح اللوحة من <b>سفاري</b></li>
            <li>اكبس زر <b>المشاركة</b></li>
            <li>اختار <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b></li>
          </ol> : <ol>
            <li>افتح اللوحة من <b>كروم</b></li>
            <li>اكبس <b>⋮</b> فوق</li>
            <li>اختار <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b></li>
          </ol>}
          <p>بتطلع أيقونة "لوحة {BRAND.name}" لحالها، غير أيقونة الموقع، وبتفتح عالطلبات مباشرة.</p>
          <button type="button" className="admin-primary" onClick={() => setSteps(false)}>تمام</button>
        </div>
      </div>
    )}
  </>;
}

// A phone notification for new orders while the page is in the background.
function notify(orders: LiveOrder[]) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  const title = orders.length === 1 ? `طلب ${orders[0].shop === 'v8' ? 'V8 ' : ''}جديد #${orders[0].id}` : `${orders.length} طلبات جديدة`;
  const body = orders.flatMap((order) => order.items.map((item) => `${item.quantity}× ${item.name}`)).join('، ').slice(0, 140) || 'افتح اللوحة';
  const options = { body, tag: 'faei-order', renotify: true, icon: '/icon-192.png' } as NotificationOptions;
  navigator.serviceWorker?.getRegistration('/')
    .then((registration) => { if (registration) return registration.showNotification(title, options); new Notification(title, options); })
    .catch(() => { try { new Notification(title, options); } catch { /* not supported here */ } });
}

// ---- Receipt printing (the cashier's thermal printer, 80mm) ----
// The counter PC keeps this page open; with "طباعة تلقائية" on, each new site order prints by itself.
// Chrome started with --kiosk-printing prints without asking; otherwise the print box opens (Enter).
const AUTOPRINT_KEY = 'faei-admin-autoprint';
const PRINTED_KEY = 'faei-admin-printed';
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!));
function receiptHtml(order: LiveOrder): string {
  const time = new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(order.createdAt));
  const rows = order.items.map((item) => `<tr><td class="q">${item.quantity}×</td><td>${escapeHtml(item.name)}</td><td class="p">${(item.price * item.quantity).toFixed(2)}</td></tr>`).join('');
  const line = (label: string, value: string) => (value ? `<p><b>${label}:</b> ${escapeHtml(value)}</p>` : '');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>#${escapeHtml(order.id)}</title><style>
@page { size: 80mm auto; margin: 3mm; }
* { box-sizing: border-box; }
body { margin: 0; width: 74mm; font: 13px/1.45 Tahoma, Arial, sans-serif; color: #000; }
h1 { margin: 0; text-align: center; font-size: 20px; letter-spacing: 1px; direction: ltr; }
.sub { text-align: center; margin: 2px 0 8px; font-size: 12px; }
.id { text-align: center; font-size: 22px; font-weight: 700; border: 2px solid #000; padding: 4px; margin: 6px 0; direction: ltr; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; }
td { padding: 3px 0; vertical-align: top; border-bottom: 1px dashed #000; font-size: 14px; }
td.q { width: 30px; font-weight: 700; } td.p { text-align: left; white-space: nowrap; direction: ltr; }
p { margin: 3px 0; }
.total { display: flex; justify-content: space-between; font-size: 17px; font-weight: 700; border-top: 2px solid #000; margin-top: 6px; padding-top: 6px; }
.note { border: 1px solid #000; padding: 4px 6px; margin: 6px 0; font-weight: 700; }
.foot { text-align: center; margin-top: 10px; font-size: 11px; }
</style></head><body>
<h1>${escapeHtml(BRAND.name)}</h1><div class="sub">طلب من الموقع · ${time}</div>
<div class="id">#${escapeHtml(order.id)}</div>
${order.preorder ? '<p class="note">طلب مسبق</p>' : ''}
<table>${rows}</table>
${order.extras ? `<p class="note">ملاحظات: ${escapeHtml(order.extras)}</p>` : ''}
${line('الاستلام', `${order.fulfillment}${order.address ? ` · ${order.address}` : ''}`)}
${line('الوقت', order.time)}
${line('الدفع', order.payment)}
${line('التلفون', order.phone ?? '')}
${order.discount ? line('خصم', order.discount.toFixed(2)) : ''}
<div class="total"><span>المجموع</span><span dir="ltr">${order.total.toFixed(2)} JOD</span></div>
<div class="foot">${escapeHtml(BRAND.slogan.start + BRAND.slogan.highlight)}</div>
</body></html>`;
}
let printQueue: Promise<void> = Promise.resolve();
function printOrder(order: LiveOrder): Promise<void> {
  printQueue = printQueue.then(() => new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const done = () => { window.setTimeout(() => { frame.remove(); resolve(); }, 800); };
    frame.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* printing blocked */ }
      done();
    };
    frame.srcdoc = receiptHtml(order);
  }));
  return printQueue;
}
function markPrinted(ref: string): boolean {
  let list: string[] = [];
  try { list = JSON.parse(read(PRINTED_KEY) || '[]') as string[]; } catch { list = []; }
  if (list.includes(ref)) return false;
  write(PRINTED_KEY, JSON.stringify([ref, ...list].slice(0, 300)));
  return true;
}

// Checks for orders every 3 seconds while the page is on screen (15 in the background) and rings for new ones.
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
          notify(added);
          if (read(AUTOPRINT_KEY) === '1') added.filter((order) => markPrinted(order.ref)).forEach((order) => void printOrder(order));
          setFresh((current) => new Set([...current, ...added.map((order) => order.ref)]));
        }
      }
      known.current = refs;
    } catch { setError('ما في اتصال، عم نحاول كمان مرة…'); }
  }
  useEffect(() => {
    void fetchOrders();
    let last = 0;
    const timer = window.setInterval(() => {
      const gap = document.visibilityState === 'visible' ? 3000 : 15000;
      if (Date.now() - last < gap - 200) return;
      last = Date.now();
      void poll();
    }, 1000);
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
  useEffect(() => { document.title = waiting ? `(${waiting}) طلب جديد · ${BRAND.name}` : `لوحة ${BRAND.name}`; }, [waiting]);

  async function setStatus(ref: string, status: string) {
    setOrders((current) => current && current.map((order) => (order.ref === ref ? { ...order, status } : order)));
    setFresh((current) => { const next = new Set(current); next.delete(ref); return next; });
    try {
      const response = await fetch('/api/orders', { method: 'PATCH', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, status }) });
      if (response.status === 401) onLogout();
    } catch { /* the next poll shows the real state */ }
    void fetchOrders();
  }
  function enableSound() {
    soundRef.current = true; setSoundOn(true); ring();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
  }
  return { orders, error, waiting, soundOn, enableSound, setStatus, fresh };
}

const ago = (time: number) => {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  return minutes < 1 ? 'هسه' : minutes < 60 ? `قبل ${minutes} د` : new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', hour: 'numeric', minute: '2-digit' }).format(new Date(time));
};
const ACTIVE = ['جديد', 'عم يتحضّر', 'جاهز'];

// FAEI's own orders and V8's (the coffee house inside) are kept on separate lists.
type Shop = 'faei' | 'v8';
const shopOf = (order: LiveOrder): Shop => (order.shop === 'v8' ? 'v8' : 'faei');
function ShopSwitch({ shop, onChange, counts }: { shop: Shop; onChange: (shop: Shop) => void; counts?: Record<Shop, number> }) {
  return (
    <div className="admin-shops" role="tablist">
      {(['faei', 'v8'] as const).map((name) => (
        <button key={name} type="button" role="tab" aria-selected={shop === name} className={shop === name ? 'is-active' : ''} onClick={() => onChange(name)} data-testid={`shop-${name}`}>
          {name === 'faei' ? BRAND.nameAr : 'V8'}{counts && counts[name] > 0 && <i className="admin-badge">{counts[name]}</i>}
        </button>
      ))}
    </div>
  );
}

// Staff see the day's orders but not how much money came in.
function Orders({ live, showSales, showV8 }: { live: Live; showSales: boolean; showV8: boolean }) {
  const [, tick] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [shop, setShop] = useState<Shop>('faei');
  const [view, setViewState] = useState<'list' | 'board'>(() => (read(VIEW_KEY) === 'board' ? 'board' : 'list'));
  const setView = (next: 'list' | 'board') => { write(VIEW_KEY, next); setViewState(next); };
  const [autoPrint, setAutoPrintState] = useState(() => read(AUTOPRINT_KEY) === '1');
  const setAutoPrint = (on: boolean) => {
    write(AUTOPRINT_KEY, on ? '1' : '');
    setAutoPrintState(on);
    // Orders already on screen count as printed, so switching on doesn't print the whole day.
    if (on) (live.orders ?? []).forEach((order) => markPrinted(order.ref));
  };
  useEffect(() => { const timer = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
  if (live.orders === null) return <>{live.error ? <p className="admin-error">{live.error}</p> : <p className="admin-loading">لحظة، عم نجيب الطلبات…</p>}</>;
  const all = live.orders;
  const openIn = (name: Shop) => all.filter((order) => shopOf(order) === name && ACTIVE.includes(order.status)).length;
  // Only the developer gets both lists; everyone else already gets just their shop's orders.
  const orders = showV8 ? all.filter((order) => shopOf(order) === shop) : all;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date());
  const isToday = (order: LiveOrder) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(new Date(order.createdAt)) === today;
  const active = orders.filter((order) => ACTIVE.includes(order.status)).sort((a, b) => b.createdAt - a.createdAt);
  const done = orders.filter((order) => !ACTIVE.includes(order.status) && isToday(order));
  const todays = orders.filter((order) => isToday(order) && order.status !== 'ملغي');
  return (
    <>
      {!live.soundOn && <button type="button" className="admin-sound" onClick={live.enableSound} data-testid="button-sound"><Bell size={18} /> اكبس هون عشان يرنّ ويطلعلك إشعار لما يوصل طلب جديد</button>}
      {live.error && <p className="admin-error">{live.error}</p>}
      {showV8 && <ShopSwitch shop={shop} onChange={setShop} counts={{ faei: openIn('faei'), v8: openIn('v8') }} />}
      <div className="admin-stats">
        <div><small>طلبات اليوم</small><b>{todays.length}</b><em>{active.length} شغّالين هسه</em></div>
        {showSales && <div><small>مبيعات اليوم</small><b>{todays.reduce((sum, order) => sum + order.total, 0).toFixed(2)} د.أ</b><em>بدون الملغي</em></div>}
      </div>
      <div className="admin-view" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} data-testid="view-list"><List size={15} /> قائمة</button>
        <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'is-active' : ''} onClick={() => setView('board')} data-testid="view-board"><Columns3 size={15} /> شاشة المطبخ</button>
        <button type="button" className={`admin-autoprint${autoPrint ? ' is-on' : ''}`} onClick={() => setAutoPrint(!autoPrint)} aria-pressed={autoPrint} title="كل طلب جديد بينطبع لحاله على طابعة هالجهاز" data-testid="button-autoprint"><Printer size={15} /> طباعة تلقائية: {autoPrint ? 'شغّالة' : 'طافية'}</button>
        {view === 'board' && document.fullscreenEnabled && <button type="button" className="admin-view-full" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }} aria-label="ملء الشاشة"><Maximize size={15} /></button>}
      </div>
      {view === 'board'
        ? <Board orders={active} fresh={live.fresh} onStatus={(ref, status) => void live.setStatus(ref, status)} />
        : <>
          {!active.length && <p className="admin-empty">ما في طلبات مفتوحة هسه. أول ما يوصل طلب بيطلع هون. 👌</p>}
          <div className="admin-orders-grid">
            {active.map((order) => <OrderCard key={order.ref} order={order} fresh={live.fresh.has(order.ref)} onStatus={(status) => void live.setStatus(order.ref, status)} />)}
          </div>
        </>}
      {done.length > 0 && (
        <section className="admin-card">
          <button type="button" className="admin-link" onClick={() => setShowDone(!showDone)}>{showDone ? 'خبّي' : 'شوف'} اللي خلصوا اليوم ({done.length})</button>
          {showDone && <div className="admin-orders-grid is-done">{done.map((order) => <OrderCard key={order.ref} order={order} fresh={false} onStatus={(status) => void live.setStatus(order.ref, status)} />)}</div>}
        </section>
      )}
    </>
  );
}

// Kitchen screen: three columns (new, preparing, ready). A card moves with its button, or by dragging
// it by its top bar into another column (works with a finger on a tablet and with a mouse).
const VIEW_KEY = 'faei-admin-view';
const COLUMNS = [
  { status: 'جديد', title: 'جديد', next: 'عم يتحضّر', action: 'بلّش تحضير' },
  { status: 'عم يتحضّر', title: 'عم يتحضّر', next: 'جاهز', action: 'جاهز ✅' },
  { status: 'جاهز', title: 'جاهز', next: 'تم', action: 'استلمه 👍' },
];
type Drag = { ref: string; from: string; x: number; y: number; dx: number; dy: number; width: number; moved: boolean; over: string | null };
function Board({ orders, fresh, onStatus }: { orders: LiveOrder[]; fresh: Set<string>; onStatus: (ref: string, status: string) => void }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const columnAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-column]') as HTMLElement | null)?.dataset.column ?? null;
  function down(event: React.PointerEvent<HTMLElement>, order: LiveOrder) {
    if (event.button !== 0) return;
    const card = (event.currentTarget.closest('.admin-kcard') as HTMLElement).getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ ref: order.ref, from: order.status, x: event.clientX, y: event.clientY, dx: event.clientX - card.left, dy: event.clientY - card.top, width: card.width, moved: false, over: null });
  }
  function move(event: React.PointerEvent<HTMLElement>) {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved, over: moved ? columnAt(event.clientX, event.clientY) : null });
  }
  function up() {
    if (drag?.moved && drag.over && drag.over !== drag.from) onStatus(drag.ref, drag.over);
    setDrag(null);
  }
  return (
    <div className="admin-board" data-testid="kitchen-board">
      {COLUMNS.map((column) => {
        const list = orders.filter((order) => order.status === column.status).sort((a, b) => a.createdAt - b.createdAt);
        return (
          <section key={column.status} className={`admin-col is-${COLUMNS.indexOf(column)}${drag?.moved && drag.over === column.status && drag.from !== column.status ? ' is-over' : ''}`} data-column={column.status}>
            <h2>{column.title} <i>{list.length}</i></h2>
            {!list.length && <p className="admin-col-empty">{column.status === 'جديد' ? 'ما في طلبات جديدة' : 'فاضي'}</p>}
            {list.map((order) => {
              const dragging = drag?.ref === order.ref && drag.moved;
              const late = order.status !== 'جاهز' && Date.now() - order.createdAt > 20 * 60_000;
              return (
                <article key={order.ref} className={`admin-kcard${fresh.has(order.ref) ? ' is-fresh' : ''}${late ? ' is-late' : ''}${dragging ? ' is-dragging' : ''}`} data-testid={`kcard-${order.ref}`}
                  style={dragging ? { position: 'fixed', zIndex: 80, width: drag.width, left: drag.x - drag.dx, top: drag.y - drag.dy } : undefined}>
                  <header onPointerDown={(event) => down(event, order)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
                    <GripVertical size={16} aria-hidden="true" />
                    <b dir="ltr">#{order.id}</b>
                    {order.shop === 'v8' && <span className="admin-order-shop">V8</span>}
                    <span className="admin-order-time">{ago(order.createdAt)}</span>
                  </header>
                  <ul>{order.items.map((item, index) => <li key={index}><b>{item.quantity}×</b> {item.name}</li>)}</ul>
                  {order.extras && <p className="admin-kcard-extras">{order.extras}</p>}
                  <p className="admin-kcard-meta">{order.fulfillment}{order.address ? ` · ${order.address}` : ''}{order.time && order.time !== 'بأسرع وقت' ? ` · ${order.time}` : ''}{order.payment === 'كليك' ? ' · كليك' : ''}</p>
                  <button type="button" className={column.next === 'جاهز' ? 'admin-green' : 'admin-primary'} onClick={() => onStatus(order.ref, column.next)} data-testid={`kcard-next-${order.ref}`}>{column.action}</button>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function OrderCard({ order, fresh, onStatus }: { order: LiveOrder; fresh: boolean; onStatus: (status: string) => void }) {
  const late = order.status !== 'جاهز' && ACTIVE.includes(order.status) && Date.now() - order.createdAt > 20 * 60_000;
  return (
    <article className={`admin-order is-${['جديد', 'عم يتحضّر', 'جاهز', 'تم', 'ملغي'].indexOf(order.status)}${fresh ? ' is-fresh' : ''}${late ? ' is-late' : ''}`} data-testid={`order-${order.ref}`}>
      <header>
        <b dir="ltr">#{order.id}</b>
        {order.shop === 'v8' && <span className="admin-order-shop">V8</span>}
        <span className="admin-order-status">{order.status}</span>
        <span className="admin-order-time">{ago(order.createdAt)}</span>
      </header>
      {order.preorder && <p className="admin-order-flag">طلب مسبق (انبعت والمحل مسكّر)</p>}
      {order.status === 'ملغي' && order.cancelledBy && <p className="admin-order-flag">{order.cancelledBy === 'edit' ? 'الزبون رجع عدّله (بيوصل الطلب الجديد لحاله)' : 'الزبون لغاه'}</p>}
      <ul>
        {order.items.map((item, index) => <li key={index}><b>{item.quantity}×</b> {item.name}</li>)}
        {order.extras && <li className="admin-order-extras">{order.shop === 'v8' ? 'ملاحظات' : 'من الكافتيريا'}: {order.extras}</li>}
      </ul>
      <dl>
        {order.phone && <div><dt>التلفون</dt><dd><a href={`https://wa.me/962${order.phone.replace(/^0/, '')}?text=${encodeURIComponent(`مرحبا، بخصوص طلبك رقم ${order.id} من ${order.shop === 'v8' ? 'V8' : BRAND.name}`)}`} target="_blank" rel="noreferrer" className="admin-phone" dir="ltr" data-testid="link-customer-whatsapp"><MessageCircle size={13} /> {order.phone} · واتساب</a></dd></div>}
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
        <button type="button" className="admin-print" onClick={() => { markPrinted(order.ref); void printOrder(order); }} aria-label={`اطبع الطلب ${order.id}`} title="اطبع" data-testid="button-print"><Printer size={15} /></button>
      </footer>
    </article>
  );
}

// Rush hours (orders per hour and per weekday, last 14 days) and "sleeping" items: on the menu and
// switched on, but nobody ordered them from the site in the last 7 days.
const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const hourText = (hour: number) => `${hour > 12 ? hour - 12 : hour}${hour < 12 ? 'ص' : 'م'}`;
function rushAndSleepers(valid: LiveOrder[], products: Product[], weekCounts: Map<string, number>, weekOrders: number) {
  const since = Date.now() - 14 * 86_400_000;
  const parts = (time: number) => {
    const values = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time));
    const get = (type: string) => values.find((part) => part.type === type)?.value ?? '';
    return { hour: Number(get('hour')), day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
  };
  const byHour = new Map<number, number>();
  const byDay = new Map<number, number>();
  let hoursCount = 0;
  for (const order of valid) {
    if (order.createdAt < since) continue;
    const { hour, day } = parts(order.createdAt);
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    hoursCount += 1;
  }
  // Opening hours 7:30–17:00, plus any hour that actually had orders.
  const first = Math.min(7, ...byHour.keys());
  const last = Math.max(16, ...byHour.keys());
  const hours: [number, number][] = [];
  for (let hour = first; hour <= last; hour += 1) hours.push([hour, byHour.get(hour) ?? 0]);
  const best = hours.reduce((top, entry) => (entry[1] > top[1] ? entry : top), [-1, 0] as [number, number]);
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((day) => day <= 4 || byDay.has(day)).map((day) => [WEEKDAYS[day], byDay.get(day) ?? 0] as [string, number]);
  const sleepers = products.filter((product) => product.available !== false && !weekCounts.has(product.name));
  return { hours, hoursCount, topHour: best[1] > 0 ? best[0] : null, weekdays, sleepers, fewOrders: weekOrders < 30 };
}

function Sales({ session, showV8, products }: { session: string; showV8: boolean; products: Product[] }) {
  const [all, setOrders] = useState<LiveOrder[] | null>(null);
  const [shop, setShop] = useState<Shop>('faei');
  const [showAllSleepers, setShowAllSleepers] = useState(false);
  const orders = useMemo(() => all && (showV8 ? all.filter((order) => shopOf(order) === shop) : all), [all, shop, showV8]);
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
      ...rushAndSleepers(valid, shop === 'v8' ? [] : products, counts, week.length),
    };
  }, [orders, products, shop]);
  if (orders === null) return <p className="admin-loading">لحظة…</p>;
  const most = Math.max(1, ...stats.days.map(([, total]) => total));
  return (
    <>
      {showV8 && <ShopSwitch shop={shop} onChange={setShop} />}
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
      {stats.hoursCount > 0 && (
        <section className="admin-card" data-testid="rush-hours">
          <h2>ساعات الضغط</h2>
          <p className="admin-hint">كم طلب بيوصل بكل ساعة (آخر 14 يوم). {stats.topHour !== null && <>أكثر ساعة ضغط: <b>{hourText(stats.topHour)} – {hourText(stats.topHour + 1)}</b>.</>}</p>
          <div className="admin-hours">{stats.hours.map(([hour, count]) => <div key={hour} className={hour === stats.topHour ? 'is-top' : ''}><b>{count || ''}</b><i style={{ height: `${(count / Math.max(1, ...stats.hours.map(([, c]) => c))) * 100}%` }} /><span>{hourText(hour)}</span></div>)}</div>
          {stats.weekdays.some(([, count]) => count > 0) && <>
            <h3>حسب اليوم</h3>
            <ul className="admin-days">{stats.weekdays.map(([day, count]) => <li key={day}><span>{day}</span><i style={{ width: `${(count / Math.max(1, ...stats.weekdays.map(([, c]) => c))) * 100}%` }} /><b>{count}</b></li>)}</ul>
          </>}
        </section>
      )}
      {stats.sleepers.length > 0 && (
        <section className="admin-card admin-sleepers" data-testid="sleeping-items">
          <h2>أصناف نايمة 😴</h2>
          <p className="admin-hint">{stats.sleepers.length} صنف ما انطلبوا من الموقع ولا مرة آخر 7 أيام. جرّب عليهم عرض، أو صورة أحلى، أو شيلهم من المنيو.{stats.fewOrders ? ' (لسا الطلبات قليلة، فالقائمة رح تصير أدق مع الوقت.)' : ''}</p>
          <ul className="admin-chips-list">{stats.sleepers.slice(0, showAllSleepers ? undefined : 12).map((product) => <li key={product.id}>{product.name}<small>{product.category}</small></li>)}</ul>
          {stats.sleepers.length > 12 && <button type="button" className="admin-link" onClick={() => setShowAllSleepers(!showAllSleepers)}>{showAllSleepers ? 'خبّي' : `شوف الكل (${stats.sleepers.length})`}</button>}
        </section>
      )}
      <p className="admin-hint">المبيعات من طلبات الموقع (بدون الملغي). كل طلب كمان بينسجل بشيت الطلبات زي قبل.</p>
    </>
  );
}

// ---- Customers (by phone) and giveaways ----

type Customer = { phone: string; orders: number; total: number; first: number; last: number; lastOrder: string; items?: Record<string, number> };
type CustomerSort = 'orders' | 'total' | 'new' | 'away';
const whatsappTo = (phone: string, text: string) => `https://wa.me/962${phone.replace(/^0/, '')}?text=${encodeURIComponent(text)}`;
const dateText = (time: number) => new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric' }).format(new Date(time));

function Customers({ session }: { session: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [minOrders, setMinOrders] = useState(1);
  const [days, setDays] = useState(0);
  const [winner, setWinner] = useState<Customer | null>(null);
  const [rolling, setRolling] = useState('');
  const [sort, setSort] = useState<CustomerSort>('orders');
  const [open, setOpen] = useState('');
  useEffect(() => {
    fetch('/api/customers', { cache: 'no-store', headers: { Authorization: `Bearer ${session}` } })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data: { customers: Customer[] }) => setCustomers(data.customers.sort((a, b) => b.orders - a.orders || b.last - a.last)))
      .catch(() => setError('ما قدرنا نجيب الزباين. جرّب كمان مرة.'));
  }, [session]);
  const eligible = useMemo(() => (customers ?? []).filter((customer) => customer.orders >= minOrders && (!days || Date.now() - customer.last < days * 86_400_000)), [customers, minOrders, days]);
  if (error) return <p className="admin-error">{error}</p>;
  if (!customers) return <p className="admin-loading">لحظة…</p>;
  // A short shuffle on screen, then a fair random pick.
  function draw() {
    if (!eligible.length) return;
    setWinner(null);
    let spins = 0;
    const timer = window.setInterval(() => {
      setRolling(eligible[Math.floor(Math.random() * eligible.length)].phone);
      if (++spins < 18) return;
      window.clearInterval(timer);
      const pick = new Uint32Array(1);
      crypto.getRandomValues(pick);
      setWinner(eligible[pick[0] % eligible.length]);
      setRolling('');
    }, 90);
  }
  function exportCsv() {
    const favourite = (customer: Customer) => Object.entries(customer.items ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const rows = [['phone', 'orders', 'total_jod', 'first_order', 'last_order', 'favourite'], ...customers!.map((customer) => [customer.phone, String(customer.orders), customer.total.toFixed(2), new Date(customer.first).toISOString().slice(0, 10), new Date(customer.last).toISOString().slice(0, 10), `"${favourite(customer).replace(/"/g, '')}"`])];
    const blob = new Blob([`\ufeff${rows.map((row) => row.join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `faei-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  const q = query.replace(/\D/g, '');
  const DAY = 86_400_000;
  // "Away": ordered at least twice but not in the last two weeks, worth a message.
  const sorted = sort === 'away'
    ? customers.filter((customer) => customer.orders >= 2 && Date.now() - customer.last > 14 * DAY).sort((a, b) => b.orders - a.orders)
    : [...customers].sort((a, b) => (sort === 'total' ? b.total - a.total : sort === 'new' ? b.first - a.first : b.orders - a.orders || b.last - a.last));
  const shown = q ? sorted.filter((customer) => customer.phone.includes(q)) : sorted;
  const regulars = customers.filter((customer) => customer.orders > 1).length;
  const spent = customers.reduce((sum, customer) => sum + customer.total, 0);
  return (
    <>
      <div className="admin-stats">
        <div><small>عدد الزباين</small><b>{customers.length}</b><em>من طلبات الموقع</em></div>
        <div><small>رجعوا طلبوا</small><b>{regulars}</b><em>{customers.length ? Math.round((regulars / customers.length) * 100) : 0}% من الزباين</em></div>
        <div><small>معدّل الطلب</small><b>{(spent / Math.max(1, customers.reduce((sum, customer) => sum + customer.orders, 0))).toFixed(2)} د.أ</b><em>للطلب الواحد</em></div>
        <div><small>جداد آخر أسبوع</small><b>{customers.filter((customer) => Date.now() - customer.first < 7 * DAY).length}</b><em>أول طلب إلهم</em></div>
      </div>
      <section className="admin-card admin-giveaway">
        <h2><Gift size={18} /> سحب على جائزة</h2>
        <div className="admin-row">
          <label className="admin-field">مين بيدخل السحب؟
            <select className="admin-input" value={minOrders} onChange={(event) => setMinOrders(Number(event.target.value))} data-testid="giveaway-min">
              <option value={1}>كل اللي طلبوا</option>
              <option value={2}>طلبوا مرتين وأكثر</option>
              <option value={3}>طلبوا 3 مرات وأكثر</option>
              <option value={5}>طلبوا 5 مرات وأكثر</option>
            </select>
          </label>
          <label className="admin-field">آخر طلب
            <select className="admin-input" value={days} onChange={(event) => setDays(Number(event.target.value))} data-testid="giveaway-days">
              <option value={0}>أي وقت</option>
              <option value={7}>آخر أسبوع</option>
              <option value={30}>آخر شهر</option>
            </select>
          </label>
        </div>
        <button type="button" className="admin-primary" onClick={draw} disabled={!eligible.length || !!rolling} data-testid="button-draw"><Gift size={16} /> اختار فائز ({eligible.length} بالسحب)</button>
        {rolling && <p className="admin-winner is-rolling" dir="ltr">{rolling}</p>}
        {winner && (
          <div className="admin-winner" data-testid="winner">
            <small>الفائز 🎉</small>
            <b dir="ltr">{winner.phone}</b>
            <span>{winner.orders} {winner.orders === 1 ? "طلب" : "طلبات"} · آخر طلب {dateText(winner.last)}</span>
            <a className="admin-primary" href={whatsappTo(winner.phone, `مبروك! 🎉 ربحت بسحب ${BRAND.nameAr}. تعال استلم جائزتك من الكافتيريا 🙌`)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> بشّره عالواتساب</a>
          </div>
        )}
      </section>
      <section className="admin-card">
        <div className="admin-chips">
          {([['orders', 'الأكثر طلباً'], ['total', 'الأكثر دفعاً'], ['new', 'الأجدد'], ['away', 'غابوا عنا']] as [CustomerSort, string][]).map(([key, label]) => (
            <button key={key} type="button" className={sort === key ? 'is-active' : ''} onClick={() => setSort(key)} data-testid={`sort-${key}`}>{label}</button>
          ))}
        </div>
        {sort === 'away' && <p className="admin-hint">زباين طلبوا مرتين أو أكثر وما طلبوا من أسبوعين. ابعثلهم رسالة أو عرض يرجعهم.</p>}
        <div className="admin-row">
          <label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="دوّر على رقم" inputMode="tel" dir="ltr" /></label>
          <button type="button" className="admin-ghost-dark" onClick={exportCsv}><Download size={15} /> نزّلهم Excel</button>
        </div>
        {!shown.length && <p className="admin-empty">لسا ما في زباين. أول ما حدا يطلب من الموقع برقمه بيطلع هون.</p>}
        <ul className="admin-customers">
          {shown.slice(0, 300).map((customer) => (
            <li key={customer.phone} className={open === customer.phone ? 'is-open' : ''}>
              <button type="button" className="admin-customer-row" onClick={() => setOpen(open === customer.phone ? '' : customer.phone)} data-testid={`customer-${customer.phone}`}>
                <b dir="ltr">{customer.phone}</b>
                <span><b>{customer.orders}</b> طلب</span>
                <span>{customer.total.toFixed(2)} د.أ</span>
                <span>{dateText(customer.last)}</span>
              </button>
              {open === customer.phone && (
                <div className="admin-customer-more">
                  <p>أول طلب: {dateText(customer.first)} · آخر طلب: {dateText(customer.last)}{customer.lastOrder ? <> (رقم <span dir="ltr">{customer.lastOrder}</span>)</> : null} · معدّل طلبه: {(customer.total / Math.max(1, customer.orders)).toFixed(2)} د.أ</p>
                  {customer.items && Object.keys(customer.items).length > 0 && (
                    <p><b>بيحب:</b> {Object.entries(customer.items).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `${name} (${count})`).join('، ')}</p>
                  )}
                  <a className="admin-primary" href={whatsappTo(customer.phone, `مرحبا من ${BRAND.name} 👋`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> احكي معه عالواتساب</a>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Accounts({ me }: { me: Session }) {
  const [users, setUsers] = useState<{ username: string; role: string }[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [myPassword, setMyPassword] = useState('');
  const [message, setMessage] = useState('');
  const isDev = me.role === 'dev';
  async function loadUsers() {
    if (!isDev) return;
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
      {isDev && (
        <section className="admin-card">
          <h2>الحسابات</h2>
          <p className="admin-hint"><b>موظف</b>: طلبات {BRAND.nameAr} بس. <b>موظف V8</b>: طلبات V8 بس. <b>إدارة</b>: الطلبات، وتسكير وفتح الأصناف، والمبيعات. <b>مطوّر</b>: كل إشي، ومعه تعديل وإضافة وحذف الأصناف والعرض والحسابات.</p>
          <ul className="admin-users">
            {users.map((user) => (
              <li key={user.username}>
                <b dir="ltr">{user.username}</b><span>{ROLE_NAMES[user.role as Role] ?? user.role}</span>
                {user.username !== me.username && <button type="button" className="admin-link" onClick={async () => { if (confirm(`حذف ${user.username}؟`)) { await adminCall({ action: 'remove-user', username: user.username }, me.session); void loadUsers(); } }}>احذف</button>}
              </li>
            ))}
          </ul>
          <form className="admin-stack" onSubmit={addUser}>
            <h3><UserPlus size={16} /> حساب جديد</h3>
            <input className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="اليوزر (إنجليزي)" dir="ltr" autoCapitalize="none" data-testid="input-new-user" />
            <input className="admin-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="الباسوورد" dir="ltr" data-testid="input-new-password" />
            <select className="admin-input" value={role} onChange={(event) => setRole(event.target.value as Role)} data-testid="select-role">
              <option value="staff">موظف (الطلبات بس)</option>
              <option value="v8">موظف V8 (طلبات V8 بس)</option>
              <option value="admin">إدارة (الطلبات، تسكير الأصناف، المبيعات)</option>
              <option value="dev">مطوّر (كل إشي)</option>
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

// ---- V8 Coffee To Go menu (developers only) ----

type V8Menu = Menu & { launchAt?: string; whatsapp?: string };

function V8Editor({ session, onLogout }: { session: string; onLogout: () => void }) {
  const [menu, setMenu] = useState<V8Menu | null>(null);
  const [saved, setSaved] = useState({ text: '', sha: '' });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  async function load() {
    setError('');
    try {
      const file = await readJson<V8Menu>(session, V8_PATH);
      setMenu(file.data);
      setSaved({ text: stringify(file.data), sha: file.sha });
      setPhotos({});
    } catch (problem) {
      if (problem instanceof GitHubError && problem.status === 401) onLogout();
      else setError('ما قدرنا نجيب منيو V8. تأكد من النت وجرّب كمان مرة.');
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!menu && stringify(menu) !== saved.text;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!menu) return error ? <><p className="admin-error">{error}</p><button type="button" className="admin-primary" onClick={() => void load()}>جرّب كمان مرة</button></> : <p className="admin-loading">لحظة، عم نجيب منيو V8…</p>;

  const update = (patch: (current: V8Menu) => V8Menu) => { setMenu((current) => current && patch(current)); setState('idle'); };
  function upsert(product: Product) {
    update((current) => {
      const exists = current.products.some((item) => item.id === product.id);
      const categories = current.categories.includes(product.category) ? current.categories : [...current.categories, product.category];
      return { ...current, categories, products: exists ? current.products.map((item) => (item.id === product.id ? product : item)) : [...current.products, product] };
    });
  }
  function toggle(id: string) {
    update((current) => ({ ...current, products: current.products.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item };
      if (item.available === false) delete next.available; else next.available = false;
      return next;
    }) }));
  }
  function move(category: string, direction: -1 | 1) {
    update((current) => {
      const list = [...current.categories];
      const from = list.indexOf(category);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return current;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...current, categories: list };
    });
  }
  async function save() {
    if (!menu || state === 'saving') return;
    if (!confirm('أكيد بدك تنزّل تعديلات V8 عالموقع؟')) return;
    setState('saving');
    try {
      if (await fileSha(session, V8_PATH) !== saved.sha) { setState('error'); setError('في حدا ثاني عدّل منيو V8 من جهاز ثاني. حدّث الصفحة وأعد تعديلك.'); return; }
      const clean: V8Menu = { ...menu, categories: menu.categories.filter((category) => menu.products.some((item) => item.category === category)) };
      const text = stringify(clean);
      const files: NewFile[] = [{ path: V8_PATH, text }];
      Object.entries(photos).forEach(([path, base64]) => {
        if (clean.products.some((item) => item.image === path)) files.push({ path: `public${path}`, base64: base64.split(',')[1] });
      });
      await commitFiles(session, files, 'تعديل منيو V8 من لوحة الإدارة');
      setMenu(clean);
      setSaved({ text, sha: await fileSha(session, V8_PATH) });
      setPhotos({});
      setState('saved');
    } catch (problem) {
      if (problem instanceof GitHubError && problem.status === 401) { onLogout(); return; }
      setState('error');
      setError('ما انحفظ. تأكد من النت وجرّب كمان مرة.');
    }
  }
  const launchAt = menu.launchAt ? Date.parse(menu.launchAt) : 0;
  return (
    <>
      <section className="admin-card admin-v8">
        <h2><img src="/images/v8/v8-logo.webp" alt="" /> V8 Coffee To Go</h2>
        <p className="admin-hint">{launchAt && Date.now() < launchAt
          ? `مخفي عن الزباين لحد ${new Intl.DateTimeFormat('ar-JO', { timeZone: 'Asia/Amman', weekday: 'long', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(launchAt))}. إنت بتشوفه إذا فتحت الموقع مرة وحدة من هالرابط: ${BRAND.siteUrl.replace(/^https?:\/\//, '')}/?v8`
          : 'ظاهر عالموقع للكل.'}</p>
        <label className="admin-field">رقم واتساب V8 (طلباتهم بتروح عليه)
          <input value={menu.whatsapp ?? ''} onChange={(event) => update((current) => ({ ...current, whatsapp: event.target.value.trim() }))} inputMode="tel" dir="ltr" placeholder="07XXXXXXXX" data-testid="v8-whatsapp" />
        </label>
        {!menu.whatsapp && <p className="admin-note">لحد ما تحط رقم، طلبات V8 بتروح على واتساب {BRAND.nameAr}.</p>}
      </section>
      <Items menu={menu} photos={photos} onToggle={toggle} onEdit={setEditing} onNew={() => setEditing({ id: '', name: '', category: menu.categories[0] ?? '', options: [{ label: '', priceFils: 0 }] })} onMove={move} />
      {(dirty || state !== 'idle') && (
        <div className={`admin-savebar is-${state === 'saved' ? 'live-wait' : state}`} data-testid="v8-savebar">
          {state === 'saving' ? <span>عم نحفظ…</span>
            : state === 'saved' && !dirty ? <><span>انحفظ ✅ بيظهر عالموقع خلال دقيقة تقريباً</span><button type="button" onClick={() => setState('idle')} aria-label="سكّر"><X size={16} /></button></>
            : state === 'error' ? <><span>{error}</span><button type="button" className="admin-primary" onClick={() => void save()}>جرّب كمان مرة</button></>
            : <><span>عندك تعديلات على V8 ما انحفظت</span><button type="button" className="admin-primary" onClick={() => void save()} data-testid="v8-save">نزّل عالموقع</button></>}
        </div>
      )}
      {editing && (
        <ItemForm
          simple
          product={editing}
          categories={menu.categories}
          photo={editing.image ? photos[editing.image] : undefined}
          onClose={() => setEditing(null)}
          onSave={(product, photo) => {
            const next = product.id.startsWith('item-') ? { ...product, id: `v8-${product.id}` } : product;
            if (photo && next.image) {
              const image = next.image.replace(`/images/menu/${product.id}`, `/images/v8/${next.id}`);
              next.image = image;
              setPhotos((current) => ({ ...current, [image]: photo }));
            }
            upsert(next);
            setEditing(null);
          }}
          onDelete={editing.id && menu.products.some((item) => item.id === editing.id) ? () => { update((current) => ({ ...current, products: current.products.filter((item) => item.id !== editing.id) })); setEditing(null); } : undefined}
        />
      )}
    </>
  );
}

// Developer only: the photos in the site's carousel (public/gallery.json). Add, replace, reorder,
// caption or remove them; one save commits the list and any new photos together.
const GALLERY_PATH = 'public/gallery.json';
type GalleryPhoto = { src: string; alt: string; caption: string; position?: string; size?: 'big' | 'tall' };
type Gallery = { title: string; photos: GalleryPhoto[] };

// Keeps the photo's own shape, longest side at most 1400px, as webp.
async function prepareGalleryPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function GalleryEditor({ session, onLogout }: { session: string; onLogout: () => void }) {
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [saved, setSaved] = useState({ text: '', sha: '' });
  // New photos waiting to be saved: site path → data URL.
  const [uploads, setUploads] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const pick = useRef<{ index: number | null }>({ index: null });
  const fileRef = useRef<HTMLInputElement>(null);
  async function load() {
    setError('');
    try {
      const file = await readJson<Gallery>(session, GALLERY_PATH);
      setGallery(file.data);
      setSaved({ text: stringify(file.data), sha: file.sha });
      setUploads({});
    } catch (problem) {
      if (problem instanceof GitHubError && problem.status === 401) onLogout();
      else setError('ما قدرنا نجيب الصور. تأكد من النت وجرّب كمان مرة.');
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!gallery && stringify(gallery) !== saved.text;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!gallery) return error ? <><p className="admin-error">{error}</p><button type="button" className="admin-primary" onClick={() => void load()}>جرّب كمان مرة</button></> : <p className="admin-loading">لحظة، عم نجيب الصور…</p>;

  const update = (patch: (current: Gallery) => Gallery) => { setGallery((current) => current && patch(current)); setState('idle'); };
  const setPhoto = (index: number, patch: Partial<GalleryPhoto>) => update((current) => ({ ...current, photos: current.photos.map((photo, at) => (at === index ? { ...photo, ...patch } : photo)) }));
  function move(index: number, direction: -1 | 1) {
    update((current) => {
      const photos = [...current.photos];
      const to = index + direction;
      if (to < 0 || to >= photos.length) return current;
      [photos[index], photos[to]] = [photos[to], photos[index]];
      return { ...current, photos };
    });
  }
  async function onFile(file: File | undefined) {
    if (!file) return;
    const data = await prepareGalleryPhoto(file);
    const path = `/images/gallery/photo-${Date.now().toString(36)}.${data.startsWith('data:image/webp') ? 'webp' : 'jpg'}`;
    setUploads((current) => ({ ...current, [path]: data }));
    const index = pick.current.index;
    if (index === null) update((current) => ({ ...current, photos: [...current.photos, { src: path, alt: `صورة من ${BRAND.name}`, caption: '' }] }));
    else setPhoto(index, { src: path, position: undefined });
  }
  function choose(index: number | null) {
    pick.current.index = index;
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  }
  async function save() {
    if (!gallery || state === 'saving') return;
    if (gallery.photos.length < 3) { setState('error'); setError('خلّي 3 صور على الأقل عشان الشريط يطلع حلو.'); return; }
    setState('saving');
    try {
      if (await fileSha(session, GALLERY_PATH) !== saved.sha) { setState('error'); setError('في حدا ثاني عدّل الصور من جهاز ثاني. حدّث الصفحة وأعد تعديلك.'); return; }
      const clean: Gallery = { ...gallery, photos: gallery.photos.map((photo) => { const next = { ...photo }; if (!next.position) delete next.position; return next; }) };
      const text = stringify(clean);
      const files: NewFile[] = [{ path: GALLERY_PATH, text }];
      Object.entries(uploads).forEach(([path, data]) => {
        if (clean.photos.some((photo) => photo.src === path)) files.push({ path: `public${path}`, base64: data.split(',')[1] });
      });
      await commitFiles(session, files, 'تعديل صور الموقع من لوحة الإدارة');
      setGallery(clean);
      setSaved({ text, sha: await fileSha(session, GALLERY_PATH) });
      setUploads({});
      setState('saved');
    } catch (problem) {
      if (problem instanceof GitHubError && problem.status === 401) { onLogout(); return; }
      setState('error');
      setError('ما انحفظ. تأكد من النت وجرّب كمان مرة.');
    }
  }
  return (
    <>
      <section className="admin-card">
        <h2><Images size={18} /> صور الموقع</h2>
        <p className="admin-hint">هدول الصور اللي بتلف بالشريط تحت المنيو. رتّبهم بالأسهم، غيّر الصورة أو الكلام اللي عليها، أو ضيف صور جديدة.</p>
        <label className="admin-field">عنوان القسم
          <input value={gallery.title} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} data-testid="gallery-title" />
        </label>
      </section>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => void onFile(event.target.files?.[0])} data-testid="gallery-file" />
      <div className="admin-gallery">
        {gallery.photos.map((photo, index) => (
          <article key={`${photo.src}-${index}`} className="admin-gallery-item" data-testid={`gallery-item-${index}`}>
            <img src={uploads[photo.src] ?? photo.src} alt="" style={{ objectPosition: photo.position ?? 'center' }} />
            <div className="admin-gallery-body">
              <label className="admin-field">الكلام اللي على الصورة
                <input value={photo.caption} onChange={(event) => setPhoto(index, { caption: event.target.value })} maxLength={60} data-testid={`gallery-caption-${index}`} />
              </label>
              <div className="admin-gallery-actions">
                <button type="button" className="admin-ghost-dark" onClick={() => move(index, -1)} disabled={index === 0} aria-label="لقدّام"><ArrowUp size={16} /></button>
                <button type="button" className="admin-ghost-dark" onClick={() => move(index, 1)} disabled={index === gallery.photos.length - 1} aria-label="لورا"><ArrowDown size={16} /></button>
                <button type="button" className="admin-ghost-dark" onClick={() => choose(index)} data-testid={`gallery-replace-${index}`}><Camera size={16} /> غيّر الصورة</button>
                <button type="button" className="admin-ghost-dark is-danger" onClick={() => { if (confirm('تشيل هاي الصورة؟')) update((current) => ({ ...current, photos: current.photos.filter((_, at) => at !== index) })); }} aria-label="شيل الصورة" data-testid={`gallery-remove-${index}`}><Trash2 size={16} /></button>
              </div>
            </div>
          </article>
        ))}
        <button type="button" className="admin-gallery-add" onClick={() => choose(null)} data-testid="gallery-add"><Plus size={22} /> ضيف صورة</button>
      </div>
      {(dirty || state !== 'idle') && (
        <div className={`admin-savebar is-${state === 'saved' ? 'live-wait' : state}`} data-testid="gallery-savebar">
          {state === 'saving' ? <span>عم نحفظ…</span>
            : state === 'saved' && !dirty ? <><span>انحفظ ✅ بيظهر عالموقع خلال دقيقة تقريباً</span><button type="button" onClick={() => setState('idle')} aria-label="سكّر"><X size={16} /></button></>
            : state === 'error' ? <><span>{error}</span><button type="button" className="admin-primary" onClick={() => void save()}>جرّب كمان مرة</button></>
            : <><span>عندك تعديلات على الصور ما انحفظت</span><button type="button" className="admin-primary" onClick={() => void save()} data-testid="gallery-save">نزّل عالموقع</button></>}
        </div>
      )}
    </>
  );
}
