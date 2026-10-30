// Which cafeteria this site is for. Everything that names the shop, its numbers, hours, photos
// and colours comes from src/brand.json, so a new cafeteria is a new brand.json + its photos and
// menu (see docs/NEW-CAFETERIA.md), not code changes.
import data from './brand.json';

export type GalleryPhoto = { src: string; alt: string; caption: string; size?: 'big' | 'tall'; position?: string };
export type Brand = {
  name: string;
  nameAr: string;
  kind: string;
  slogan: { start: string; highlight: string };
  description: string;
  shareText: string;
  siteUrl: string;
  place: string;
  address: { street: string; city: string; country: string };
  // International format without +, e.g. 962797607843.
  whatsapp: string;
  instagram: string;
  mapsUrl: string;
  // days: 0 = Sunday … 6 = Saturday; open / close as HH:MM, Jordan time.
  hours: { text: string; days: number[]; open: string; close: string };
  delivery: { insideFils: number; inside: string; outside: string };
  cliq: { alias: string; name: string };
  sheetUrl: string;
  cuisine: string[];
  priceRange: string;
  // bar (header/footer) and accent2 (button gradient end) are optional; left out, they're derived.
  colors: { ink: string; accent: string; gold: string; bar?: string; accent2?: string };
  images: { logo: string; logoPng: string; hero: string; heroJpg: string; heroAlt: string; heroPosition: string; share: string; shareAlt: string };
  galleryTitle: string;
  gallery: GalleryPhoto[];
  fridge: { title: string; drinks: { name: string; emoji: string }[] };
  extrasBanner: string;
  // FAEI's hand-drawn "how to reach us" map; another place starts with false.
  wayfinder: boolean;
  // A second shop inside this one (FAEI's V8 coffee), configured in public/v8.json.
  innerShop: boolean;
};

export const BRAND = data as Brand;

const toMinutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
export const OPEN_MINUTES = toMinutes(BRAND.hours.open);
export const CLOSE_MINUTES = toMinutes(BRAND.hours.close);
// "7:30 الصبح", "5:00 العصر": how the opening time is said in the "we open at" line.
export function timeInWords(time: string): string {
  const minutes = toMinutes(time);
  const hour = Math.floor(minutes / 60);
  const clock = `${hour > 12 ? hour - 12 : hour}:${String(minutes % 60).padStart(2, '0')}`;
  return `${clock} ${hour < 12 ? 'الصبح' : hour < 15 ? 'الظهر' : hour < 18 ? 'العصر' : 'المسا'}`;
}
