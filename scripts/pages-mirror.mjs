// Turns dist/ (built with --base=/faei-website/) into a copy that works on GitHub Pages at
// https://modesh28.github.io/faei-website/ : a backup address for networks that block vercel.app.
// Root paths ("/images/…", "/menu.json") get the folder in front; "/api/…" calls go to the Vercel server.
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/faei-website';
const API = 'https://faei-website.vercel.app/api';
const dist = new URL('../dist/', import.meta.url).pathname;
const names = 'images|assets|icon-|apple-touch-icon|admin-|og-image|manifest\\.webmanifest|menu\\.json|offer\\.json|settings\\.json|gallery\\.json|v8\\.json|sw\\.js|admin|robots\\.txt|sitemap\\.xml';
const pathRe = new RegExp(`(["'\`(=]\\s*)/(?!faei-website/)(${names})`, 'g');
const apiRe = /(["'`(]\s*)\/api(?=[/?"'`])/g;

let changed = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(js|css|html|json|webmanifest)$/.test(entry.name)) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(apiRe, `$1${API}`).replace(pathRe, `$1${BASE}/$2`);
    if (after !== before) { fs.writeFileSync(file, after); changed++; }
  }
};
walk(dist);
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`pages mirror: rewrote ${changed} files`);
