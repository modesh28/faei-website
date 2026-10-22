// FAEI menu — real items and prices from the official menu (April 10).
// Prices are in fils: 1 JOD = 1000 fils, so 2.25 د.أ = 2250.

export const categories = [
  'شاورما',
  'برغر سماش',
  'تشكن برغر',
  'السناك',
  'بوكس فَيّ',
  'كساديا',
  'بيتزا',
  'كالزوني',
  'مناقيش',
  'ساندويش بارد',
  'السلطات',
] as const;

export type Category = (typeof categories)[number];

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
};

// Best sellers: all shawarma, everything zinger, and all the boxes.
function isPopular(id: string, category: Category): boolean {
  return category === 'شاورما' || category === 'بوكس فَيّ' || id.includes('zinger');
}

// To add a photo, put the file in public/images and add its path here, e.g. 'smash-classic': '/images/classic-burger.jpeg'.
const images: Partial<Record<string, string>> = {
  'shawarma-sandwich': '/images/menu/shawarma-sandwich.jpg',
  'shawarma-sandwich-super': '/images/menu/shawarma-sandwich.jpg',
  'shawarma-meal': '/images/menu/shawarma-meal.jpg',
  'shawarma-meal-super': '/images/menu/shawarma-meal.jpg',
  'shawarma-meal-double': '/images/menu/shawarma-meal.jpg',
  'shawarma-shilla': '/images/menu/shawarma-meal.jpg',
  'shawarma-toast': '/images/menu/toast2.jpg',
  'shawarma-italian': '/images/menu/shawarma-italian.jpg',
  'shawarma-halabi': '/images/menu/shawarma-halabi.jpg',
  'hotdog-classic': '/images/menu/hotdog.jpg',
  'hotdog-faei': '/images/menu/hotdog.jpg',
  'manakish-cheese-mix': '/images/menu/cheese-mix.jpg',
  'manakish-white-cheese': '/images/menu/cheese-mix.jpg',
  'manakish-zaatar-cheese': '/images/menu/zaatar-cheese.jpg',
  'cold-turkey': '/images/menu/turkey.jpg',
  'cold-turkey-cheese': '/images/menu/turkey.jpg',
  'manakish-salami': '/images/menu/salami.jpg',
  'manakish-turkey': '/images/menu/manakish-turkey.jpg',
  'cold-zaatar': '/images/menu/zaatar-sandwich.jpg',
  'snack-escalope': '/images/menu/chicken2.jpg',
};

// One photo for a whole category, used when an item has no photo of its own.
const categoryImages: Partial<Record<Category, string>> = {
  'شاورما': '/images/menu/shawarma.jpg',
  'برغر سماش': '/images/menu/smash2.jpg',
  'تشكن برغر': '/images/menu/chicken2.jpg',
  'السناك': '/images/menu/bbq2.jpg',
  'ساندويش بارد': '/images/menu/halloumi.jpg',
  'بوكس فَيّ': '/images/menu/boxes2.jpg',
  'كساديا': '/images/menu/quesadilla2.jpg',
  'بيتزا': '/images/menu/pizza2.jpg',
  'كالزوني': '/images/menu/calzone.jpg',
  'مناقيش': '/images/menu/manakeesh.jpg',
  'السلطات': '/images/menu/salads2.jpg',
};

// Items that don't look like their category's photo, so they stay without one.
const noCategoryImage = new Set(['hotdog-classic', 'hotdog-faei', 'salad-nachos']);

type Row = [id: string, name: string, ...prices: (number | null)[]];

function build(category: Category, labels: string[], rows: Row[]): Product[] {
  return rows.map(([id, name, ...prices]) => ({
    id,
    name,
    category,
    options: prices.flatMap((price, index) => price == null ? [] : [{ label: labels[index] ?? '', priceFils: Math.round(price * 1000) }]),
    image: images[id] ?? (noCategoryImage.has(id) ? undefined : categoryImages[category]),
    popular: isPopular(id, category),
  }));
}

export const products: Product[] = [
  ...build('شاورما', [''], [
    ['shawarma-sandwich', 'ساندويش شاورما عادي', 0.75],
    ['shawarma-sandwich-super', 'ساندويش شاورما سوبر', 1.30],
    ['shawarma-meal', 'وجبة شاورما عادي', 2.00],
    ['shawarma-meal-super', 'وجبة شاورما سوبر', 2.75],
    ['shawarma-meal-double', 'وجبة شاورما دبل', 3.45],
    ['shawarma-shilla', 'وجبة شلة', 8.00],
    ['shawarma-toast', 'وجبة شاورما توست', 3.00],
    ['shawarma-italian', 'وجبة شاورما إيطالي', 3.50],
    ['shawarma-halabi', 'وجبة شاورما حلبي', 3.50],
  ]),
  ...build('برغر سماش', ['ساندويش', 'وجبة'], [
    ['smash-classic', 'كلاسيك برغر', 2.50, 3.00],
    ['smash-cheese', 'تشيز برغر', 2.50, 3.00],
    ['smash-hot-beef', 'هوت بيف', 2.50, 3.00],
    ['smash-mushroom', 'ماشروم برغر', 2.75, 3.25],
    ['smash-egg', 'برغر بيض', 2.50, 3.25],
  ]),
  ...build('تشكن برغر', ['ساندويش', 'وجبة'], [
    ['chicken-grill', 'جريل تشكن', 2.25, 3.00],
    ['chicken-honey-mayo', 'هاني مايو', 2.00, 2.75],
    ['chicken-hot', 'هوت تشيكن', 2.00, 2.75],
    ['hotdog-classic', 'هوت دوغ كلاسيك', 2.00, 2.75],
    ['hotdog-faei', 'هوت دوغ فَيّ', 2.25, 3.00],
  ]),
  ...build('السناك', ['صغير', 'سوبر', 'تورتيلا'], [
    ['snack-fajita', 'فاهيتا', 1.25, 1.50, 1.75],
    ['snack-alfredo', 'ألفريدو', 1.25, 1.50, 1.75],
    ['snack-zinger', 'زنجر', 1.25, 1.50, 1.75],
    ['snack-zinger-plus', 'زنجر بلس +', null, 1.50, 1.75],
    ['snack-zinger-bbq', 'زنجر باربيكيو', 1.25, 1.50, 1.75],
    ['snack-escalope', 'سكالوب', null, 1.25, null],
    ['snack-bbq', 'باربيكيو', 1.25, 1.50, 1.75],
    ['snack-curry', 'دجاج بالكاري', 1.25, 1.50, 1.75],
    ['snack-twister', 'تويستر', null, 1.75, null],
    ['snack-shish', 'شيش', null, 1.50, 1.75],
    ['snack-cordon-bleu', 'كوردن بلو', null, 1.50, null],
  ]),
  ...build('بوكس فَيّ', ['صغير', 'كبير'], [
    ['box-zinger', 'بوكس زنجر', 2.00, 2.75],
    ['box-alfredo', 'بوكس ألفريدو', 2.25, 3.25],
    ['box-curry', 'بوكس كاري', 2.25, 3.25],
    ['box-shawarma', 'بوكس شاورما', 2.25, 3.25],
    ['box-mexican', 'بوكس مكسيكي', 2.25, 3.25],
    ['box-edman', 'بوكس إدمان', 2.00, 2.75],
    ['box-buffalo', 'بوكس بافلو', 2.25, 3.25],
    ['box-honey-mustard', 'بوكس هاني ماسترد', 2.25, 2.75],
    ['box-bbq', 'بوكس باربكيو', 2.25, 3.25],
  ]),
  ...build('كساديا', [''], [
    ['quesadilla-veggie', 'كساديا خضار', 1.50],
    ['quesadilla-alfredo', 'كساديا ألفريدو', 2.00],
    ['quesadilla-honey-mustard', 'كساديا هاني ماسترد', 2.00],
  ]),
  ...build('بيتزا', [''], [
    ['pizza-veggie', 'بيتزا خضار', 3.00],
    ['pizza-pepperoni', 'بيتزا بيروني', 3.00],
    ['pizza-salami', 'بيتزا سلامي', 3.00],
    ['pizza-turkey', 'بيتزا تيركي', 3.00],
    ['pizza-margherita', 'بيتزا مارغاريتا', 3.00],
    ['pizza-cheese-mix', 'بيتزا مكس أجبان', 3.00],
    ['pizza-shawarma', 'بيتزا شاورما', 3.00],
    ['pizza-four-seasons', 'بيتزا الفصول الأربعة', 3.00],
    ['pizza-alfredo', 'بيتزا ألفريدو', 3.00],
    ['pizza-fajita', 'بيتزا فاهيتا', 3.00],
    ['pizza-zinger', 'بيتزا زنجر', 3.00],
    ['pizza-faei', 'بيتزا فَيّ', 3.00],
  ]),
  ...build('كالزوني', [''], [
    ['calzone-alfredo', 'كالزوني ألفريدو', 3.00],
    ['calzone-fajita', 'كالزوني فاهيتا', 3.00],
    ['calzone-mexican', 'كالزوني مكسيكي', 3.00],
    ['calzone-zinger', 'كالزوني زنجر', 3.00],
  ]),
  ...build('مناقيش', [''], [
    ['manakish-cheese-mix', 'مكس أجبان', 1.50],
    ['manakish-white-cheese', 'جبنة بيضاء', 1.50],
    ['manakish-muhammara', 'محمرة وموزريلا', 1.50],
    ['manakish-salami', 'سلامي', 1.50],
    ['manakish-zaatar', 'زعتر', 0.75],
    ['manakish-zaatar-cheese', 'زعتر وجبنة', 1.00],
    ['manakish-turkey', 'تيركي', 1.50],
  ]),
  // The menu image doesn't name these two columns; "صغير / كبير" is our best reading — confirm with FAEI.
  ...build('ساندويش بارد', ['صغير', 'كبير'], [
    ['cold-luncheon-labneh', 'سنيورة ولبنة', 0.50, 0.60],
    ['cold-kashkaval', 'قشقوان', 1.00, 1.25],
    ['cold-cheese-mix', 'مكس أجبان', 1.00, 1.25],
    ['cold-turkey', 'تيركي', 0.75, 1.00],
    ['cold-turkey-cheese', 'تيركي وجبنة', 1.00, 1.25],
    ['cold-halloumi', 'حلوم', 1.00, 1.25],
  ]),
  ...build('ساندويش بارد', [''], [
    ['cold-zaatar', 'ساندويش زعتر', 1.50],
    ['cold-white-cheese', 'ساندويش جبنة بيضاء', 1.50],
  ]),
  ...build('السلطات', [''], [
    ['salad-caesar', 'سيزر', 2.00],
    ['salad-rocket', 'جرجير', 2.00],
    ['salad-greek', 'يونانية', 2.00],
    ['salad-coleslaw', 'كولسلو', 2.00],
    ['salad-fruit', 'فواكة', 2.00],
    ['salad-nachos', 'ناتشوز', 2.75],
  ]),
];
