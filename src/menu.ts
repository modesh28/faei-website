// FAEI menu. The items live in public/menu.json, which the admin page (/admin) edits,
// so prices, photos and "not available now" change without touching code.
// Prices are in fils: 1 JOD = 1000 fils, so 2.25 د.أ = 2250.
import menu from '../public/menu.json';

export type Category = string;

export type ProductOption = { label: string; priceFils: number };

export type Product = {
  id: string;
  name: string;
  category: Category;
  // One entry per size or type. A product with one price has a single option.
  options: ProductOption[];
  image?: string;
  alt?: string;
  // Shows the "الأكثر طلباً" badge.
  popular?: boolean;
  // false hides the add button and shows "مش متوفر".
  available?: boolean;
};

export type Menu = { categories: Category[]; products: Product[] };

export const categories: Category[] = (menu as Menu).categories;
export const products: Product[] = (menu as Menu).products;
export const isAvailable = (product: Product) => product.available !== false;
