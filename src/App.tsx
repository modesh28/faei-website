import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Flame, MapPin, Menu, Minus, Plus, Search, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { categories, featuredIds, products, type Category, type Product } from './menu';

// A cart entry id is "<productId>::<optionIndex>", so each size of a product is its own line.
type CartEntry = { id: string; quantity: number };
const CART_KEY = 'faei-cart-v2';
const WHATSAPP_DESTINATION = '962797607843';
const INSTAGRAM_URL = 'https://www.instagram.com/faei_cafe/';
const LOCATION_QUERY = 'كلية الأمير عبدالله بن غازي لتكنولوجيا المعلومات، جامعة البلقاء التطبيقية، السلط';
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATION_QUERY)}`;
const HOURS_TEXT = 'من الأحد للخميس، 7:30 الصبح لـ 5:00 العصر';

// Offer of the day. Change the text and the product id here; set OFFER to null to hide the band.
const OFFER: { title: string; text: string; productId: string; optionIndex: number } | null = {
  title: 'عرض اليوم',
  text: 'وجبة شلة: شاورما بتكفّي الشلة كلها بـ 8 د.أ بس.',
  productId: 'shawarma-shilla',
  optionIndex: 0,
};

// Photos for the "قعدة الفَيّ" gallery (files in public/images).
const GALLERY = [
  { src: '/images/faei-seating.jpeg', alt: 'القعدة في FAEI مع إطلالة على الشجر' },
  { src: '/images/faei-sign.jpeg', alt: 'قارمة FAEI على الخشب' },
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
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Storage may be unavailable; cart remains usable in memory. */ }
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2300);
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
  }
  function changeQuantity(id: string, delta: number) {
    setCart((current) => current.flatMap((entry) => entry.id !== id ? [entry] : entry.quantity + delta <= 0 ? [] : [{ ...entry, quantity: Math.min(99, entry.quantity + delta) }]));
  }
  function removeProduct(id: string) { setCart((current) => current.filter((entry) => entry.id !== id)); }
  function openCart() { setMobileNavOpen(false); setCartOpen(true); }

  function checkout() {
    if (!cartLines.length) return;
    const lines = cartLines.map(({ name, option, quantity }) => `• ${name} × ${quantity}\n  سعر الوحدة: ${money(option.priceFils)} — المجموع: ${money(option.priceFils * quantity)}`).join('\n');
    const message = `مرحباً FAEI، بدي أطلب الأوردر التالي:\n\n${lines}\n\nالإجمالي النهائي: ${money(totalFils)}\n\nشكراً!`;
    const url = `https://wa.me/${WHATSAPP_DESTINATION}?text=${encodeURIComponent(message)}`;
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else window.location.assign(url);
  }

  const featuredProducts = featuredIds.flatMap((id) => productMap.get(id) ?? []);
  const offerProduct = OFFER ? productMap.get(OFFER.productId) : undefined;

  function selectCategory(category: Category | 'الكل') {
    setSelectedCategory(category);
    setSearch('');
  }

  return (
    <div className="faei-app" dir="rtl">
      <header className="topbar">
        <div className="faei-shell topbar-inner">
          <a className="brand" href="#home" aria-label="FAEI — الرئيسية">
            <img src="/images/faei-logo.png" alt="شعار FAEI للمطعم والمقهى" />
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
              <img src="/images/faei-sign.jpeg" alt="قارمة FAEI على واجهة المطعم" fetchPriority="high" style={{ objectPosition: 'center 75%' }} />
            </div>
          </div>
        </section>

        {OFFER && offerProduct && (
          <aside className="bg-[#f4c542] text-[#182b3a]" aria-label={OFFER.title}>
            <div className="faei-shell flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold sm:text-base"><Tag size={18} aria-hidden="true" /><strong>{OFFER.title}:</strong> {OFFER.text}</p>
              <button type="button" className="button" style={{ background: '#182b3a', color: '#fff', minHeight: 42 }} onClick={() => addProduct(offerProduct, OFFER.optionIndex)} data-testid="button-add-offer">أضفها للسلة <Plus size={16} /></button>
            </div>
          </aside>
        )}

        <section className="section" id="popular" aria-labelledby="popular-title" style={{ background: '#fff' }}>
          <div className="faei-shell">
            <div className="section-head">
              <div><span className="section-kicker">اللي الكل بطلبه</span><h2 id="popular-title" className="flex items-center gap-2">الأكثر طلباً <Flame size={30} color="#f4c542" aria-hidden="true" /></h2><p>الشاورما، الزنجر، والبوكسات.</p></div>
            </div>
            <div className="catalog-grid">
              {featuredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addProduct} />)}
            </div>
          </div>
        </section>

        <section className="section menu-section" id="menu" aria-labelledby="menu-title">
          <div className="faei-shell">
            <div className="section-head">
              <div><span className="section-kicker">اختار اللي على مزاجك</span><h2 id="menu-title">المنيو</h2><p>اختار الصنف والحجم، وابعت طلبك على واتساب.</p></div>
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
            <div className="catalog-grid" aria-live="polite">
              {visibleProducts.length ? visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addProduct} />) : <div className="empty-results"><Search size={25} /><p>ما لقينا أصناف مطابقة. جرّب كلمة بحث ثانية.</p></div>}
            </div>
          </div>
        </section>

        <section className="section about-section" id="about" aria-labelledby="about-title">
          <div className="faei-shell about-layout">
            <div className="about-mark"><img src="/images/faei-logo.png" alt="شعار FAEI الرسمي" loading="lazy" /></div>
            <div className="about-copy">
              <span className="section-kicker">قريبين من يومكم الجامعي</span>
              <h2 id="about-title">FAEI، لخدمة مجتمع الجامعة.</h2>
              <p>FAEI مطعم ومقهى يخدم مجتمع جامعة البلقاء التطبيقية. مساحة لطلب قهوتك أو وجبتك خلال يومك الجامعي، بخيارات تقدر تتصفحها وترسل طلبك بشأنها مباشرة عبر واتساب.</p>
              <p className="about-note">تعي نقعد بالفَيّ: برغر، شاورما، بيتزا، مناقيش وأكثر، وكله بأسعار طلاب.</p>
            </div>
          </div>
        </section>

        <section className="section" id="gallery" aria-labelledby="gallery-title" style={{ background: '#fff' }}>
          <div className="faei-shell">
            <div className="section-head">
              <div><span className="section-kicker">تعي نقعد بالفَيّ</span><h2 id="gallery-title">قعدة الفَيّ</h2><p>قعدة بين الشجر، وإطلالة، وأكل طيب بين المحاضرات.</p></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {GALLERY.map((photo) => (
                <img key={photo.src} src={photo.src} alt={photo.alt} loading="lazy" className="block aspect-[4/3] w-full rounded-xl object-cover" />
              ))}
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-xl p-6 text-center" style={{ background: '#182b3a', color: '#fff' }} data-testid="link-instagram-gallery">
                <InstagramIcon size={40} />
                <strong className="text-lg">@faei_cafe</strong>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,.75)' }}>شوف آخر الصور والعروض على انستغرام</span>
                <span className="mt-1 rounded-md px-4 py-2 text-sm font-bold" style={{ background: '#f4c542', color: '#182b3a' }}>تابعنا</span>
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
            <div className="location-card flex flex-wrap items-center justify-between gap-4" id="location">
              <div className="location-info">
                <h3><MapPin size={20} /> موقع FAEI</h3>
                <p>كلية الأمير عبدالله بن غازي لتكنولوجيا المعلومات، جامعة البلقاء التطبيقية، الأردن.</p>
                <p className="mt-2 flex flex-wrap items-center gap-2"><Clock size={16} aria-hidden="true" /> {HOURS_TEXT} <OpenStatus /></p>
              </div>
              <a className="button button-ink" style={{ color: '#fff', background: '#182b3a' }} href={MAPS_URL} target="_blank" rel="noreferrer" data-testid="link-location">افتح الموقع على الخريطة <MapPin size={17} /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="faei-shell footer-inner">
          <a href="#home" aria-label="FAEI — إلى الرئيسية"><img src="/images/faei-logo.png" alt="FAEI" loading="lazy" /></a>
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
          {cartLines.length ? <>
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
                  </div>
                </div>
                <strong className="line-total">{money(option.priceFils * quantity)}</strong>
              </article>)}
            </div>
            <div className="drawer-foot">
              <div className="drawer-actions"><span>تقدر تعدّل طلبك قبل الإرسال.</span><button className="clear-button" type="button" onClick={() => { if (window.confirm('تمسح كل الأصناف من السلة؟')) setCart([]); }} data-testid="button-clear-cart">إفراغ السلة</button></div>
              <div className="total-row"><span>الإجمالي</span><strong data-testid="text-cart-total">{money(totalFils)}</strong></div>
              <button className="button wa-button" type="button" onClick={checkout} disabled={!cartLines.length} data-testid="button-whatsapp-checkout">إرسال الطلب عبر واتساب <ArrowLeft size={18} /></button>
              <p className="checkout-note">رح يفتح واتساب برسالة طلب جاهزة. الطلب بيتأكد لما FAEI يرد عليك.</p>
            </div>
          </> : <div className="cart-empty"><ShoppingBag size={34} /><h3>السلة فاضية حالياً</h3><p>تصفّح المنيو وأضف الأصناف اللي بدك إياها.</p><button type="button" className="button button-gold" onClick={() => setCartOpen(false)}>تصفّح المنيو</button></div>}
        </aside>
      </>}
      {toast && <div className="toast-message" role="status" aria-live="polite"><Check size={16} /> {toast}</div>}
    </div>
  );
}

export default App;
