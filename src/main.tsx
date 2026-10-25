import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

import App from './App';
import './index.css';
import { products, categories } from './menu';

// Weak phones (few cores or little memory) and anyone asking for less motion get a lighter site:
// no photo scaling, fades or blur, so scrolling stays smooth.
{
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 3);
  if (weak || window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('lite');
}

// Lets the site install to the home screen and open without a connection.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

// An installed app can sit in the background for days. Whenever it comes back to the
// screen, check whether a newer version is live and reload into it.
if (import.meta.env.PROD) {
  const currentScript = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  let lastCheck = 0;
  const checkForUpdate = () => {
    if (document.visibilityState !== 'visible' || !currentScript || Date.now() - lastCheck < 30_000) return;
    lastCheck = Date.now();
    navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()).catch(() => {});
    fetch('/', { cache: 'no-store' })
      .then((response) => (response.ok ? response.text() : ''))
      .then((html) => {
        const latest = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
        if (!latest || latest === currentScript) return;
        // Never reload more than once every 5 minutes, so a stale cache can't cause a reload loop.
        try {
          const last = Number(sessionStorage.getItem('faei-auto-reload') ?? 0);
          if (Date.now() - last < 300_000) return;
          sessionStorage.setItem('faei-auto-reload', String(Date.now()));
        } catch { return; }
        window.location.reload();
      })
      .catch(() => {});
  };
  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
}

// The full menu with prices, as structured data, so Google can show it.
const menuData = {
  '@context': 'https://schema.org',
  '@type': 'Menu',
  name: 'منيو FAEI',
  url: 'https://faei-website.vercel.app/#menu',
  inLanguage: 'ar',
  hasMenuSection: categories.map((category) => ({
    '@type': 'MenuSection',
    name: category,
    hasMenuItem: products.filter((product) => product.category === category).map((product) => ({
      '@type': 'MenuItem',
      name: product.name,
      offers: product.options.map((option) => ({
        '@type': 'Offer',
        ...(option.label ? { name: option.label } : {}),
        price: (option.priceFils / 1000).toFixed(2),
        priceCurrency: 'JOD',
      })),
    })),
  })).filter((section) => section.hasMenuItem.length),
};
const menuScript = document.createElement('script');
menuScript.type = 'application/ld+json';
menuScript.textContent = JSON.stringify(menuData);
document.head.appendChild(menuScript);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
