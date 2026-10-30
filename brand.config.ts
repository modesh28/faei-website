// Turns src/brand.json (the one file that says which cafeteria this is) into the parts of the
// site that can't read JSON at runtime: the <head> of both pages, the two app manifests and the
// brand colours. Used by vite.config.ts; nothing here needs editing for a new cafeteria.
import fs from 'node:fs';
import type { Plugin } from 'vite';

type Brand = {
  name: string; nameAr: string; kind: string; slogan: { start: string; highlight: string };
  description: string; shareText: string; siteUrl: string; whatsapp: string; instagram: string; mapsUrl: string;
  hours: { days: number[]; open: string; close: string }; address: { street: string; city: string; country: string };
  cuisine: string[]; priceRange: string; colors: { ink: string; accent: string; gold: string; bar?: string; accent2?: string };
  images: { logoPng: string; heroJpg: string; share: string; shareAlt: string };
};

const read = (): Brand => JSON.parse(fs.readFileSync(new URL('./src/brand.json', import.meta.url), 'utf8')) as Brand;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function head(brand: Brand): string {
  const url = brand.siteUrl.replace(/\/$/, '');
  const title = `${brand.name} | ${brand.slogan.start}${brand.slogan.highlight}`;
  const place = {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    name: `${brand.name} | ${brand.nameAr}`,
    alternateName: `كافتيريا ${brand.nameAr}`,
    description: brand.description,
    url: `${url}/`,
    image: `${url}${brand.images.heroJpg}`,
    logo: `${url}${brand.images.logoPng}`,
    telephone: `+${brand.whatsapp}`,
    servesCuisine: brand.cuisine,
    priceRange: brand.priceRange,
    currenciesAccepted: 'JOD',
    paymentAccepted: 'Cash, CliQ',
    acceptsReservations: false,
    hasMenu: `${url}/#menu`,
    address: { '@type': 'PostalAddress', streetAddress: brand.address.street, addressLocality: brand.address.city, addressCountry: brand.address.country },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: brand.hours.days.map((day) => DAYS[day]), opens: brand.hours.open, closes: brand.hours.close }],
    hasMap: brand.mapsUrl,
    sameAs: [brand.instagram],
  };
  return [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(brand.description)}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(brand.shareText)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:image" content="${url}${brand.images.share}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta name="twitter:image" content="${url}${brand.images.share}" />`,
    `<meta property="og:image:alt" content="${escape(brand.images.shareAlt)}" />`,
    `<meta property="og:site_name" content="${escape(brand.name)}" />`,
    `<meta property="og:url" content="${url}/" />`,
    '<meta property="og:locale" content="ar_JO" />',
    `<link rel="canonical" href="${url}/" />`,
    `<script type="application/ld+json">${JSON.stringify(place)}</script>`,
    `<meta name="apple-mobile-web-app-title" content="${escape(brand.name)}" />`,
  ].join('\n    ');
}

// Mixes a #rrggbb colour toward another by `amount` (0..1), for the shades brand.json may leave out.
function mix(hex: string, toward: string, amount: number): string {
  const channels = (value: string) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const [a, b] = [channels(hex), channels(toward)];
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

// bar = header/footer (a bit darker than ink); accent2 = the light end of the button gradient.
const colors = ({ colors: c }: Brand) => {
  const bar = c.bar ?? mix(c.ink, '#000000', 0.15);
  const accent2 = c.accent2 ?? mix(c.accent, '#ffffff', 0.3);
  return `<style>:root{--brand-ink:${c.ink};--brand-bar:${bar};--brand-accent:${c.accent};--brand-accent-2:${accent2};--brand-gold:${c.gold}}</style>`;
};

function manifests(brand: Brand): Record<string, string> {
  const base = { lang: 'ar', dir: 'rtl', display: 'standalone', background_color: brand.colors.ink, theme_color: brand.colors.ink };
  return {
    'manifest.webmanifest': JSON.stringify({
      name: `${brand.name} | ${brand.nameAr}`, short_name: brand.name, description: `منيو ${brand.name} واطلب على واتساب`,
      ...base, start_url: '/?from=app', scope: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }, null, 2),
    'admin-manifest.webmanifest': JSON.stringify({
      id: '/admin/', name: `لوحة ${brand.name}`, short_name: `لوحة ${brand.name}`, description: `طلبات ${brand.name} ومبيعاتها والأصناف`,
      ...base, start_url: '/admin/', scope: '/admin/',
      icons: [
        { src: '/admin-icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/admin-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }, null, 2),
  };
}

// The files Vite emits next to the pages: both app manifests, robots.txt and sitemap.xml.
function files(brand: Brand): Record<string, string> {
  const url = brand.siteUrl.replace(/\/$/, '');
  return {
    ...manifests(brand),
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${url}/sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc></url>\n</urlset>\n`,
  };
}

const TYPES: Record<string, string> = { webmanifest: 'application/manifest+json', txt: 'text/plain', xml: 'application/xml' };

export default function brandPlugin(): Plugin {
  return {
    name: 'cafeteria-brand',
    transformIndexHtml(html) {
      const brand = read();
      return html
        .replace('<!--brand-head-->', head(brand))
        .replace('<!--brand-colors-->', colors(brand))
        .replace(/%BRAND_NAME%/g, escape(brand.name))
        .replace(/%BRAND_INK%/g, brand.colors.ink);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = (request.url ?? '').replace(/^\//, '').split('?')[0];
        const file = files(read())[name];
        if (!file) return next();
        response.setHeader('Content-Type', TYPES[name.split('.').pop() ?? ''] ?? 'text/plain');
        response.end(file);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(files(read()))) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
