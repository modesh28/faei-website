import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Compass, Copy, Ellipsis, EllipsisVertical, Flame, MapPin, Menu, Minus, Plus, Search, Share, ShoppingBag, Smartphone, SquarePlus, Tag, Trash2, X } from 'lucide-react';
import { categories, products, type Category, type Product } from './menu';
import Wayfinder from './Wayfinder';

// A cart entry id is "<productId>::<optionIndex>", so each size of a product is its own line.
type CartEntry = { id: string; quantity: number };
const CART_KEY = 'faei-cart-v2';
// The last order sent on this phone, offered again as "طلبك المعتاد".
const LAST_ORDER_KEY = 'faei-last-order-v1';
type LastOrder = { cart: CartEntry[]; extras: string };
const WHATSAPP_DESTINATION = '962797607843';
const INSTAGRAM_URL = 'https://www.instagram.com/faei_cafe/';
// FAEI's own pin on Google Maps.
const MAPS_URL = 'https://maps.app.goo.gl/5dB3uh3ELugdSyEWA';
const HOURS_TEXT = 'من الأحد للخميس، 7:30 الصبح لـ 5:00 العصر';
// Delivery inside the university costs 1 JD; outside it is agreed on WhatsApp.
const DELIVERY_INSIDE_FILS = 1000;

// Edited on GitHub in public/settings.json: the Google Sheet that logs orders, and the CliQ alias for paying.
type Settings = { sheetUrl: string; cliqAlias: string; cliqName: string };
// Built-in values, so CliQ and order logging work even if settings.json fails to load.
const DEFAULT_SETTINGS: Settings = {
  sheetUrl: 'https://script.google.com/macros/s/AKfycbz2zj4JEFhsCRhKHdzBCkgbHvB7geVle4i3grIsjgwWy9AT03spE9v3WJkQ-55z0U5q/exec',
  cliqAlias: '0797607843',
  cliqName: '',
};
// Where the visitor came from, e.g. ?from=qr on the table cards.
const VISIT_SOURCE = new URLSearchParams(window.location.search).get('from') ?? '';

type Fulfillment = 'pickup' | 'delivery';
type Payment = 'cash' | 'cliq';
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

// "Add to home screen". One button for everyone: it installs directly where the browser
// allows it (Chrome on Android), and otherwise opens short steps for this phone's browser.
type InstallEvent = Event & { prompt: () => Promise<void> };
type Step = { icon: React.ReactNode; text: React.ReactNode };
function installSteps(): { title: string; steps: Step[]; copyLink?: boolean } {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly|Line\//i.test(ua);
  const add = <SquarePlus size={18} />;
  if (inApp) return {
    title: 'افتح الموقع بالمتصفح أول',
    copyLink: true,
    steps: [
      { icon: <Ellipsis size={18} />, text: <>اكبس <b>⋯</b> فوق عاليمين</> },
      { icon: <Compass size={18} />, text: <>اختار <b>{ios ? 'Open in Safari' : 'Open in Chrome'}</b> (افتح بالمتصفح)</> },
      { icon: add, text: <>بالمتصفح، اكبس زر <b>نزّل FAEI</b> مرة ثانية</> },
    ],
  };
  if (ios && /CriOS|FxiOS|EdgiOS/.test(ua)) return {
    title: 'على الآيفون',
    steps: [
      { icon: <Share size={18} />, text: <>اكبس زر <b>المشاركة</b> فوق جنب الرابط</> },
      { icon: add, text: <>اختار <b>إضافة إلى الشاشة الرئيسية</b></> },
      { icon: <Check size={18} />, text: <>اكبس <b>إضافة</b>، وبتطلع أيقونة FAEI</> },
    ],
  };
  if (ios) return {
    title: 'على الآيفون',
    steps: [
      { icon: <Share size={18} />, text: <>اكبس زر <b>المشاركة</b> تحت (أو <b>⋯</b> ثم مشاركة)</> },
      { icon: add, text: <>انزل لتحت واختار <b>إضافة إلى الشاشة الرئيسية</b></> },
      { icon: <Check size={18} />, text: <>اكبس <b>إضافة</b>، وبتطلع أيقونة FAEI</> },
    ],
  };
  if (/SamsungBrowser/.test(ua)) return {
    title: 'على سامسونج',
    steps: [
      { icon: <Menu size={18} />, text: <>اكبس <b>☰</b> تحت</> },
      { icon: add, text: <>اختار <b>إضافة الصفحة إلى</b> ثم <b>الشاشة الرئيسية</b></> },
      { icon: <Check size={18} />, text: <>اكبس <b>إضافة</b>، وبتطلع أيقونة FAEI</> },
    ],
  };
  return {
    title: 'على أندرويد',
    steps: [
      { icon: <EllipsisVertical size={18} />, text: <>اكبس <b>⋮</b> فوق عاليمين</> },
      { icon: add, text: <>اختار <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b></> },
      { icon: <Check size={18} />, text: <>اكبس <b>تثبيت</b>، وبتطلع أيقونة FAEI</> },
    ],
  };
}

function InstallApp() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (standalone) return null;
  const guide = guideOpen ? installSteps() : null;
  function start() {
    if (installEvent) { void installEvent.prompt(); setInstallEvent(null); return; }
    setGuideOpen(true);
  }
  function copyLink() {
    void navigator.clipboard?.writeText(location.origin).then(() => setCopied(true)).catch(() => {});
  }
  return (
    <>
      <button type="button" className="install-app" onClick={start} data-testid="button-install"><Smartphone size={16} /> نزّل FAEI على تلفونك</button>
      {guide && <>
        <button type="button" className="sheet-backdrop" aria-label="إغلاق" onClick={() => setGuideOpen(false)} />
        <div className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" data-testid="install-guide">
          <img src="/icon-192.png" alt="" className="install-icon" />
          <h3 id="install-title">{guide.title}</h3>
          <ol>{guide.steps.map((step, index) => <li key={index}><span className="install-num">{index + 1}</span><span className="install-step-icon">{step.icon}</span><span>{step.text}</span></li>)}</ol>
          {guide.copyLink && <button type="button" className="install-copy" onClick={copyLink}><Copy size={15} /> {copied ? 'انتسخ الرابط ✓' : 'أو انسخ الرابط والصقه بالمتصفح'}</button>}
          <button type="button" className="install-done" onClick={() => setGuideOpen(false)}>تمام</button>
        </div>
      </>}
    </>
  );
}

// Swipe or drag the photos; each one snaps into place, and the strip loops forever.
// Three copies of the list are rendered and the scroll position is quietly moved
// back to the middle copy whenever it drifts into the first or last one.
// The photo in the middle is full size, the others shrink and fade a little, and a
// soft click (plus a tiny vibration on Android) marks each photo passing the center.
let clickAudio: AudioContext | null = null;
function playTick() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    clickAudio ??= new Ctx();
    if (clickAudio.state === 'suspended') void clickAudio.resume();
    const ctx = clickAudio;
    const length = Math.floor(ctx.sampleRate * 0.025);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 9));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start();
  } catch { /* Sound is a nicety; ignore if the browser blocks it. */ }
  navigator.vibrate?.(6);
}

function GalleryCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const interacted = useRef(false);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const items = Array.from(track.querySelectorAll<HTMLElement>('.carousel-item'));
    const count = GALLERY.length;
    const setWidth = () => track.scrollWidth / 3;
    let lastIndex = -1;
    let frame = 0;
    let timer = 0;
    // Scale and fade each photo by its distance from the middle, and click when a new one reaches it.
    const paint = () => {
      frame = 0;
      const middle = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      let best = Infinity;
      items.forEach((item, index) => {
        const distance = (item.offsetLeft + item.offsetWidth / 2 - middle) / item.offsetWidth;
        const amount = Math.min(Math.abs(distance), 1.4);
        item.style.transform = `scale(${1 - amount * 0.1}) rotateY(${Math.max(-1, Math.min(1, distance)) * -10}deg)`;
        item.style.opacity = String(1 - amount * 0.32);
        if (Math.abs(distance) < best) { best = Math.abs(distance); nearest = index; }
      });
      const photo = nearest % count;
      if (photo !== lastIndex) {
        if (lastIndex !== -1 && interacted.current) playTick();
        lastIndex = photo;
      }
    };
    const center = () => { track.scrollLeft = setWidth() + (track.scrollLeft % setWidth()); paint(); };
    track.scrollLeft = setWidth();
    paint();
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const w = setWidth();
        // Jump by exactly one copy, so the same photo stays in view and no click plays.
        if (track.scrollLeft < w * 0.5) track.scrollLeft += w;
        else if (track.scrollLeft > w * 1.5) track.scrollLeft -= w;
      }, 160);
    };
    const markInteraction = () => { interacted.current = true; };
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('pointerdown', markInteraction);
    track.addEventListener('touchstart', markInteraction, { passive: true });
    window.addEventListener('resize', center);
    return () => {
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('pointerdown', markInteraction);
      track.removeEventListener('touchstart', markInteraction);
      window.removeEventListener('resize', center);
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  function step(direction: 1 | -1) {
    const track = trackRef.current;
    const item = track?.querySelector<HTMLElement>('.carousel-item');
    if (!track || !item) return;
    interacted.current = true;
    track.scrollBy({ left: direction * (item.offsetWidth + 14), behavior: 'smooth' });
  }
  // Mouse drag on desktop; touch devices use native swiping with momentum.
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !trackRef.current) return;
    drag.current = { x: event.clientX, left: trackRef.current.scrollLeft };
    trackRef.current.classList.add('is-dragging');
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !trackRef.current) return;
    trackRef.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  }
  function endDrag() {
    if (!drag.current || !trackRef.current) return;
    drag.current = null;
    trackRef.current.classList.remove('is-dragging');
  }
  return (
    <div className="gallery-carousel">
      <div className="carousel-track" ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag} aria-label="صور من FAEI، اسحب لتشوف أكثر">
        {[...GALLERY, ...GALLERY, ...GALLERY].map((photo, index) => {
          const copy = Math.floor(index / GALLERY.length);
          return (
            <figure key={index} className="carousel-item" aria-hidden={copy !== 1}>
              <img src={photo.src} alt={copy === 1 ? photo.alt : ''} draggable={false} loading="lazy" style={{ objectPosition: photo.position ?? 'center' }} />
              <figcaption>{photo.caption}</figcaption>
            </figure>
          );
        })}
      </div>
      <button type="button" className="carousel-arrow is-left" onClick={() => step(-1)} aria-label="الصورة اللي عاليسار"><ArrowLeft size={18} /></button>
      <button type="button" className="carousel-arrow is-right" onClick={() => step(1)} aria-label="الصورة اللي عاليمين"><ArrowLeft size={18} style={{ transform: 'scaleX(-1)' }} /></button>
    </div>
  );
}

// Open Sunday–Thursday, 7:30–17:00 Jordan time.
function isOpenNow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(get('weekday')) && minutes >= 450 && minutes < 1020;
}

// When the shop opens next, in words, e.g. "بكرا الساعة 7:30 الصبح".
function nextOpenText(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const today = days.indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = (today + ahead) % 7;
    if (day > 4 || (ahead === 0 && minutes >= 450)) continue;
    const when = ahead === 0 ? 'اليوم' : ahead === 1 ? 'بكرا' : `يوم ${names[day]}`;
    return `${when} الساعة 7:30 الصبح`;
  }
  return 'يوم الأحد الساعة 7:30 الصبح';
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
const SUGGESTED_IDS = ['salad-coleslaw::0'];
// Drinks from the shop's own fridge. No fixed prices, so they go into the extras note.
const SHOP_DRINKS = [
  { name: 'مشروب غازي', emoji: '🥤' },
  { name: 'عصير', emoji: '🧃' },
  { name: 'مي', emoji: '💧' },
];

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

function readLastOrder(): LastOrder | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_ORDER_KEY) ?? 'null') as Partial<LastOrder> | null;
    if (!parsed || !Array.isArray(parsed.cart)) return null;
    const cart = parsed.cart.filter((entry) => entry && typeof entry.id === 'string' && resolveLine(entry.id)
      && Number.isSafeInteger(entry.quantity) && entry.quantity > 0 && entry.quantity <= 99);
    const extras = typeof parsed.extras === 'string' ? parsed.extras : '';
    return cart.length || extras ? { cart, extras } : null;
  } catch {
    return null;
  }
}

// Short order number shared by the WhatsApp message and the sheet, e.g. "1432-7".
function makeOrderId(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(Math.random() * 90 + 10)}`;
}

// Sends the order to the Google Sheet script. Fire-and-forget: WhatsApp still opens if this fails.
function logOrder(sheetUrl: string, order: Record<string, string | number>) {
  if (!sheetUrl) return;
  try {
    fetch(sheetUrl, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(order) }).catch(() => {});
  } catch { /* Logging must never block the order. */ }
}

function money(fils: number): string {
  const dinars = Math.floor(fils / 1000);
  const remainder = fils % 1000;
  return `${dinars}${remainder ? `.${String(remainder).padStart(3, '0').replace(/0+$/, '')}` : ''} د.أ`;
}

function ProductCard({ product, onAdd, onChange, quantities, showCategory }: { product: Product; onAdd: (product: Product, optionIndex: number) => void; onChange: (id: string, delta: number) => void; quantities: Map<string, number>; showCategory: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      {product.image && !imageFailed && (
        <div className={`product-image${imageLoaded ? ' is-loaded' : ''}`}>
          <img src={product.image} alt={product.alt ?? product.name} loading="lazy" onLoad={() => setImageLoaded(true)} onError={() => setImageFailed(true)} />
        </div>
      )}
      <div className="product-body">
        {(showCategory || product.popular) && <div className="product-meta">
          {showCategory && <span>{product.category}</span>}
          {product.popular && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800"><Flame size={12} aria-hidden="true" /> الأكثر طلباً</span>}
        </div>}
        <h3>{product.name}</h3>
        <ul className="option-list">
          {product.options.map((option, index) => (
            <li key={index} className="option-row">
              {option.label && <span className="option-label">{option.label}</span>}
              <span className="price" data-testid={`text-price-${product.id}-${index}`}>{money(option.priceFils)}</span>
              {quantities.get(lineId(product, index)) ? (
                <div className="card-stepper" data-testid={`stepper-${product.id}-${index}`}>
                  <button type="button" onClick={() => onChange(lineId(product, index), 1)} aria-label="زيد واحد"><Plus size={15} /></button>
                  <span key={quantities.get(lineId(product, index))}>{quantities.get(lineId(product, index))}</span>
                  <button type="button" onClick={() => onChange(lineId(product, index), -1)} aria-label="نقّص واحد"><Minus size={15} /></button>
                </div>
              ) : (
                <button className="add-button" type="button" aria-label={`أضف ${product.name}${option.label ? ` ${option.label}` : ''} إلى السلة`} onClick={() => onAdd(product, index)} data-testid={`button-add-${product.id}-${index}`}>
                  <Plus size={16} aria-hidden="true" /><span>أضف</span>
                </button>
              )}
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
  const [payment, setPayment] = useState<Payment>('cash');
  const [cliqCopied, setCliqCopied] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    fetch('/settings.json', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Partial<Settings> | null) => { if (data) setSettings({ ...DEFAULT_SETTINGS, ...data }); })
      .catch(() => {});
  }, []);
  // Free-text extras from the cafeteria shelf (juices, chips, sweets), priced on WhatsApp.
  const [extras, setExtras] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(readLastOrder);
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
  const quantities = new Map(cart.map((entry) => [entry.id, entry.quantity]));
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
    navigator.vibrate?.(8);
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
  const isCliq = payment === 'cliq' && !!settings.cliqAlias;
  // The amount the customer can transfer now; outside delivery and extras are settled on WhatsApp.
  const cliqAmountKnown = cartLines.length > 0 && !hasExtras && !(isDelivery && zone === 'outside');
  function copyCliq() {
    navigator.clipboard?.writeText(settings.cliqAlias).then(() => { setCliqCopied(true); window.setTimeout(() => setCliqCopied(false), 1800); }).catch(() => {});
  }
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
    const orderId = makeOrderId();
    const paid = isCliq ? `الدفع: كليك على ${settings.cliqAlias} (رح أبعت صورة التحويل)` : 'الدفع: كاش عند الاستلام';
    const closedNote = isOpenNow() ? '' : '\n(طلب مسبق، انبعت والمحل مسكّر)';
    const message = `مرحباً FAEI، بدي أطلب الأوردر التالي (رقم ${orderId}):${closedNote}\n\n${itemsText}${extrasText}${how}\n${when}\n${paid}\n\n${totalsText}\n\nشكراً!`;
    logOrder(settings.sheetUrl, {
      orderId,
      items: cartLines.map(({ name, option, quantity }) => `${name}${option.label ? ` (${option.label})` : ''} × ${quantity}`).join('، '),
      pieces: cartLines.reduce((sum, line) => sum + line.quantity, 0),
      itemsTotal: totalFils / 1000,
      delivery: isDelivery ? (zone === 'inside' ? deliveryFils / 1000 : 'بنتفق عليه') : 0,
      total: grandTotalFils / 1000,
      fulfillment: isDelivery ? `توصيل ${zone === 'inside' ? 'جوا الجامعة' : 'برا الجامعة'}` : 'استلام',
      address: isDelivery ? address.trim() : '',
      time: timeMode === 'asap' ? 'بأسرع وقت' : orderTime,
      payment: isCliq ? 'كليك' : 'كاش',
      extras: extras.trim(),
      source: VISIT_SOURCE,
    });
    const saved: LastOrder = { cart, extras: extras.trim() };
    try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(saved)); } catch { /* Reorder is optional. */ }
    setLastOrder(saved);
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
  // A slim category bar sticks under the header once the big category grid scrolls away,
  // and hides again after the menu ends.
  const catalogRef = useRef<HTMLDivElement>(null);
  const [stickyCats, setStickyCats] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const catalog = catalogRef.current?.getBoundingClientRect();
      setStickyCats(!!catalog && catalog.top < 150 && catalog.bottom > 220);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Keep the chosen category chip in view inside the sticky bar.
  const stickyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = stickyRef.current;
    const active = bar?.querySelector<HTMLElement>('.is-active');
    if (bar && active) bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
  }, [selectedCategory, stickyCats]);
  function jumpToCategory(category: Category | 'الكل') {
    selectCategory(category);
    const top = (catalogRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 125;
    window.scrollTo({ top, behavior: 'smooth' });
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
            <a href="#gallery" onClick={() => setMobileNavOpen(false)}>قعدة الفَيّ</a>
            <a href="#contact" onClick={() => setMobileNavOpen(false)}>وين إحنا</a>
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
              <h1 id="hero-title">تعي نقعد <em>بالفَيّ</em></h1>
              <div className="hero-actions">
                <a className="button button-gold" href="#menu">تصفّح المنيو <ArrowLeft size={17} /></a>
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
            <div className="faei-shell offer-row">
              <p><Tag size={16} aria-hidden="true" /><strong>{offer.title}</strong><span>{offer.text}</span></p>
              {offerProduct && <button type="button" className="offer-add" onClick={() => addProduct(offerProduct, offer.optionIndex ?? 0)} data-testid="button-add-offer">أضف <Plus size={15} /></button>}
            </div>
          </aside>
        )}

        <section className="section menu-section" id="menu" aria-labelledby="menu-title">
          <div className="faei-shell">
            <div className="section-head">
              <h2 id="menu-title">المنيو</h2>
              <button type="button" className="menu-extras" onClick={() => { setExtrasOpen(true); openCart(); }} data-testid="button-extras-banner"><span aria-hidden="true">🥤</span> عنا كمان عصاير وشيبس وسكاكر</button>
            </div>
            {lastOrder && !cart.length && (
              <div className="reorder-row" data-testid="reorder-row">
                <p><strong>طلبك المعتاد</strong><span>{[...lastOrder.cart.map((entry) => `${resolveLine(entry.id)?.name} × ${entry.quantity}`), lastOrder.extras].filter(Boolean).join('، ')}</span></p>
                <button type="button" onClick={() => { setCart(lastOrder.cart); setExtras(lastOrder.extras); if (lastOrder.extras) setExtrasOpen(true); openCart(); }} data-testid="button-reorder">اطلبه</button>
              </div>
            )}
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
            <div ref={stickyRef} className={`sticky-cats${stickyCats ? ' is-shown' : ''}`} aria-hidden={!stickyCats}>
              {[...categories, 'الكل' as const].map((category) => <button key={category} type="button" tabIndex={stickyCats ? 0 : -1} className={!query && selectedCategory === category ? 'is-active' : ''} onClick={() => jumpToCategory(category)}>{category === 'الكل' ? 'كل المنيو' : category}</button>)}
            </div>
            <div className="catalog-grid" ref={catalogRef} aria-live="polite">
              {visibleProducts.length ? visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addProduct} onChange={changeQuantity} quantities={quantities} showCategory={!!query || selectedCategory === 'الكل'} />) : <div className="empty-results"><Search size={25} /><p>ما لقينا أصناف مطابقة. جرّب كلمة بحث ثانية.</p></div>}
            </div>
          </div>
        </section>

        <section className="section gallery-section" id="gallery" aria-labelledby="gallery-title">
          <div className="faei-shell">
            <div className="section-head">
              <div><h2 id="gallery-title">قعدة الفَيّ</h2></div>
            </div>
          </div>
          <GalleryCarousel />
        </section>

        <section className="section contact-section" id="contact" aria-labelledby="contact-title">
          <div className="faei-shell">
            <div className="wayfinder-head">
              <h2 id="contact-title">كيف توصل الفَيّ؟</h2>
              <p>جوا كلية تكنولوجيا المعلومات. اتبع الخط الأزرق.</p>
            </div>
            <Wayfinder mapsUrl={MAPS_URL} />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="faei-shell footer-inner">
          <a href="#home" aria-label="FAEI — إلى الرئيسية"><img src="/images/faei-logo.webp" alt="FAEI" loading="lazy" /></a>
          <p>{HOURS_TEXT}</p>
          <InstallApp />
          <div className="footer-actions">
            <a className="button button-gold" href={`https://wa.me/${WHATSAPP_DESTINATION}`} target="_blank" rel="noreferrer" aria-label="تواصل مع FAEI عبر واتساب">واتساب</a>
            <a className="button button-outline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="تابع FAEI على انستغرام"><InstagramIcon size={17} /> انستغرام</a>
            <a className="button button-outline" href={MAPS_URL} target="_blank" rel="noreferrer" aria-label="موقع FAEI على الخريطة"><MapPin size={17} /> الخريطة</a>
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
              {cartLines.length > 0 && (
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
                    {SHOP_DRINKS.map((drink) => {
                      const parts = extras.split(/[،,]/).map((part) => part.trim()).filter(Boolean);
                      const added = parts.includes(drink.name);
                      return (
                        <button key={drink.name} type="button" className={`suggest-chip${added ? ' is-added' : ''}`} onClick={() => setExtras(added ? parts.filter((part) => part !== drink.name).join('، ') : [...parts, drink.name].join('، '))} aria-pressed={added} data-testid={`button-suggest-drink-${drink.name}`}>
                          <span className="suggest-emoji" aria-hidden="true">{drink.emoji}</span>
                          <span><strong>{drink.name}</strong><small>{added ? 'انضاف ✓ · اكبس للإلغاء' : 'من ثلاجة فَيّ'}</small></span>
                          {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              <section className="order-options extras-box" aria-label="من الكافتيريا">
                <h3>بدك إشي من الكافتيريا؟</h3>
                <p className="order-hint extras-hint">عصاير، مشروبات، شيبس، سكاكر… اكتب شو بدك وبنحكيلك السعر على واتساب.</p>
                <textarea className="extras-input" rows={2} value={extras} onChange={(event) => setExtras(event.target.value)} placeholder="مثلاً: عصير برتقال، 2 شيبس، علكة" maxLength={300} data-testid="input-extras" />
              </section>
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
                <h3 className="foot-time-title">إيمتى بدك إياه؟</h3>
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
                {settings.cliqAlias && <>
                  <h3 className="foot-time-title">كيف بدك تدفع؟</h3>
                  <div className="segmented" role="radiogroup" aria-label="طريقة الدفع">
                    <button type="button" role="radio" aria-checked={payment === 'cash'} className={payment === 'cash' ? 'is-active' : ''} onClick={() => setPayment('cash')} data-testid="option-cash">كاش</button>
                    <button type="button" role="radio" aria-checked={payment === 'cliq'} className={payment === 'cliq' ? 'is-active' : ''} onClick={() => setPayment('cliq')} data-testid="option-cliq">كليك CliQ</button>
                  </div>
                  {isCliq && (
                    <div className="cliq-box" data-testid="cliq-box">
                      <p>حوّل {cliqAmountKnown ? <strong>{money(grandTotalFils)}</strong> : 'المبلغ'} على كليك:</p>
                      <button type="button" className="cliq-alias" onClick={copyCliq} data-testid="button-copy-cliq">
                        <span dir="ltr">{settings.cliqAlias}</span>
                        <small>{cliqCopied ? 'انتسخ ✓' : 'اضغط للنسخ'}</small>
                      </button>
                      {settings.cliqName && <p className="cliq-name">باسم: {settings.cliqName}</p>}
                      <p className="cliq-note">{cliqAmountKnown ? 'وبعدها ابعت صورة التحويل على واتساب مع الطلب.' : 'بنأكدلك المبلغ النهائي على واتساب، وبعدها حوّل وابعت صورة التحويل.'}</p>
                    </div>
                  )}
                </>}
              </section>
            </div>
            <div className="drawer-foot">
              <div className="drawer-actions"><span /><button className="clear-button" type="button" onClick={() => { if (window.confirm('تمسح كل الأصناف من السلة؟')) setCart([]); }} data-testid="button-clear-cart">إفراغ السلة</button></div>
              <div className="subtotal-row"><span>الأصناف</span><span>{money(totalFils)}</span></div>
              <div className="subtotal-row"><span>التوصيل</span><span data-testid="text-delivery-fee">{!isDelivery ? 'بدون (استلام)' : zone === 'inside' ? money(deliveryFils) : 'بنتفق عليه'}</span></div>
              {hasExtras && <div className="subtotal-row"><span>من الكافتيريا</span><span>بيتأكد على واتساب</span></div>}
              <div className="total-row"><span>الإجمالي</span><strong data-testid="text-cart-total">{money(grandTotalFils)}</strong></div>
              {!isOpenNow() && <p className="closed-note" data-testid="closed-note">إحنا مسكّرين هلأ وبنفتح {nextOpenText()}. بتقدر تبعت طلبك هلأ، وبنرد عليك أول ما نفتح.</p>}
              {(missingAddress || missingTime) && <p className="order-warning">{missingAddress ? 'اكتب وين نوصلك عشان تقدر تبعت الطلب.' : 'اختار الساعة عشان تقدر تبعت الطلب.'}</p>}
              <button className="button wa-button" type="button" onClick={checkout} disabled={!canCheckout} data-testid="button-whatsapp-checkout">إرسال الطلب عبر واتساب <ArrowLeft size={18} /></button>
              <p className="checkout-note">رح يفتح واتساب برسالة طلب جاهزة. الطلب بيتأكد لما FAEI يرد عليك.</p>
            </div>
          </> : <div className="cart-empty"><ShoppingBag size={34} /><h3>السلة فاضية حالياً</h3><p>تصفّح المنيو وأضف الأصناف اللي بدك إياها.</p><button type="button" className="button button-gold" onClick={() => setCartOpen(false)}>تصفّح المنيو</button><button type="button" className="clear-button extras-only" onClick={() => setExtrasOpen(true)} data-testid="button-extras-only">بدي بس عصير أو سناك من الكافتيريا</button></div>}
        </aside>
      </>}
      {itemCount > 0 && !cartOpen && (
        <button type="button" className="cart-bar" onClick={openCart} data-testid="cart-bar">
          <span className="cart-bar-count" key={itemCount}>{itemCount}</span>
          <span className="cart-bar-label">شوف السلة</span>
          <span className="cart-bar-total">{money(totalFils)}</span>
        </button>
      )}
      {toast && <div className={`toast-message${itemCount > 0 && !cartOpen ? ' is-raised' : ''}`} role="status" aria-live="polite"><Check size={16} /> {toast}{toastAction && <button type="button" className="toast-action" onClick={() => toastAction.run()} data-testid="button-toast-upgrade">{toastAction.label}</button>}</div>}
    </div>
  );
}

export default App;
