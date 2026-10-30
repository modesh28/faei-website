#!/usr/bin/env python3
"""Makes every app icon (site + admin panel) and the WhatsApp/Facebook share picture from the
logo and colours in src/brand.json, plus a .webp copy of each photo in public/images.

    pip install pillow
    python3 scripts/make-icons.py          # icons + webp copies
    python3 scripts/make-icons.py --og     # also redo public/og-image.jpg from the hero photo

The logo (brand.json images.logoPng) should be a PNG with a transparent background and a light
logo, since it sits on the dark "ink" colour.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
brand = json.loads((ROOT / 'src' / 'brand.json').read_text(encoding='utf-8'))
ink = brand['colors']['ink']
accent = brand['colors']['accent']
logo = Image.open(PUBLIC / brand['images']['logoPng'].lstrip('/')).convert('RGBA')
logo = logo.crop(logo.getbbox())


def tile(size, logo_width, top=None):
    """A square of the ink colour with the logo centred (or at `top`), logo_width as a share of size."""
    canvas = Image.new('RGBA', (size, size), ink)
    width = int(size * logo_width)
    height = int(logo.height * width / logo.width)
    if height > size * logo_width:  # tall logos: fit by height instead
        height = int(size * logo_width)
        width = int(logo.width * height / logo.height)
    mark = logo.resize((width, height), Image.LANCZOS)
    y = (size - height) // 2 if top is None else int(size * top)
    canvas.alpha_composite(mark, ((size - width) // 2, y))
    return canvas


def admin_badge(canvas):
    """The admin icon = site icon + a round accent badge with a list sign, so they look different."""
    size = canvas.width
    r = int(size * 0.13)
    cx, cy = size // 2, int(size * 0.76)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=accent)
    dot, line = max(2, r // 7), max(2, r // 9)
    for row in (-1, 0, 1):
        y = cy + row * int(r * 0.42)
        x0 = cx - int(r * 0.55)
        draw.ellipse((x0 - dot, y - dot, x0 + dot, y + dot), fill='white')
        draw.rounded_rectangle((x0 + dot * 2.4, y - line, cx + int(r * 0.6), y + line), radius=line, fill='white')
    return canvas


def save(image, name):
    image.convert('RGB').save(PUBLIC / name, optimize=True)
    print('wrote', name)


save(tile(192, 0.86), 'icon-192.png')
save(tile(512, 0.86), 'icon-512.png')
save(tile(512, 0.6), 'icon-maskable-512.png')  # Android crops maskable icons to a circle
save(tile(180, 0.86), 'apple-touch-icon.png')
for size, name in ((192, 'admin-icon-192.png'), (512, 'admin-icon-512.png'), (180, 'admin-apple-touch-icon.png')):
    save(admin_badge(tile(size, 0.72, top=0.2)), name)
save(admin_badge(tile(512, 0.5, top=0.27)), 'admin-icon-maskable-512.png')

# .webp next to every .jpg/.jpeg/.png photo that doesn't have one yet (the site shows the .webp).
for photo in (PUBLIC / 'images').rglob('*'):
    if photo.suffix.lower() in ('.jpg', '.jpeg', '.png') and not photo.with_suffix('.webp').exists():
        Image.open(photo).save(photo.with_suffix('.webp'), quality=82)
        print('wrote', photo.with_suffix('.webp').relative_to(PUBLIC))

if '--og' in sys.argv:
    # 1200x630: the hero photo, darkened at the bottom, with the logo on it.
    hero = Image.open(PUBLIC / brand['images']['heroJpg'].lstrip('/')).convert('RGBA')
    scale = max(1200 / hero.width, 630 / hero.height)
    hero = hero.resize((int(hero.width * scale) + 1, int(hero.height * scale) + 1), Image.LANCZOS)
    left, top = (hero.width - 1200) // 2, (hero.height - 630) // 2
    og = hero.crop((left, top, left + 1200, top + 630))
    shade = Image.new('L', (1, 630))
    for y in range(630):
        shade.putpixel((0, y), int(200 * max(0, (y - 200) / 430)))
    dark = Image.new('RGBA', (1200, 630), ink)
    dark.putalpha(shade.resize((1200, 630)))
    og.alpha_composite(dark)
    width = 420
    mark = logo.resize((width, int(logo.height * width / logo.width)), Image.LANCZOS)
    glow = mark.filter(ImageFilter.GaussianBlur(12))
    og.alpha_composite(glow, (60, 630 - mark.height - 50))
    og.alpha_composite(mark, (60, 630 - mark.height - 50))
    og.convert('RGB').save(PUBLIC / 'og-image.jpg', quality=86)
    print('wrote og-image.jpg')
