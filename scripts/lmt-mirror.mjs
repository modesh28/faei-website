// Backup address for LMT.COFFEE: https://modesh28.github.io/faei-website/lmt/
// Some networks block vercel.app, and the LMT repo is private (GitHub Pages can't serve it),
// so this copies the live LMT site from Vercel into dist/lmt/ and fixes its paths for GitHub Pages.
// Runs inside the "Backup copy on GitHub Pages" workflow (on every FAEI push and every 15 minutes),
// so LMT menu edits made from its panel reach this copy within ~15 minutes.
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.LMT_SRC || 'https://lmt-coffee.vercel.app';
const LIVE = 'https://lmt-coffee.vercel.app';
const BASE = '/faei-website/lmt';
const API = `${LIVE}/api`;
const final = new URL('../dist/lmt/', import.meta.url).pathname;
const out = new URL('../dist/lmt-tmp/', import.meta.url).pathname; // moved to dist/lmt only when the copy is complete

const seeds = ['/', '/admin/', '/manifest.webmanifest', '/admin-manifest.webmanifest', '/sw.js', '/menu.json', '/offer.json',
  '/settings.json', '/gallery.json', '/v8.json', '/robots.txt', '/og-image.jpg', '/apple-touch-icon.png', '/icon-192.png',
  '/icon-512.png', '/icon-maskable-512.png', '/admin-apple-touch-icon.png', '/admin-icon-192.png', '/admin-icon-512.png',
  '/admin-icon-maskable-512.png'];
const required = new Set(['/', '/admin/']);
const textExt = /\.(js|css|html|json|webmanifest|txt|xml)$/;
const refRe = /\/(?:assets|images)\/[A-Za-z0-9_./%-]+\.(?:js|css|png|jpe?g|webp|svg|gif|avif|woff2?|mp4)|\/(?:admin-)?(?:apple-touch-icon|icon-[a-z0-9-]+)\.png/g;

const fileFor = (p) => path.join(out, p.endsWith('/') ? `${p}index.html` : p);
const seen = new Set();
const queue = [...seeds];
fs.rmSync(out, { recursive: true, force: true });

while (queue.length) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  seen.add(p);
  const res = await fetch(SRC + p + (p.endsWith('.json') ? `?t=${Date.now()}` : ''), { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    if (required.has(p)) throw new Error(`LMT mirror: ${p} -> ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = fileFor(p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  if (p.endsWith('/') || textExt.test(p)) for (const ref of buf.toString('utf8').match(refRe) ?? []) queue.push(decodeURI(ref));
}

// Same fixes as pages-mirror.mjs, for the /faei-website/lmt/ folder. Storage keys are renamed
// ("faei-cart-v2" -> "lmt-cart-v2"...) because both sites now share one address (modesh28.github.io).
const names = 'images|assets|icon-|apple-touch-icon|admin-|og-image|manifest\\.webmanifest|menu\\.json|offer\\.json|settings\\.json|gallery\\.json|v8\\.json|sw\\.js|admin|robots\\.txt|sitemap\\.xml';
const pathRe = new RegExp(`(["'\`(=]\\s*)/(?!faei-website/)(${names})`, 'g');
const apiRe = /(["'`(]\s*)\/api(?=[/?"'`])/g;
const keyRe = /(["'`])faei-(?!(?:app|shell)["'`])/g;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!textExt.test(entry.name)) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before.replace(apiRe, `$1${API}`).replace(pathRe, `$1${BASE}/$2`);
    if (entry.name.endsWith('.js')) after = after.replace(keyRe, '$1lmt-');
    if (entry.name.endsWith('.webmanifest')) after = after.replace(/("(?:start_url|scope|id)"\s*:\s*")\/(?!faei-website\/)/g, `$1${BASE}/`);
    if (after !== before) fs.writeFileSync(file, after);
  }
};
walk(out);
fs.rmSync(final, { recursive: true, force: true });
fs.renameSync(out, final);
console.log(`lmt mirror: copied ${seen.size} paths`);
