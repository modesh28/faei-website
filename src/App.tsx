import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Flame, MapPin, Menu, Minus, Plus, Search, ShoppingBag, Tag, Trash2, Truck, X } from 'lucide-react';
import { categories, products, type Category, type Product } from './menu';
import Wayfinder from './Wayfinder';

// A cart entry id is "<productId>::<optionIndex>", so each size of a product is its own line.
type CartEntry = { id: string; quantity: number };
const CART_KEY = 'faei-cart-v2';
const WHATSAPP_DESTINATION = '962797607843';
const INSTAGRAM_URL = 'https://www.instagram.com/faei_cafe/';
const LOCATION_QUERY = 'كلية الأمير عبدالله بن غازي لتكنولوجيا المعلومات، جامعة البلقاء التطبيقية، السلط';
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATION_QUERY)}`;
const HOURS_TEXT = 'من الأحد للخميس، 7:30 الصبح لـ 5:00 العصر';
// Delivery inside the university costs 1 JD; outside it is agreed on WhatsApp.
const DELIVERY_INSIDE_FILS = 1000;
const DELIVERY_TEXT = 'توصيل جوا الجامعة بدينار، وبرا الجامعة حسب المكان وحجم الطلب.';

type Fulfillment = 'pickup' | 'delivery';
type DeliveryZone = 'inside' | 'outside';

// Offer of the day. The live text comes from public/offer.json (edit it on GitHub, no code needed);
// this is only the fallback while it loads or if the file is broken.
type Offer = { show: boolean; title: string; text: string; productId?: string; optionIndex?: number };
const DEFAULT_OFFER: Offer = {
  show: true,
  title: 'عرض اليوم',
  text: 'وجبة شلة: شاورما بتكفّي الشلة كلها بـ 8 د.أ بس.',
  productId: 'shawarma-shilla',
};

// Photos for the "قعدة الفَيّ" gallery (files in public/images). size: big = 2x2, tall = 1x2, normal = 1x1.
const GALLERY: { src: string; alt: string; caption: string; size?: 'big' | 'tall'; position?: string }[] = [
  { src: '/images/faei-seating.webp', alt: 'القعدة في FAEI مع إطلالة على الشجر', caption: 'قعدة بين الشجر', size: 'big' },
  { src: '/images/faei-table.webp', alt: 'طاولة في FAEI قدام رسمة فيروز على الحيط', caption: 'فيروز والشلة والأكل', size: 'tall', position: 'center 60%' },
  { src: '/images/faei-sign.webp', alt: 'قارمة FAEI على الخشب', caption: 'أهلاً بالفَيّ', position: 'center 75%' },
  { src: '/images/smash-classic.webp', alt: 'سماش برغر طازة من FAEI', caption: 'سماش طازة' },
  { src: '/images/smash-cheese.webp', alt: 'تحضير السماش برغر على الصاج', caption: 'بينعمل قدامك' },
  { src: '/images/pizza-zinger.webp', alt: 'بيتزا زنجر من FAEI', caption: 'بيتزا زنجر' },
];

// Quick facts shown in the about section.
const ABOUT_FACTS = [
  { icon: Tag, title: 'أسعار طلاب', text: 'ساندويش الشاورما من 0.75 د.أ' },
  { icon: Truck, title: 'توصيل جوا الجامعة', text: 'لباب القاعة بدينار واحد' },
  { icon: Clock, title: 'من الصبح للعصر', text: 'الأحد لِلخميس، 7:30 لـ 5:00' },
];

// Open Sunday–Thursday, 7:30–17:00 Jordan time.
function isOpenNow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(get('weekday')) && minutes >= 450 && minutes < 1020;
}

// Inline styles on purpose: older rules such as `.hero-foot span` would otherwise squash this badge.
function OpenStatus({ dark = false }: { dark?: boolean }) {
  const open = isOpenNow();
  const badge = {
    display: 'inline-flex', alignItems: 'center', gap: 6, width: 'auto', height: 'auto', whiteSpace: 'nowrap' as const,
    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, lineHeight: 1.4,
    background: open ? '#d1fae5' : dark ? 'rgba(255,255,255,.12)' : '#e2e8f0',
    color: open ? '#065f46' : dark ? 'rgba(255,255,255,.85)' : '#334155',
  };
  const dot = { display: 'inline-block', width: 8, height: 8, borderRadius: 999, flex: 'none', background: open ? '#10b981' : '#94a3b8' };
  return <span style={badge}><span style={dot} />{open ? 'مفتوح هلأ' : 'مسكّر هلأ'}</span>;
}

// Instagram logo as inline SVG, so it doesn't depend on the lucide-react version.
function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function lineId(product: Product, optionIndex: number): string { return `${product.id}::${optionIndex}`; }

const productMap = new Map(products.map((product) => [product.id, product]));
function resolveLine(id: string) {
  const [productId, index] = id.split('::');
  const product = productMap.get(productId);
  const option = product?.options[Number(index)];
  return product && option ? { product, option, name: option.label ? `${product.name} — ${option.label}` : product.name } : undefined;
}

// Sandwich → meal upgrades. Burgers and chicken have both options on one card; shawarma meals are separate items.
const SHAWARMA_MEAL: Record<string, string> = { 'shawarma-sandwich': 'shawarma-meal', 'shawarma-sandwich-super': 'shawarma-meal-super' };
function mealUpgrade(id: string): { id: string; extraFils: number } | undefined {
  const line = resolveLine(id);
  if (!line) return undefined;
  const mealProductId = SHAWARMA_MEAL[line.product.id];
  const target = mealProductId
    ? productMap.get(mealProductId) && `${mealProductId}::0`
    : line.option.label === 'ساندويش' && line.product.options.findIndex((option) => option.label === 'وجبة') >= 0
      ? `${line.product.id}::${line.product.options.findIndex((option) => option.label === 'وجبة')}`
      : undefined;
  const targetLine = target ? resolveLine(target) : undefined;
  return target && targetLine ? { id: target, extraFils: targetLine.option.priceFils - line.option.priceFils } : undefined;
}

// Quick add-ons offered in the cart when they aren't already in it.
const SUGGESTED_IDS = ['salad-coleslaw::0', 'salad-fruit::0', 'salad-nachos::0'];

function readCart(): CartEntry[] {
  try {
    const stored = localStorage.getItem(CART_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is CartEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Partial<CartEntry>;
      return typeof item.id === 'string' && resolveLine(item.id) !== undefined
        && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 99;
    });
  } catch {
    return [];
  }
}

function money(fils: number): string {
  const dinars = Math.floor(fils / 1000);
  const remainder = fils % 1000;
  return `${dinars}${remainder ? `.${String(remainder).padStart(3, '0').replace(/0+$/, '')}` : ''} د.أ`;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product, optionIndex: number) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      {product.image && !imageFailed && (
        <div className="product-image">
          <img src={product.image} alt={product.alt ?? product.name} loading="lazy" onError={() => setImageFailed(true)} />
        </div>
      )}
      <div className="product-body">
        <div className="product-meta">
          <span>{product.category}</span>
          {product.popular && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800"><Flame size={12} aria-hidden="true" /> الأكثر طلباً</span>}
        </div>
        <h3>{product.name}</h3>
        <ul className="option-list">
          {product.options.map((option, index) => (
            <li key={index} className="option-row">
              {option.label && <span className="option-label">{option.label}</span>}
              <span className="price" data-testid={`text-price-${product.id}-${index}`}>{money(option.priceFils)}</span>
              <button className="add-button" type="button" aria-label={`أضف ${product.name}${option.label ? ` ${option.label}` : ''} إلى السلة`} onClick={() => onAdd(product, index)} data-testid={`button-add-${product.id}-${index}`}>
                <Plus size={16} aria-hidden="true" /><span>أضف</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function App() {
  const [cart, setCart] = useState<CartEntry[]>(readCart);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'الكل'>(categories[0]);
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [zone, setZone] = useState<DeliveryZone>('inside');
  const [address, setAddress] = useState('');
  const [timeMode, setTimeMode] = useState<'asap' | 'later'>('asap');
  const [orderTime, setOrderTime] = useState('');
  // Free-text extras from the cafeteria shelf (juices, chips, sweets), priced on WhatsApp.
  const [extras, setExtras] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Storage may be unavailable; cart remains usable in memory. */ }
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => { setToast(''); setToastAction(null); }, toastAction ? 4500 : 2300);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!cartOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCartOpen(false);
      if (event.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [cartOpen]);

  // Close the mobile menu with Escape.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  const cartLines = cart.flatMap((entry) => {
    const line = resolveLine(entry.id);
    return line && entry.quantity > 0 && entry.quantity <= 99 ? [{ ...line, id: entry.id, quantity: entry.quantity }] : [];
  });
  const suggestions = cartLines.length
    ? SUGGESTED_IDS.filter((id) => !cartLines.some((line) => line.id === id)).flatMap((id) => { const line = resolveLine(id); return line ? [{ ...line, id }] : []; }).slice(0, 3)
    : [];
  const totalFils = cartLines.reduce((sum, line) => sum + line.option.priceFils * line.quantity, 0);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const query = search.trim().toLocaleLowerCase('ar');
  // A search looks through the whole menu; otherwise only the chosen category is shown.
  const visibleProducts = products.filter((product) => query
    ? `${product.name} ${product.category}`.toLocaleLowerCase('ar').includes(query)
    : selectedCategory === 'الكل' || product.category === selectedCategory);

  function addProduct(product: Product, optionIndex: number) {
    const id = lineId(product, optionIndex);
    setCart((current) => {
      const found = current.find((entry) => entry.id === id);
      if (found) return current.map((entry) => entry.id === id ? { ...entry, quantity: Math.min(entry.quantity + 1, 99) } : entry);
      return [...current, { id, quantity: 1 }];
    });
    setToast(`${resolveLine(id)?.name ?? product.name} انضاف للسلة`);
    const upgrade = mealUpgrade(id);
    setToastAction(upgrade ? { label: `خليها وجبة +${money(upgrade.extraFils)}`, run: () => upgradeLine(id) } : null);
  }
  // Swap one sandwich in the cart for the meal version.
  function upgradeLine(id: string) {
    const upgrade = mealUpgrade(id);
    if (!upgrade) return;
    setCart((current) => {
      const source = current.find((entry) => entry.id === id);
      if (!source) return current;
      const rest = current.flatMap((entry) => entry.id !== id ? [entry] : entry.quantity > 1 ? [{ ...entry, quantity: entry.quantity - 1 }] : []);
      const existing = rest.find((entry) => entry.id === upgrade.id);
      return existing ? rest.map((entry) => entry.id === upgrade.id ? { ...entry, quantity: Math.min(99, entry.quantity + 1) } : entry) : [...rest, { id: upgrade.id, quantity: 1 }];
    });
    setToast(`صارت وجبة: ${resolveLine(upgrade.id)?.name ?? ''}`);
    setToastAction(null);
  }
  function changeQuantity(id: string, delta: number) {
    setCart((current) => current.flatMap((entry) => entry.id !== id ? [entry] : entry.quantity + delta <= 0 ? [] : [{ ...entry, quantity: Math.min(99, entry.quantity + delta) }]));
  }
  function removeProduct(id: string) { setCart((current) => current.filter((entry) => entry.id !== id)); }
  function openCart() { setMobileNavOpen(false); setToast(''); setToastAction(null); setCartOpen(true); }

  const isDelivery = fulfillment === 'delivery';
  const deliveryFils = isDelivery && zone === 'inside' ? DELIVERY_INSIDE_FILS : 0;
  const grandTotalFils = totalFils + deliveryFils;
  const missingAddress = isDelivery && !address.trim();
  const missingTime = timeMode === 'later' && !orderTime;
  const hasExtras = extras.trim().length > 0;
  const canCheckout = (cartLines.length > 0 || hasExtras) && !missingAddress && !missingTime;

  function checkout() {
    if (!canCheckout) return;
    const lines = cartLines.map(({ name, option, quantity }) => `• ${name} × ${quantity}\n  سعر الوحدة: ${money(option.priceFils)} — المجموع: ${money(option.priceFils * quantity)}`).join('\n');
    const how = isDelivery
      ? `طريقة الاستلام: توصيل ${zone === 'inside' ? 'جوا الجامعة' : 'برا الجامعة'}\nالعنوان: ${address.trim()}`
      : 'طريقة الاستلام: استلام من الكافيه';
    const when = `الوقت: ${timeMode === 'asap' ? 'بأسرع وقت' : `الساعة ${orderTime}`}`;
    const totals = isDelivery
      ? zone === 'inside'
        ? `مجموع الأصناف: ${money(totalFils)}\nالتوصيل: ${money(deliveryFils)}\nالإجمالي النهائي: ${money(grandTotalFils)}`
        : `مجموع الأصناف: ${money(totalFils)}\nالتوصيل: بنتفق عليه\nالإجمالي قبل التوصيل: ${money(totalFils)}`
      : `الإجمالي النهائي: ${money(totalFils)}`;
    const extrasText = hasExtras ? `من الكافتيريا (السعر بيتأكد على واتساب):\n${extras.trim()}\n\n` : '';
    const itemsText = lines ? `${lines}\n\n` : '';
    const totalsText = !cartLines.length
      ? `${isDelivery ? `التوصيل: ${zone === 'inside' ? money(deliveryFils) : 'بنتفق عليه'}\n` : ''}الإجمالي: بيتأكد على واتساب`
      : `${totals}${hasExtras ? ' + أغراض الكافتيريا' : ''}`;
    const message = `مرحباً FAEI، بدي أطلب الأوردر التالي:\n\n${itemsText}${extrasText}${how}\n${when}\n\n${totalsText}\n\nشكراً!`;
    const url = `https://wa.me/${WHATSAPP_DESTINATION}?text=${encodeURIComponent(message)}`;
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else window.location.assign(url);
  }

  const [offer, setOffer] = useState<Offer>(DEFAULT_OFFER);
  useEffect(() => {
    fetch('/offer.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Partial<Offer> | null) => { if (data && typeof data.text === 'string') setOffer({ ...DEFAULT_OFFER, ...data }); })
      .catch(() => {});
  }, []);
  const offerProduct = offer.productId ? productMap.get(offer.productId) : undefined;

  function selectCategory(category: Category | 'الكل') {
    setSelectedCategory(category);
    setSearch('');
  }

  return (
    <div className="faei-app" dir="rtl">
      <header className="topbar">
        <div className="faei-shell topbar-inner">
          <a className="brand" href="#home" aria-label="FAEI — الرئيسية">
            <img src="/images/faei-logo.webp" alt="شعار FAEI للمطعم والمقهى" />
          </a>
          <nav className={`nav-links${mobileNavOpen ? ' is-open' : ''}`} aria-label="التنقل الرئيسي">
            <a href="#home" onClick={() => setMobileNavOpen(false)}>الرئيسية</a>
            <a href="#menu" onClick={() => setMobileNavOpen(false)}>المنيو</a>
            <a href="#about" onClick={() => setMobileNavOpen(false)}>عن FAEI</a>
            <a href="#contact" onClick={() => setMobileNavOpen(false)}>تواصل معنا</a>
          </nav>
          <button className="cart-trigger" type="button" onClick={openCart} aria-label={`افتح السلة، ${itemCount} صنف`} data-testid="button-open-cart">
            <ShoppingBag size={18} aria-hidden="true" /><span className="cart-label">السلة</span><span className="cart-count" data-testid="text-cart-count">{itemCount}</span>
          </button>
          <button className="mobile-toggle" type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-label={mobileNavOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={mobileNavOpen} data-testid="button-mobile-menu">
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>
      {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="إغلاق القائمة" onClick={() => setMobileNavOpen(false)} />}

      <main>
        <section id="home" className="hero" aria-labelledby="hero-title">
          <div className="hero-content">
            <div className="hero-copy">
              <span className="eyebrow">FAEI · لخدمتكم في الجامعة</span>
              <h1 id="hero-title">تعي نقعد <em>بالفَيّ</em></h1>
              <p>قهوتك ووجبتك المفضلة في مكان واحد. تصفّح القائمة، جهّز طلبك، وأرسله لنا مباشرة على واتساب.</p>
              <div className="hero-actions">
                <a className="button button-gold" href="#menu">تصفّح المنيو <ArrowLeft size={17} /></a>
                <button className="button button-outline" type="button" onClick={openCart}>اطلب الآن <ShoppingBag size={17} /></button>
              </div>
              <div className="hero-foot flex flex-wrap items-center gap-3"><OpenStatus dark /> <Clock size={15} aria-hidden="true" /> {HOURS_TEXT}</div>
            </div>
            <div className="hero-media">
              <img src="/images/faei-sign.webp" alt="قارمة FAEI على واجهة المطعم" fetchPriority="high" style={{ objectPosition: 'center 75%' }} />
            </div>
          </div>
        </section>

        {offer.show && offer.text.trim() && (
          <aside className="bg-[#f4c542] text-[#182b3a]" aria-label={offer.title}>
            <div className="faei-shell flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold sm:text-base"><Tag size={18} aria-hidden="true" /><strong>{offer.title}:</strong> {offer.text}</p>
              {offerProduct && <button type="button" className="button" style={{ background: '#182b3a', color: '#fff', minHeight: 42 }} onClick={() => addProduct(offerProduct, offer.optionIndex ?? 0)} data-testid="button-add-offer">أضفها للسلة <Plus size={16} /></button>}
            </div>
          </aside>
        )}

        <section className="section menu-section" id="menu" aria-labelledby="menu-title">
          <div className="faei-shell">
            <div className="section-head">
              <div><span className="section-kicker">اختار اللي على مزاجك</span><h2 id="menu-title">المنيو</h2><p>اختار الصنف والحجم، وابعت طلبك على واتساب. {DELIVERY_TEXT}</p></div>
            </div>
            <div className="menu-tools">
              <label className="search-wrap">
                <Search size={18} aria-hidden="true" />
                <input className="search-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف..." aria-label="ابحث في المنيو" data-testid="input-menu-search" />
              </label>
              <div className="category-list" role="group" aria-label="تصفية حسب الفئة">
                {categories.map((category) => <button key={category} type="button" className={`category-button${!query && selectedCategory === category ? ' is-active' : ''}`} onClick={() => selectCategory(category)} aria-pressed={!query && selectedCategory === category} data-testid={`button-category-${categories.indexOf(category)}`}>{category}</button>)}
                <button type="button" className={`category-button${!query && selectedCategory === 'الكل' ? ' is-active' : ''}`} onClick={() => selectCategory('الكل')} aria-pressed={!query && selectedCategory === 'الكل'} data-testid="button-category-all">كل المنيو</button>
              </div>
            </div>
            <div className="extras-banner">
              <span className="extras-emoji" aria-hidden="true">🥤🍫</span>
              <div><strong>عنا كمان عصاير وشيبس وسكاكر</strong><span>اكتب شو بدك بالسلة تحت "من الكافتيريا" وبيجيك مع طلبك.</span></div>
              <button type="button" className="button button-gold" onClick={() => { setExtrasOpen(true); openCart(); }} data-testid="button-extras-banner">ضيف من الكافتيريا</button>
            </div>
            <div className="catalog-grid" aria-live="polite">
              {visibleProducts.length ? visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addProduct} />) : <div className="empty-results"><Search size={25} /><p>ما لقينا أصناف مطابقة. جرّب كلمة بحث ثانية.</p></div>}
            </div>
          </div>
        </section>

        <section className="section about-section" id="about" aria-labelledby="about-title">
          <div className="faei-shell about-layout">
            <div className="about-photos">
              <img className="about-photo-main" src="/images/faei-table.webp" alt="طاولة في FAEI قدام رسمة فيروز" loading="lazy" />
              <img className="about-photo-small" src="/images/smash-classic.webp" alt="سماش برغر من FAEI" loading="lazy" />
              <div className="about-badge"><img src="/images/faei-logo.webp" alt="" /></div>
            </div>
            <div className="about-copy">
              <span className="section-kicker">قصة الفَيّ</span>
              <h2 id="about-title">مش بس أكل… <span>قعدة.</span></h2>
              <p>بين محاضرة ومحاضرة، الفَيّ هو المكان اللي بتلاقي فيه أكل طيب وسعر طلاب وقعدة حلوة مع الشلة. من الشاورما للسماش للمناقيش، كله بينعمل طازة قدامك.</p>
              <ul className="about-facts">
                {ABOUT_FACTS.map(({ icon: Icon, title, text }) => (
                  <li key={title}><span className="about-fact-icon"><Icon size={20} /></span><div><strong>{title}</strong><span>{text}</span></div></li>
                ))}
              </ul>
              <a className="button button-gold about-cta" href="#menu">شوف المنيو <ArrowLeft size={18} /></a>
            </div>
          </div>
        </section>

        <section className="section gallery-section" id="gallery" aria-labelledby="gallery-title">
          <div className="faei-shell">
            <div className="section-head">
              <div><span className="section-kicker">تعي نقعد بالفَيّ</span><h2 id="gallery-title">قعدة الفَيّ</h2><p>شجر، ورسومات على الحيطان، وأكل طازة بين المحاضرات.</p></div>
            </div>
            <div className="gallery-grid">
              {GALLERY.map((photo) => (
                <figure key={photo.src} className={`gallery-item${photo.size ? ` is-${photo.size}` : ''}`}>
                  <img src={photo.src} alt={photo.alt} loading="lazy" style={{ objectPosition: photo.position ?? 'center' }} />
                  <figcaption>{photo.caption}</figcaption>
                </figure>
              ))}
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="gallery-item gallery-insta" data-testid="link-instagram-gallery">
                <InstagramIcon size={34} />
                <div><strong>@faei_cafe</strong><span>كل يوم صور وعروض جديدة على انستغرام</span></div>
                <span className="gallery-insta-cta">تابعنا</span>
              </a>
            </div>
          </div>
        </section>

        <section className="section contact-section" id="contact" aria-labelledby="contact-title">
          <div className="faei-shell">
            <div className="contact-panel">
              <div><span className="section-kicker">نحن على واتساب</span><h2 id="contact-title">عندك سؤال عن صنف؟</h2><p>تواصل مع FAEI مباشرة. تقدر كمان تبعث طلبك من السلة بعد مراجعة التفاصيل.</p></div>
              <div className="contact-actions flex flex-wrap gap-3">
                <a className="button button-gold" href={`https://wa.me/${WHATSAPP_DESTINATION}`} target="_blank" rel="noreferrer" aria-label="تواصل مع FAEI عبر واتساب">تواصل عبر واتساب <ArrowLeft size={17} /></a>
                <a className="button button-outline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="تابع FAEI على انستغرام">تابعنا على انستغرام <InstagramIcon size={17} /></a>
              </div>
            </div>
            <div className="contact-meta">
              <span><Clock size={16} aria-hidden="true" /> {HOURS_TEXT} <OpenStatus /></span>
              <span><Truck size={16} aria-hidden="true" /> {DELIVERY_TEXT}</span>
            </div>
            <div className="wayfinder-head">
              <span className="section-kicker">مش لاقينا؟</span>
              <h2>كيف توصل الفَيّ؟</h2>
              <p>إحنا جوا كلية تكنولوجيا المعلومات، بس مخبّايين شوي. اتبع الخط الأزرق.</p>
            </div>
            <Wayfinder mapsUrl={MAPS_URL} />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="faei-shell footer-inner">
          <a href="#home" aria-label="FAEI — إلى الرئيسية"><img src="/images/faei-logo.webp" alt="FAEI" loading="lazy" /></a>
          <p>FAEI · مطعم ومقهى · {HOURS_TEXT}</p>
          <div className="footer-links flex items-center gap-4">
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="انستغرام FAEI"><InstagramIcon size={20} /></a>
            <a href={MAPS_URL} target="_blank" rel="noreferrer" aria-label="موقع FAEI على الخريطة"><MapPin size={20} /></a>
            <a href="#menu">ارجع للمنيو</a>
          </div>
        </div>
      </footer>

      {cartOpen && <>
        <button className="drawer-backdrop" type="button" aria-label="إغلاق السلة" onClick={() => setCartOpen(false)} />
        <aside className="cart-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="cart-title" data-testid="drawer-cart">
          <div className="drawer-head"><h2 id="cart-title">سلتك</h2><button className="icon-button" ref={closeRef} type="button" onClick={() => setCartOpen(false)} aria-label="إغلاق السلة" data-testid="button-close-cart"><X size={20} /></button></div>
          {cartLines.length || extrasOpen || hasExtras ? <>
            <div className="cart-content" data-testid="list-cart-items">
              {cartLines.map(({ id, name, option, quantity }) => <article key={id} className="cart-line" data-testid={`row-cart-${id}`}>
                <div><h3>{name}</h3><p className="line-unit">سعر الوحدة: {money(option.priceFils)}</p>
                  <div className="line-controls">
                    <div className="qty-control" aria-label={`الكمية: ${quantity}`}>
                      <button type="button" onClick={() => changeQuantity(id, -1)} aria-label={`تقليل كمية ${name}`} data-testid={`button-decrease-${id}`}><Minus size={15} /></button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => changeQuantity(id, 1)} aria-label={`زيادة كمية ${name}`} data-testid={`button-increase-${id}`}><Plus size={15} /></button>
                    </div>
                    <button className="remove-button" type="button" onClick={() => removeProduct(id)} data-testid={`button-remove-${id}`}><Trash2 size={14} /> إزالة</button>
                    {mealUpgrade(id) && <button className="upgrade-button" type="button" onClick={() => upgradeLine(id)} data-testid={`button-upgrade-${id}`}>خليها وجبة +{money(mealUpgrade(id)!.extraFils)}</button>}
                  </div>
                </div>
                <strong className="line-total">{money(option.priceFils * quantity)}</strong>
              </article>)}
              {suggestions.length > 0 && (
                <section className="suggest-box" aria-label="اقتراحات">
                  <h3>بتكمّل طلبك؟</h3>
                  <div className="suggest-chips">
                    {suggestions.map((line) => (
                      <button key={line.id} type="button" className="suggest-chip" onClick={() => addProduct(line.product, Number(line.id.split('::')[1]))} data-testid={`button-suggest-${line.id}`}>
                        {line.product.image && <img src={line.product.image} alt="" loading="lazy" />}
                        <span><strong>{line.name}</strong><small>{money(line.option.priceFils)}</small></span>
                        <Plus size={16} aria-hidden="true" />
                      </button>
                    ))}
                    <button type="button" className="suggest-chip" onClick={() => { setExtras((current) => current.includes('مشروب') ? current : `${current ? `${current}، ` : ''}مشروب: `); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-testid=input-extras]')?.focus(), 0); }} data-testid="button-suggest-drink">
                      <span className="suggest-emoji" aria-hidden="true">🥤</span>
                      <span><strong>مشروب بارد؟</strong><small>اكتبه تحت</small></span>
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}
              <section className="order-options extras-box" aria-label="من الكافتيريا">
                <h3>بدك إشي من الكافتيريا؟</h3>
                <p className="order-hint extras-hint">عصاير، مشروبات، شيبس، سكاكر… اكتب شو بدك وبنحكيلك السعر على واتساب.</p>
                <textarea className="extras-input" rows={2} value={extras} onChange={(event) => setExtras(event.target.value)} placeholder="مثلاً: عصير برتقال، 2 شيبس، علكة" maxLength={300} data-testid="input-extras" />
              </section>
              <section className="order-options" aria-label="تفاصيل الطلب">
                <h3>إيمتى؟</h3>
                <div className="segmented" role="radiogroup" aria-label="وقت الطلب">
                  <button type="button" role="radio" aria-checked={timeMode === 'asap'} className={timeMode === 'asap' ? 'is-active' : ''} onClick={() => setTimeMode('asap')} data-testid="option-asap">بأسرع وقت</button>
                  <button type="button" role="radio" aria-checked={timeMode === 'later'} className={timeMode === 'later' ? 'is-active' : ''} onClick={() => setTimeMode('later')} data-testid="option-later">بساعة معينة</button>
                </div>
                {timeMode === 'later' && (
                  <label className="order-field">
                    <span>الساعة</span>
                    <input type="time" min="07:30" max="17:00" step={900} value={orderTime} onChange={(event) => setOrderTime(event.target.value)} data-testid="input-time" />
                  </label>
                )}
              </section>
            </div>
            <div className="drawer-foot">
              <div className="drawer-actions"><span>تقدر تعدّل طلبك قبل الإرسال.</span><button className="clear-button" type="button" onClick={() => { if (window.confirm('تمسح كل الأصناف من السلة؟')) setCart([]); }} data-testid="button-clear-cart">إفراغ السلة</button></div>
              <section className="order-options foot-options" aria-label="طريقة الاستلام">
                <h3>استلام ولا توصيل؟</h3>
                <div className="segmented" role="radiogroup" aria-label="طريقة الاستلام">
                  <button type="button" role="radio" aria-checked={!isDelivery} className={!isDelivery ? 'is-active' : ''} onClick={() => setFulfillment('pickup')} data-testid="option-pickup">استلام من الكافيه</button>
                  <button type="button" role="radio" aria-checked={isDelivery} className={isDelivery ? 'is-active' : ''} onClick={() => setFulfillment('delivery')} data-testid="option-delivery">توصيل</button>
                </div>
                {isDelivery && <>
                  <div className="segmented" role="radiogroup" aria-label="مكان التوصيل">
                    <button type="button" role="radio" aria-checked={zone === 'inside'} className={zone === 'inside' ? 'is-active' : ''} onClick={() => setZone('inside')} data-testid="option-inside">جوا الجامعة · 1 د.أ</button>
                    <button type="button" role="radio" aria-checked={zone === 'outside'} className={zone === 'outside' ? 'is-active' : ''} onClick={() => setZone('outside')} data-testid="option-outside">برا الجامعة</button>
                  </div>
                  {zone === 'outside' && <p className="order-hint">سعر التوصيل برا الجامعة حسب المكان وحجم الطلب، وبنتفق عليه على واتساب.</p>}
                  <label className="order-field">
                    <span>وين نوصلك؟</span>
                    <input type="text" value={address} onChange={(event) => setAddress(event.target.value)} placeholder={zone === 'inside' ? 'مثلاً: كلية الهندسة، الطابق الثاني، قاعة 204' : 'المنطقة والشارع وأقرب معلم'} data-testid="input-address" />
                  </label>
                </>}
              </section>
              <div className="subtotal-row"><span>الأصناف</span><span>{money(totalFils)}</span></div>
              <div className="subtotal-row"><span>التوصيل</span><span data-testid="text-delivery-fee">{!isDelivery ? 'بدون (استلام)' : zone === 'inside' ? money(deliveryFils) : 'بنتفق عليه'}</span></div>
              {hasExtras && <div className="subtotal-row"><span>من الكافتيريا</span><span>بيتأكد على واتساب</span></div>}
              <div className="total-row"><span>الإجمالي</span><strong data-testid="text-cart-total">{money(grandTotalFils)}</strong></div>
              {(missingAddress || missingTime) && <p className="order-warning">{missingAddress ? 'اكتب وين نوصلك عشان تقدر تبعت الطلب.' : 'اختار الساعة عشان تقدر تبعت الطلب.'}</p>}
              <button className="button wa-button" type="button" onClick={checkout} disabled={!canCheckout} data-testid="button-whatsapp-checkout">إرسال الطلب عبر واتساب <ArrowLeft size={18} /></button>
              <p className="checkout-note">رح يفتح واتساب برسالة طلب جاهزة. الطلب بيتأكد لما FAEI يرد عليك.</p>
            </div>
          </> : <div className="cart-empty"><ShoppingBag size={34} /><h3>السلة فاضية حالياً</h3><p>تصفّح المنيو وأضف الأصناف اللي بدك إياها.</p><button type="button" className="button button-gold" onClick={() => setCartOpen(false)}>تصفّح المنيو</button><button type="button" className="clear-button extras-only" onClick={() => setExtrasOpen(true)} data-testid="button-extras-only">بدي بس عصير أو سناك من الكافتيريا</button></div>}
        </aside>
      </>}
      {toast && <div className="toast-message" role="status" aria-live="polite"><Check size={16} /> {toast}{toastAction && <button type="button" className="toast-action" onClick={() => toastAction.run()} data-testid="button-toast-upgrade">{toastAction.label}</button>}</div>}
    </div>
  );
}

export default App;
