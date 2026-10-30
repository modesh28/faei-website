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
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
