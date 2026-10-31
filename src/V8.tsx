// V8 Coffee To Go: the coffee house inside FAEI. Its menu lives in public/v8.json (edited from
// the developer's "V8" tab in /admin) and opens in its own black-and-white window with its own
// cart. Orders go to V8's WhatsApp and to the "V8" list on the orders screen.
// Nothing shows before launchAt, except on a phone that opened the site once with ?v8.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Citrus, Coffee, CupSoda, GlassWater, Leaf, Milk, Minus, Plus, ShoppingBag, X, type LucideIcon } from 'lucide-react';

import data from '../public/v8.json';
import { isAvailable, products as faeiProducts, type Product } from './menu';
import { BRAND, clock12 } from './brand';
import TimePick from './TimePick';

type V8Menu = { launchAt?: string; whatsapp?: string; instagram?: string; categories: string[]; products: Product[] };
const v8 = data as V8Menu;
const CART_KEY = 'v8-cart-v1';
const PREVIEW_KEY = 'faei-v8-preview';
const FALLBACK_WHATSAPP = BRAND.whatsapp;
// Same delivery price as the main shop.
const DELIVERY_FILS = BRAND.delivery.insideFils;

// V8's items can also ride along in FAEI's cart (one order, one delivery fee).
export const v8Products: Product[] = v8.products;
// "بتكمّل طلبك؟" inside V8 suggests only V8's own small extras (never FAEI food). No fixed price: they go in the notes.
export const V8_EXTRAS = [{ name: 'كوكيز', emoji: '🍪' }, { name: 'مي', emoji: '💧' }];

type Entry = { id: string; quantity: number };

// The English titles and icons from V8's printed menu; a new section added from /admin gets a cup.
const SECTION_LOOK: Record<string, { en: string; icon: LucideIcon }> = {
  'القهوة': { en: 'Coffee', icon: Coffee },
  'سموذي': { en: 'Smoothies', icon: CupSoda },
  'عصائر طبيعية': { en: 'Fresh Juice', icon: Citrus },
  'موهيتو': { en: 'Mojito', icon: Leaf },
  'ميلك شيك': { en: 'Milk Shakes', icon: Milk },
  'شاي مثلج': { en: 'Ice Tea', icon: GlassWater },
};
const lookOf = (category: string) => SECTION_LOOK[category] ?? { en: '', icon: CupSoda };

function previewing(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('v8')) localStorage.setItem(PREVIEW_KEY, '1');
    if (params.has('no-v8')) localStorage.removeItem(PREVIEW_KEY);
    return localStorage.getItem(PREVIEW_KEY) === '1';
  } catch { return false; }
}
const launched = () => !v8.launchAt || Date.now() >= Date.parse(v8.launchAt);
// FAEI's cart offers V8's drinks only once V8 shows on this phone.
// Off for good when brand.json says there is no shop inside (innerShop: false).
export const v8Visible = () => BRAND.innerShop && (launched() || previewing());

// When the customer already has FAEI food in the cart, V8's drinks go straight into that cart.
export type Joined = { quantity: (id: string) => number; change: (id: string, delta: number) => void; merge: (entries: Entry[]) => void; count: number; totalFils: number; openCart: () => void };

function money(fils: number): string {
  const dinars = Math.floor(fils / 1000);
  const remainder = fils % 1000;
  return `${dinars}${remainder ? `.${String(remainder).padStart(3, '0').replace(/0+$/, '')}` : ''} د.أ`;
}
function resolve(id: string) {
  const [productId, index] = id.split('::');
  const product = v8.products.find((item) => item.id === productId);
  const option = product?.options[Number(index)];
  if (!product || !option || product.available === false) return null;
  return { product, option, name: `${product.name}${option.label ? ` (${option.label})` : ''}` };
}
function readCart(): Entry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as Entry[];
    return Array.isArray(saved) ? saved.filter((entry) => resolve(entry.id) && entry.quantity > 0) : [];
  } catch { return []; }
}
function whatsappNumber(): string {
  const digits = (v8.whatsapp ?? '').replace(/\D/g, '').replace(/^(00962|962)/, '').replace(/^0/, '');
  return /^7[789]\d{7}$/.test(digits) ? `962${digits}` : FALLBACK_WHATSAPP;
}

export default function V8Section({ phone, phoneNumber, onPhone, open, setOpen, joined }: { phone: string; phoneNumber: string; onPhone: (value: string) => void; open: boolean; setOpen: (open: boolean) => void; joined: Joined }) {
  const [shown] = useState(v8Visible);
  // A visit that crosses the launch moment shows the card without a reload.
  const [, tick] = useState(0);
  useEffect(() => {
    if (shown || !v8.launchAt) return;
    const wait = Date.parse(v8.launchAt) - Date.now();
    if (wait > 0 && wait < 86_400_000) { const timer = window.setTimeout(() => tick((n) => n + 1), wait + 500); return () => window.clearTimeout(timer); }
  }, [shown]);
  // The phone's back button closes the window instead of leaving the site.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ v8: true }, '');
    const onBack = () => setOpen(false);
    window.addEventListener('popstate', onBack);
    document.documentElement.classList.add('v8-locked');
    return () => { window.removeEventListener('popstate', onBack); document.documentElement.classList.remove('v8-locked'); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  function close() {
    if ((window.history.state as { v8?: boolean } | null)?.v8) window.history.back(); else setOpen(false);
  }
  if (!shown && !launched()) return null;
  return (
    <>
      <button type="button" className="v8-card" onClick={() => setOpen(true)} data-testid="button-v8">
        <span className="v8-card-text">
          <img src="/images/v8/v8-logo.webp" alt="V8 Coffee To Go" width={58} height={58} />
          <span className="v8-script">Fuel your Uni Days</span>
          <b lang="en">V8 Coffee To Go</b>
          <small>قهوة، سموذي، موهيتو وعصاير، جوا {BRAND.nameAr}</small>
          <em>افتح منيو V8 <ArrowLeft size={15} aria-hidden="true" /></em>
        </span>
      </button>
      {open && <V8Window phone={phone} phoneNumber={phoneNumber} onPhone={onPhone} onClose={close} joined={joined.count > 0 ? joined : null} onMoveToFaei={(entries) => { joined.merge(entries); close(); window.setTimeout(joined.openCart, 60); }} onOpenFaeiCart={() => { close(); window.setTimeout(joined.openCart, 60); }} />}
    </>
  );
}

function V8Window({ phone, phoneNumber, onPhone, onClose, onMoveToFaei, onOpenFaeiCart, joined }: { phone: string; phoneNumber: string; onPhone: (value: string) => void; onClose: () => void; onMoveToFaei: (entries: Entry[]) => void; onOpenFaeiCart: () => void; joined: Joined | null }) {
  const [category, setCategory] = useState(v8.categories[0] ?? '');
  const [cart, setCart] = useState<Entry[]>(readCart);
  const [checkout, setCheckout] = useState(false);
  const [notes, setNotes] = useState('');
  // The turkey toast moves this cart into FAEI's, where it's offered in white or brown bread.
  const turkeyToast = faeiProducts.some((product) => product.id === 'toast-turkey' && isAvailable(product));
  const [timeMode, setTimeMode] = useState<'asap' | 'later'>('asap');
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const when = timeMode === 'asap' ? 'بأسرع وقت' : pickupTime && clock12(pickupTime);
  const missingTime = timeMode === 'later' && !pickupTime;
  const missingAddress = delivery && !address.trim();
  const [sent, setSent] = useState('');
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* fine */ } }, [cart]);
  // With FAEI food already in the cart, anything left in V8's own cart joins it.
  useEffect(() => { if (joined && cart.length) { joined.merge(cart); setCart([]); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines = cart.flatMap((entry) => { const line = resolve(entry.id); return line ? [{ ...line, id: entry.id, quantity: entry.quantity }] : []; });
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemsFils = lines.reduce((sum, line) => sum + line.option.priceFils * line.quantity, 0);
  const total = itemsFils + (delivery ? DELIVERY_FILS : 0);
  const quantity = (id: string) => (joined ? joined.quantity(id) : cart.find((entry) => entry.id === id)?.quantity ?? 0);
  function change(id: string, delta: number) {
    if (joined) { joined.change(id, delta); return; }
    setCart((current) => {
      const found = current.find((entry) => entry.id === id);
      if (!found) return delta > 0 ? [...current, { id, quantity: 1 }] : current;
      return current.map((entry) => (entry.id === id ? { ...entry, quantity: Math.min(99, entry.quantity + delta) } : entry)).filter((entry) => entry.quantity > 0);
    });
  }
  useEffect(() => { if (!count) setCheckout(false); }, [count]);

  function send() {
    if (!lines.length || !phoneNumber || missingTime || missingAddress) return;
    const now = new Date();
    const orderId = `V${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(Math.random() * 90 + 10)}`;
    const ref = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]).join('');
    const itemsText = lines.map((line) => `• ${line.name} × ${line.quantity}: ${money(line.option.priceFils * line.quantity)}`).join('\n');
    const message = `مرحباً V8، بدي أطلب (رقم ${orderId}):\n\n${itemsText}\n${notes.trim() ? `\nملاحظات: ${notes.trim()}\n` : ''}\n${delivery ? `توصيل جوا الجامعة\nالعنوان: ${address.trim()}` : 'الاستلام من V8 جوا الفَيّ'}\nالوقت: ${timeMode === 'asap' ? 'بأسرع وقت' : `الساعة ${clock12(pickupTime)}`}\nرقم تلفوني: ${phoneNumber}\n\n${delivery ? `الأصناف: ${money(itemsFils)}\nالتوصيل: ${money(DELIVERY_FILS)}\n` : ''}الإجمالي: ${money(total)}\n\nشكراً!`;
    try {
      fetch('/api/orders', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref, id: orderId, shop: 'v8',
          items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.option.priceFils / 1000 })),
          extras: notes.trim(), fulfillment: delivery ? 'توصيل جوا الجامعة' : 'استلام من V8', address: delivery ? address.trim() : '', phone: phoneNumber,
          time: when, payment: 'كاش', preorder: false, discount: 0, delivery: delivery ? DELIVERY_FILS / 1000 : 0, total: total / 1000,
        }),
      }).catch(() => {});
    } catch { /* The order still goes to WhatsApp. */ }
    setCart([]);
    setNotes('');
    setSent(orderId);
    const url = `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(message)}`;
    if (/Android|iPhone|iPad|iPod|Instagram|FBAN|FBAV|Snapchat|TikTok/i.test(navigator.userAgent)) { window.location.href = url; return; }
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null; else window.location.assign(url);
  }

  const listRef = useRef<HTMLDivElement>(null);
  // The tab follows whichever section is on screen while scrolling.
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const top = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setCategory((top.target as HTMLElement).dataset.category ?? '');
    }, { root, rootMargin: '-150px 0px -60% 0px' });
    root.querySelectorAll('[data-category]').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  function jump(name: string) {
    setCategory(name);
    const section = listRef.current?.querySelector<HTMLElement>(`[data-category="${name}"]`);
    if (section && listRef.current) listRef.current.scrollTo({ top: section.offsetTop - 70, behavior: 'smooth' });
  }

  return (
    <div className="v8-window" role="dialog" aria-modal="true" aria-label="منيو V8" data-testid="v8-window" ref={listRef}>
      <button type="button" className="v8-close" onClick={onClose} aria-label="سكّر"><X size={22} /></button>
      <header className="v8-hero">
        <img className="v8-hero-photo" src="/images/v8/v8-hero.webp" alt="" />
        <div className="v8-hero-text">
          <img src="/images/v8/v8-logo.webp" alt="V8 Coffee To Go" />
          <p className="v8-script">Good Coffee, Better Days</p>
        </div>
      </header>
      <ul className="v8-values" aria-hidden="true"><li><Coffee size={18} />Good coffee</li><li><Leaf size={18} />Good energy</li><li><CupSoda size={18} />Better days</li></ul>
      <div className="v8-catbar">
        <nav className="v8-cats" aria-label="أقسام V8">
          {v8.categories.map((item) => { const Icon = lookOf(item).icon; return <button key={item} type="button" className={item === category ? 'is-active' : ''} onClick={() => jump(item)}><Icon size={16} aria-hidden="true" />{item}</button>; })}
        </nav>
      </div>
      <div className="v8-list">
        {v8.categories.map((name) => {
          const look = lookOf(name);
          const Icon = look.icon;
          return (
            <section key={name} data-category={name} className="v8-section">
              <h3><Icon size={22} aria-hidden="true" />{look.en && <span className="v8-en">{look.en}</span>}<span className="v8-ar-title">{name}</span></h3>
              <ul>
                {v8.products.filter((product) => product.category === name).map((product) => {
                  const off = product.available === false;
                  // Hot and iced at the same price: the price shows once, beside the name.
                  const samePrice = product.options.every((option) => option.priceFils === product.options[0].priceFils);
                  const labelled = product.options.some((option) => option.label);
                  return (
                    <li key={product.id} className={`v8-item${off ? ' is-off' : ''}`} data-testid={`v8-item-${product.id}`}>
                      {product.image && <img src={product.image} alt="" loading="lazy" />}
                      <div className="v8-item-main">
                        {(() => {
                          // One button per option; a single-option drink keeps its button on the name's line.
                          const buttons = product.options.map((option, index) => {
                            const id = `${product.id}::${index}`;
                            const qty = quantity(id);
                            const text = `${option.label}${samePrice ? '' : ` · ${money(option.priceFils)}`}`;
                            return qty ? (
                              <span key={index} className="v8-stepper">{labelled && <span>{option.label}</span>}<button type="button" onClick={() => change(id, 1)} aria-label="زيد"><Plus size={14} /></button><i>{qty}</i><button type="button" onClick={() => change(id, -1)} aria-label="نقّص"><Minus size={14} /></button></span>
                            ) : (
                              <button key={index} type="button" className={`v8-add${labelled ? '' : ' is-round'}`} onClick={() => change(id, 1)} aria-label={`أضف ${product.name} ${option.label}`} data-testid={`v8-add-${product.id}-${index}`}><Plus size={15} />{labelled && text}</button>
                            );
                          });
                          return <>
                            <div className="v8-item-line"><b>{product.nameEn ? <><span lang="en" className="v8-name-main">{product.nameEn}</span>{product.nameEn !== product.name && <span className="v8-name-ar">{product.name}</span>}</> : product.name}</b><i aria-hidden="true" />{samePrice && <em>{money(product.options[0].priceFils)}</em>}{!labelled && !off && buttons}</div>
                            {off ? <small>مش متوفر هسه</small> : labelled && <div className="v8-options">{buttons}</div>}
                          </>;
                        })()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <div className="v8-foot">
          <span className="v8-script">Study · Coffee · Repeat</span>
          <span>الاستلام من V8 جوا {BRAND.nameAr}</span>
          {v8.instagram && <a href={v8.instagram} target="_blank" rel="noreferrer" className="v8-insta" data-testid="v8-instagram">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
            تابع V8 على إنستغرام
          </a>}
        </div>
      </div>
      {sent && !count && (
        <div className="v8-sent" data-testid="v8-sent"><b>انبعت طلبك ✅</b><span>رقم {sent}. استلمه من V8 جوا {BRAND.nameAr}.</span><button type="button" onClick={() => setSent('')} aria-label="سكّر"><X size={16} /></button></div>
      )}
      {joined && (
        <button type="button" className="v8-bar" onClick={onOpenFaeiCart} data-testid="v8-open-faei-cart"><ShoppingBag size={18} /> سلتك مع {BRAND.nameAr} · {joined.count} <b>{money(joined.totalFils)}</b></button>
      )}
      {!joined && count > 0 && !checkout && (
        <button type="button" className="v8-bar" onClick={() => setCheckout(true)} data-testid="v8-open-cart"><ShoppingBag size={18} /> السلة · {count} <b>{money(total)}</b></button>
      )}
      {!joined && checkout && count > 0 && (
        <section className="v8-cart" aria-label="سلة V8">
          <header><b>سلة V8</b><button type="button" onClick={() => setCheckout(false)} aria-label="رجوع للمنيو"><X size={18} /></button></header>
          <ul>
            {lines.map((line) => (
              <li key={line.id}>
                <span>{line.name}</span>
                <span className="v8-stepper"><button type="button" onClick={() => change(line.id, 1)} aria-label="زيد"><Plus size={14} /></button><i>{line.quantity}</i><button type="button" onClick={() => change(line.id, -1)} aria-label="نقّص"><Minus size={14} /></button></span>
                <em>{money(line.option.priceFils * line.quantity)}</em>
              </li>
            ))}
          </ul>
          <label>رقم تلفونك<input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(event) => onPhone(event.target.value)} placeholder="07XXXXXXXX" className={phone && !phoneNumber ? 'is-wrong' : ''} data-testid="v8-phone" /></label>
          <div className="v8-extras" aria-label="بتكمّل طلبك؟">
            <span>بتكمّل طلبك؟</span>
            <div>
              {turkeyToast && <button type="button" onClick={() => { const entries = cart; setCart([]); onMoveToFaei(entries); }} data-testid="v8-extra-toast">🥪 توست تيركي من {BRAND.nameAr}</button>}
              {V8_EXTRAS.map((extra) => {
                const parts = notes.split(/[،,]/).map((part) => part.trim()).filter(Boolean);
                const added = parts.includes(extra.name);
                return <button key={extra.name} type="button" className={added ? 'is-active' : ''} aria-pressed={added} onClick={() => setNotes(added ? parts.filter((part) => part !== extra.name).join('، ') : [...parts, extra.name].join('، '))} data-testid={`v8-extra-${extra.name}`}>{extra.emoji} {extra.name}{added ? ' ✓' : ''}</button>;
              })}
            </div>
          </div>
          <label>ملاحظات (اختياري)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثلاً: بدون سكر" maxLength={200} /></label>
          <div className="v8-time">
            <span>الاستلام</span>
            <div role="group" aria-label="طريقة الاستلام">
              <button type="button" className={!delivery ? 'is-active' : ''} onClick={() => setDelivery(false)} data-testid="v8-pickup">استلام من V8</button>
              <button type="button" className={delivery ? 'is-active' : ''} onClick={() => setDelivery(true)} data-testid="v8-delivery">توصيل +{money(DELIVERY_FILS)}</button>
            </div>
            {delivery && <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="وين بالزبط؟ (الكلية، القاعة…)" maxLength={200} data-testid="v8-address" />}
          </div>
          <div className="v8-time">
            <span>الوقت</span>
            <div role="group" aria-label="وقت الاستلام">
              <button type="button" className={timeMode === 'asap' ? 'is-active' : ''} onClick={() => setTimeMode('asap')} data-testid="v8-asap">بأسرع وقت</button>
              <button type="button" className={timeMode === 'later' ? 'is-active' : ''} onClick={() => setTimeMode('later')} data-testid="v8-later">بوقت معيّن</button>
            </div>
            {timeMode === 'later' && <TimePick value={pickupTime} onChange={setPickupTime} testId="v8-time" />}
          </div>
          <p className="v8-pickup">{delivery ? `التوصيل ${BRAND.delivery.inside} بس` : `استلام من V8 جوا ${BRAND.nameAr}`} · الدفع عند الاستلام</p>
          {!phoneNumber ? <p className="v8-warn">اكتب رقم تلفونك عشان تبعت الطلب.</p> : missingAddress ? <p className="v8-warn">اكتب وين نوصلك.</p> : missingTime && <p className="v8-warn">اختار الساعة اللي بدك تستلم فيها.</p>}
          <button type="button" className="v8-send" disabled={!phoneNumber || missingTime || missingAddress} onClick={send} data-testid="v8-send">إرسال الطلب · {money(total)}</button>
        </section>
      )}
    </div>
  );
}
