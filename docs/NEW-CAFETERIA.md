# Launching the site for a new cafeteria

This repo is the FAEI site (https://faei-website.vercel.app), built so the same code serves any
cafeteria. A new cafeteria is a copy of the repo with **its own `src/brand.json`, photos, menu
and Vercel project**. No code changes are needed for the usual case. Everything below is the
exact order of work, so a new site takes one sitting, not two weeks.

The person bringing the material (mohammad) uses the Arabic checklist in
[`جيبلي.md`](./جيبلي.md). Start by getting everything on it.

---

## 0. What the site is

| Part | What it does | Where |
|---|---|---|
| Customer site `/` | Menu by category, cart, delivery/pickup, time, cash or CliQ, sends the order on WhatsApp, logs it to the panel, shows a live "your order is ready in ~X min" card, open/closed badge, rush-hour badge, daily offer bar, reorder card, gallery, install-as-app, dark mode, lite mode for weak phones | `src/App.tsx`, `src/index.css` |
| Admin panel `/admin` | Orders (list / kitchen board with drag / full screen, sound + notification on new order), items (hide "مش متوفر", edit, add with photo, reorder), offer, sales (today/week, rush hours chart, sleeping items), customers + prize draw, accounts and roles, installable as its own app | `src/admin/Admin.tsx`, `src/admin/admin.css` |
| Server | Vercel functions with Upstash Redis: orders, popular items, busy check, accounts, GitHub proxy for the panel's saves | `api/*.ts` |
| Identity | Name, numbers, hours, photos, colours, texts | `src/brand.json` (read by `src/brand.ts` and `brand.config.ts`) |
| Menu | Categories + items + prices | `public/menu.json` (the panel edits it by committing to GitHub) |
| Offer | Top bar + optional % discount with an end date | `public/offer.json` |
| Settings | Google Sheet URL, CliQ alias and name | `public/settings.json` (edit on GitHub) |
| Inner shop | A second shop inside the cafeteria (FAEI has V8 coffee) with its own menu, cart, WhatsApp, orders list and staff role | `src/V8.tsx`, `public/v8.json`, `brand.json innerShop` |
| Wayfinder | FAEI's hand-drawn "how to reach us" map | `src/Wayfinder.tsx`, `brand.json wayfinder` |

Stack: Vite 7, React 19, TypeScript, Tailwind 4 (mostly plain CSS in `index.css`), lucide icons,
`@vercel/analytics`. Prices are integers in **fils** (1 JOD = 1000 fils). Time zone is always
`Asia/Amman`.

---

## 1. Copy the repo

Either:
- **GitHub "Use this template"/fork** of `modesh28/faei-website` into a new repo (e.g.
  `modesh28/<shop>-website`), or
- clone and push to a new empty repo:
  ```bash
  git clone https://github.com/modesh28/faei-website <shop>-website
  cd <shop>-website && git remote set-url origin https://github.com/<owner>/<shop>-website && git push -u origin main
  ```
The repo must be **public** or the panel's GitHub key needs `repo` instead of `public_repo`
scope (the panel's "get a key" link asks for `public_repo`).

The server finds its own repo from Vercel's `VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG`
(set automatically for Git-linked projects). Set `GITHUB_REPO=owner/name` only if that ever fails.

## 2. Fill `src/brand.json`

Every field, with FAEI's value as the example:

| Field | Meaning |
|---|---|
| `name` | Latin brand name: tab title, app name, WhatsApp greeting ("مرحباً FAEI") |
| `nameAr` | Arabic short name used inside sentences ("طلب فَيّ", "جوا الفَيّ"). Pick a form that reads after "من/مع/جوا" |
| `kind` | e.g. "مطعم ومقهى" (structured data only) |
| `slogan.start` + `slogan.highlight` | Hero headline; `highlight` is the coloured part. Also the page title `FAEI \| تعي نقعد بالفَيّ`. Keep the trailing space in `start` |
| `description` | Google description (one sentence, mention place + "اطلب على واتساب") |
| `shareText` | WhatsApp/Facebook link preview text |
| `siteUrl` | Final URL, no trailing slash (`https://<shop>.vercel.app` or the custom domain). Used by canonical, OG, sitemap, robots |
| `place` | Line under "وين إحنا؟" |
| `address.street/city/country` | Structured data |
| `whatsapp` | **International, no +**: `9627XXXXXXXX`. Orders go here |
| `instagram` | Full profile URL |
| `mapsUrl` | The shop's own Google Maps pin share link (`https://maps.app.goo.gl/...`) |
| `hours.text` | Human text shown on the site |
| `hours.days` | Open days, 0 = Sunday … 6 = Saturday. FAEI: `[0,1,2,3,4]` |
| `hours.open` / `hours.close` | `"HH:MM"` 24h. Drives open/closed badge, "we open tomorrow at…", ordering while closed |
| `delivery.insideFils` | Delivery price for the "inside" zone in fils (FAEI 1000) |
| `delivery.inside` / `outside` | Labels of the two zones ("جوا الجامعة"/"برا الجامعة"); outside price is agreed on WhatsApp |
| `cliq.alias` / `cliq.name` | CliQ alias (phone or alias) and the exact account holder name shown to customers. Fallback only; `public/settings.json` wins |
| `sheetUrl` | Apps Script web-app URL of the order log sheet, or `""` to skip (fallback; settings.json wins) |
| `cuisine` / `priceRange` | Structured data, e.g. `["شاورما","برغر"]`, `"JOD 0.5 - 8"` |
| `colors.ink` | Main dark colour: header, buttons, app icon background, theme-color |
| `colors.accent` | Links, active states, "tech" blue |
| `colors.gold` | Highlights (hero word, badges, offer) |
| `colors.bar` / `colors.accent2` | Optional: header/footer colour and the light end of the button gradient. Left out, they're derived from `ink`/`accent` |
| `images.logo` / `logoPng` | Logo webp (shown) and png (Google + icon script). **Transparent background, light-coloured logo** (it sits on `ink`) |
| `images.hero` / `heroJpg` / `heroAlt` / `heroPosition` | Hero photo (webp shown, jpg for Google), alt text, CSS object-position to keep the sign in frame |
| `images.share` / `shareAlt` | 1200×630 link preview (`/og-image.jpg`) |
| `galleryTitle` + `gallery[]` | Gallery heading and 6 photos `{src, alt, caption, size?: "big"\|"tall", position?}`. Layout is tuned for 6: one big, one tall, four normal |
| `fridge.title` + `fridge.drinks[]` | Quick-add drink chips in the cart `{name, emoji}` |
| `extrasBanner` | Line on the "extras" button (sweets, chips, …) |
| `wayfinder` | `false` for any new shop unless a new map is drawn in `Wayfinder.tsx` |
| `innerShop` | `false` unless the shop has a V8-style shop inside (then see §8) |

The site, the panel, both `<head>`s, both app manifests, `robots.txt` and `sitemap.xml` all come
from this file at build time (`brand.config.ts` is a Vite plugin; `src/brand.ts` for React code).

## 3. Photos and icons

1. Put files in `public/images/` (any names; reference them from `brand.json` and `menu.json`).
   Menu photos go in `public/images/menu/`. Prefer square-ish, ≤ 1600 px, jpeg.
2. Run:
   ```bash
   pip install pillow
   python3 scripts/make-icons.py --og
   ```
   This writes `icon-192/512/maskable-512.png`, `apple-touch-icon.png`, the four `admin-*` icons
   (same logo + accent badge, so the panel app looks different on the home screen), a `.webp` for
   every photo missing one, and `og-image.jpg` from the hero (drop `--og` to keep a hand-made one).
3. Look at the icons. If the logo is dark, ask for a light version or change `colors.ink`.

## 4. Menu: `public/menu.json`

```json
{
  "categories": ["شاورما", "برغر", "مشروبات"],
  "products": [
    {
      "id": "shawarma-sandwich",            // unique, latin-kebab; never change after launch (carts/orders keep it)
      "name": "ساندويش شاورما عادي",
      "category": "شاورما",                 // must be in categories
      "options": [{ "label": "", "priceFils": 750 }],   // one option = one price; several = sizes/types
      "image": "/images/menu/shawarma.jpeg",            // optional; no photo → a clean text card
      "alt": "ساندويش شاورما",
      "section": "معجنات كبير",             // optional sub-heading inside the category
      "available": true                      // false = "مش متوفر"
    }
  ]
}
```
- Category order = order on the site. Put photo-less categories last (they look weaker).
- Multi-size: `"options": [{"label":"صغير","priceFils":1000},{"label":"كبير","priceFils":1500}]`.
- "Make it a meal" upsell and suggestions work by name/category automatically.
- "الأكثر طلباً" badges come from real orders (top 4 of the last 14 days, ≥ 3 pieces); nothing to set.
- After launch the owner edits all of this from `/admin` → الأصناف.

Fast path from a photo of a paper menu: transcribe to the JSON above, ids in English kebab-case,
prices × 1000.

## 5. `public/offer.json` and `public/settings.json`

Offer (top bar). Start hidden:
```json
{ "show": false, "title": "", "text": "" }
```
Launch discount example (auto-hides after `endsAt`, discount applies to website orders only):
```json
{ "show": true, "title": "عرض الإطلاق", "text": "خصم 15% على كل المنيو لما تطلب من الموقع", "discountPercent": 15, "endsAt": "2026-10-30T00:00:00+03:00" }
```
Settings (edited on GitHub, there is no panel screen for it):
```json
{ "sheetUrl": "", "cliqAlias": "07XXXXXXXX", "cliqName": "ACCOUNT HOLDER NAME" }
```
Empty `cliqAlias` hides the CliQ option.

## 6. Clean FAEI leftovers

- Delete FAEI photos you don't use from `public/images/` (`faei-*`, menu photos), and
  `public/images/v8/` + `public/images/route/` if `innerShop`/`wayfinder` are off.
- If `innerShop` is false, reset `public/v8.json` to
  `{"categories": [], "products": []}` (the file must exist; it's imported).
- `public/sw.js`: bump `CACHE` name (e.g. `<shop>-v1`). Not required (different domain), just tidy.
- localStorage keys are prefixed `faei-` (cart, phone, theme…). They are per-domain, so they never
  clash; leave them.
- `README.md`: change the title lines.
- Search for leftovers: `grep -rn "FAEI\|فَيّ\|962797607843" src public/*.json` (comments are fine).

## 7. Build and check locally

```bash
npm install
npm run build          # tsc + vite; must pass
npm run dev            # http://localhost:5173 and /admin/
```
Check: header logo, hero text/photo, menu photos, open/closed badge at the right hours, cart →
WhatsApp message (name + number), dark mode button, `/admin/` login screen shows the new logo,
`dist/index.html` head has the new title/URL, `dist/manifest.webmanifest` has the new name.
(The `/api` routes don't run under `vite dev`; they run on Vercel.)

## 8. Optional: an inner shop (like V8)

Set `innerShop: true` and fill `public/v8.json`:
`{ "launchAt": "2026-11-01T09:00:00+03:00", "whatsapp": "07XXXXXXXX", "instagram": "...", "categories": [...], "products": [...] }`
(ids must start with `v8-`). Logo in `public/images/v8/v8-logo.webp`. The section, its colours
and the "V8" name are still hard-coded in `src/V8.tsx` + the `.v8-*` CSS; for a differently named
inner shop, rename the visible texts there. Before `launchAt` it only shows on a phone that opened
`/?v8` once. Its staff get the `v8` role in the panel.

## 9. Hosting: Vercel

1. vercel.com → **Add New → Project** → import the new GitHub repo. Framework: Vite (auto).
   Build `npm run build`, output `dist` (auto). Deploy.
2. Project name = subdomain (`<shop>.vercel.app`). Put that in `brand.json siteUrl` if it differs
   and push.
3. Custom domain (optional): Project → Settings → Domains.
4. Every push to `main` redeploys in ~1 minute. The panel's saves are commits, so they redeploy too.

## 10. Database: Upstash Redis (free) via Vercel Storage

1. Vercel → **Storage → Create Database → Upstash (Redis) → Free → Create**.
2. **Connect Project** → pick the new project → Connect. This adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` (the code also accepts `UPSTASH_REDIS_REST_URL`/`_TOKEN`).
3. **Redeploy** the latest deployment so the functions see the variables.
4. **One database per cafeteria.** Never connect two sites to the same Redis (orders, accounts and
   sessions would mix).

`/admin` shows these same steps in Arabic if the database is missing.

Keys in Redis (for debugging): `users` (hash of accounts), `session:*`, `config:github` (the GitHub
key), `config:roles`, `orders` (list of ids, newest first), `order:<id>`, `login-fail:<user>`,
customer data for the prize draw. Free tier = 10k commands/day; popular/busy are cached to stay
well under it.

## 11. First login: the developer account

1. Create a GitHub key: https://github.com/settings/tokens/new?scopes=public_repo (classic token,
   **no expiry**, scope `public_repo`) on the account that owns the repo.
2. Open `https://<shop>.vercel.app/admin/` → the setup screen asks for the GitHub key, a username
   (latin, ≥ 3) and a password (≥ 6). This creates the **dev** account and stores the key in Redis
   (it never reaches the browser again; the panel saves through `/api/github`).
3. In الحسابات create the owner's account (**إدارة**: orders, items, sales) and staff accounts
   (**موظف**: orders only). `v8` = inner-shop staff. Only dev sees العرض, الزباين, V8 and can
   add/remove accounts.
4. Send the owner the Arabic owner guide (FAEI's: https://claude.ai/artifact/SRcMco3nWvi1FrcVNw9nhz;
   duplicate it and change the name/links).

## 12. Optional: Google Sheet order log (Apps Script)

The panel already keeps every order, so this is optional; FAEI uses it as a spreadsheet backup.
mohammad dislikes manual Apps Script steps, so only do it if asked.
1. New Google Sheet → Extensions → Apps Script → paste [`docs/orders-sheet.gs`](./orders-sheet.gs).
2. Run `setup` once (authorise). Deploy → New deployment → Web app → Execute as **Me**, access
   **Anyone** → copy the `/exec` URL.
3. Put it in `public/settings.json` → `sheetUrl` and push.

## 13. Go-live checklist

- [ ] Place a real test order from a phone: WhatsApp opens to the right number with the right name;
      order appears in `/admin` with sound; mark ready → the customer's card says ready.
- [ ] CliQ shows the right alias and name.
- [ ] Open/closed badge right now is correct.
- [ ] Link preview on WhatsApp shows the new og-image and text (paste the URL in a chat).
- [ ] Install the site and the panel on a phone: two different icons and names.
- [ ] Google Business Profile: add the website URL.
- [ ] QR codes for tables/counter pointing to `siteUrl` (FAEI's print files are in the project
      files `faei-print/` and `launch/` as examples).
- [ ] Instagram bio link.

## 14. Lessons from FAEI (do these from day one)

- Replies to the owner/mohammad: short, Jordanian Arabic, "هسه" not "هلّق".
- No manual steps the client has to do in Apps Script or code; everything from `/admin`.
- Keep the design light: blue/ink "tech" look, little yellow, floating cards, dark mode.
- Photo-less categories last. Real photos beat stock.
- Rush hour is live (≥ 6 open orders or ≥ 6 in 20 min) and adds only +5 min; don't hard-code hours.
- Never write secrets (GitHub key, Redis tokens) into the repo or notes.
