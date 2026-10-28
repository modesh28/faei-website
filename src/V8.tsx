// V8 Coffee To Go: the coffee house inside FAEI. Its menu lives in public/v8.json (edited from
// the developer's "V8" tab in /admin) and opens in its own black-and-white window with its own
// cart. Orders go to V8's WhatsApp and to the "V8" list on the orders screen.
// Nothing shows before launchAt, except on a phone that opened the site once with ?v8.
import { useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag, X } from 'lucide-react';

import data from '../public/v8.json';
import type { Product } from './menu';

type V8Menu = { launchAt?: string; whatsapp?: string; categories: string[]; products: Product[] };
const v8 = data as V8Menu;
const CART_KEY = 'v8-cart-v1';
const PREVIEW_KEY = 'faei-v8-preview';
const FALLBACK_WHATSAPP = '962797607843';

type Entry = { id: string; quantity: number };

function previewing(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('v8')) localStorage.setItem(PREVIEW_KEY, '1');
    if (params.has('no-v8')) localStorage.removeItem(PREVIEW_KEY);
    return localStorage.getItem(PREVIEW_KEY) === '1';
  } catch { return false; }
}
const launched = () => !v8.launchAt || Date.now() >= Date.parse(v8.launchAt);

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

export default function V8Section({ phone, phoneNumber, onPhone }: { phone: string; phoneNumber: string; onPhone: (value: string) => void }) {
  const [shown] = useState(() => launched() || previewing());
  const [open, setOpen] = useState(false);
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
  }, [open]);
  function close() {
    if ((window.history.state as { v8?: boolean } | null)?.v8) window.history.back(); else setOpen(false);
  }
  if (!shown && !launched()) return null;
  return (
    <>
      <button type="button" className="v8-card" onClick={() => setOpen(true)} data-testid="button-v8">
        <img src="/images/v8/v8-logo.webp" alt="V8 Coffee To Go" width={56} height={56} />
        <span><b>V8 Coffee To Go</b><small>قهوة، سموذي، موهيتو وعصاير، جوا الفَيّ</small></span>
        <em>المنيو <ArrowLeft size={15} aria-hidden="true" /></em>
      </button>
      {open && <V8Window phone={phone} phoneNumber={phoneNumber} onPhone={onPhone} onClose={close} />}
    </>
  );
}

function V8Window({ phone, phoneNumber, onPhone, onClose }: { phone: string; phoneNumber: string; onPhone: (value: string) => void; onClose: () => void }) {
  const [category, setCategory] = useState(v8.categories[0] ?? '');
  const [cart, setCart] = useState<Entry[]>(readCart);
  const [checkout, setCheckout] = useState(false);
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState('');
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* fine */ } }, [cart]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines = cart.flatMap((entry) => { const line = resolve(entry.id); return line ? [{ ...line, id: entry.id, quantity: entry.quantity }] : []; });
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.option.priceFils * line.quantity, 0);
  const quantity = (id: string) => cart.find((entry) => entry.id === id)?.quantity ?? 0;
  function change(id: string, delta: number) {
    setCart((current) => {
      const found = current.find((entry) => entry.id === id);
      if (!found) return delta > 0 ? [...current, { id, quantity: 1 }] : current;
      return current.map((entry) => (entry.id === id ? { ...entry, quantity: Math.min(99, entry.quantity + delta) } : entry)).filter((entry) => entry.quantity > 0);
    });
  }
  useEffect(() => { if (!count) setCheckout(false); }, [count]);

  function send() {
    if (!lines.length || !phoneNumber) return;
    const now = new Date();
    const orderId = `V${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}-${Math.floor(Math.random() * 90 + 10)}`;
    const ref = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]).join('');
    const itemsText = lines.map((line) => `• ${line.name} × ${line.quantity}: ${money(line.option.priceFils * line.quantity)}`).join('\n');
    const message = `مرحباً V8، بدي أطلب (رقم ${orderId}):\n\n${itemsText}\n${notes.trim() ? `\nملاحظات: ${notes.trim()}\n` : ''}\nالاستلام من V8 جوا الفَيّ\nرقم تلفوني: ${phoneNumber}\n\nالإجمالي: ${money(total)}\n\nشكراً!`;
    try {
      fetch('/api/orders', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref, id: orderId, shop: 'v8',
          items: lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.option.priceFils / 1000 })),
          extras: notes.trim(), fulfillment: 'استلام من V8', address: '', phone: phoneNumber,
          time: 'بأسرع وقت', payment: 'كاش', preorder: false, discount: 0, delivery: 0, total: total / 1000,
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

  const items = v8.products.filter((product) => product.category === category);
  return (
    <div className="v8-window" role="dialog" aria-modal="true" aria-label="منيو V8" data-testid="v8-window">
      <header className="v8-head">
        <img src="/images/v8/v8-logo.webp" alt="V8 Coffee To Go" />
        <p>قهوة جيدة لأيام أفضل</p>
        <button type="button" onClick={onClose} aria-label="سكّر"><X size={22} /></button>
      </header>
      <nav className="v8-cats" aria-label="أقسام V8">
        {v8.categories.map((item) => <button key={item} type="button" className={item === category ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
      </nav>
      <ul className="v8-list">
        {items.map((product) => {
          const off = product.available === false;
          // Hot and iced at the same price: show the price once, under the name.
          const samePrice = product.options.every((option) => option.priceFils === product.options[0].priceFils);
          return (
            <li key={product.id} className={`v8-item${off ? ' is-off' : ''}`} data-testid={`v8-item-${product.id}`}>
              {product.image && <img src={product.image} alt="" loading="lazy" />}
              <div className="v8-item-text">
                <b>{product.name}</b>
                {samePrice && <em>{money(product.options[0].priceFils)}</em>}
                {off && <small>مش متوفر هسه</small>}
              </div>
              <div className="v8-options">
                {product.options.map((option, index) => {
                  const id = `${product.id}::${index}`;
                  const qty = quantity(id);
                  return (
                    <div key={index} className="v8-option">
                      {option.label && <span>{option.label}</span>}
                      {!samePrice && <em>{money(option.priceFils)}</em>}
                      {off ? null : qty ? (
                        <span className="v8-stepper"><button type="button" onClick={() => change(id, 1)} aria-label="زيد"><Plus size={14} /></button><i>{qty}</i><button type="button" onClick={() => change(id, -1)} aria-label="نقّص"><Minus size={14} /></button></span>
                      ) : (
                        <button type="button" className="v8-add" onClick={() => change(id, 1)} aria-label={`أضف ${product.name} ${option.label}`} data-testid={`v8-add-${product.id}-${index}`}><Plus size={15} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {sent && !count && (
        <div className="v8-sent" data-testid="v8-sent"><b>انبعت طلبك ✅</b><span>رقم {sent}. استلمه من V8 جوا الفَيّ.</span><button type="button" onClick={() => setSent('')} aria-label="سكّر"><X size={16} /></button></div>
      )}
      {count > 0 && !checkout && (
        <button type="button" className="v8-bar" onClick={() => setCheckout(true)} data-testid="v8-open-cart"><ShoppingBag size={18} /> السلة · {count} <b>{money(total)}</b></button>
      )}
      {checkout && count > 0 && (
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
          <label>ملاحظات (اختياري)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثلاً: بدون سكر" maxLength={200} /></label>
          <p className="v8-pickup">الاستلام من V8 جوا الفَيّ · الدفع عند الاستلام</p>
          {!phoneNumber && <p className="v8-warn">اكتب رقم تلفونك عشان تبعت الطلب.</p>}
          <button type="button" className="v8-send" disabled={!phoneNumber} onClick={send} data-testid="v8-send">إرسال الطلب · {money(total)}</button>
        </section>
      )}
    </div>
  );
}
