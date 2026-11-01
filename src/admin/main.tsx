import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Admin from './Admin';
import './admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);

// Installs the panel as its own app (admin-manifest.webmanifest) and lets order notifications show.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Keep this page and its files on the device, so the cashier opens even with no internet.
    // (Same cache name as public/sw.js.)
    if (navigator.onLine && 'caches' in window) {
      const files = performance.getEntriesByType('resource').map((entry) => new URL(entry.name))
        .filter((url) => url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/')))
        .map((url) => url.pathname);
      caches.open('faei-v4').then((cache) => Promise.all(['/admin/', ...new Set(files)].map((path) => cache.add(path).catch(() => {})))).catch(() => {});
    }
  });
}
