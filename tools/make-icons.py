# -*- coding: utf-8 -*-
"""
Иконка приложения: пузырь сообщения, собранный из строк текста.

Замысел один и объясняется одной фразой: книга приходит сообщениями. Поэтому
не корешок и не буква — приложение маскируется под ленту, и иконка это первое
обещание. Проверялось на 48 пикселях: на этом размере от рисунка остаётся
силуэт, и силуэт обязан читаться.

Всё значимое лежит в центральном круге ⌀288 из 432: у адаптивной иконки
система обрезает углы по-разному — кругом, квадратом со скруглением, каплей.

Рисуем с четырёхкратным запасом и уменьшаем: у PIL нет сглаживания примитивов,
и без запаса края получаются рваными.
"""
import os

from PIL import Image, ImageDraw, ImageFont

RES = 'android/app/src/main/res'
OUT = 'docs/release/icons'          # то, что грузится руками в консоль
BG = (11, 11, 18)                   # #0b0b12 — фон приложения и @color/ic_launcher_background
SS = 4                              # запас для сглаживания

# Плотности: у адаптивной иконки холст 108dp, у устаревшей квадратной — 48dp.
FOREGROUND = [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]
LEGACY = [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]


def gradient(size, top, bottom):
    """Вертикальный переход. Полосами по строке — на наших размерах этого хватает."""
    w, h = size
    g = Image.new('RGB', (1, h))
    px = g.load()
    for y in range(h):
        k = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)


def glyph_mask(side, inset):
    """
    Маска пузыря со строками. `inset` — сколько пустого поля с каждой стороны
    в долях стороны: у адаптивной иконки поля много (обрежут), у устаревшей мало.
    """
    S = side * SS
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)

    pad = S * inset
    x0, y0, x1 = pad, pad * 1.06, S - pad
    y1 = y0 + (x1 - x0) * 0.74           # пузырь чуть приземистее квадрата
    r = (x1 - x0) * 0.24

    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    # Хвост слева снизу — без него это не пузырь, а карточка.
    tail = (x1 - x0) * 0.17
    d.polygon([(x0 + r * 0.55, y1 - tail * 0.5),
               (x0 + r * 0.55 + tail * 1.15, y1),
               (x0 + r * 0.2, y1 + tail * 1.05)], fill=255)

    # Три строки текста вырезаны насквозь: на маленьком размере именно они
    # превращают пузырь в «сообщение с текстом», а не в пустую каплю.
    inner = (x1 - x0) * 0.13
    lh = (y1 - y0 - inner * 2) / 5.2      # высота строки
    gap = lh * 0.72
    widths = (1.0, 0.82, 0.5)
    ly = y0 + inner + lh * 0.35
    for k, wf in enumerate(widths):
        lx1 = x0 + inner + (x1 - x0 - inner * 2) * wf
        d.rounded_rectangle([x0 + inner, ly, lx1, ly + lh], radius=lh / 2, fill=0)
        ly += lh + gap
        if k == 1:
            ly += gap * 0.1

    return m.resize((side, side), Image.LANCZOS)


def glyph_rgba(side, inset):
    """Пузырь с переходом, на прозрачном фоне."""
    m = glyph_mask(side, inset)
    g = gradient((side, side), (154, 128, 255), (78, 140, 255)).convert('RGBA')
    g.putalpha(m)
    return g


def round_mask(side):
    S = side * SS
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse([0, 0, S - 1, S - 1], fill=255)
    return m.resize((side, side), Image.LANCZOS)


def squircle_mask(side):
    S = side * SS
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.225, fill=255)
    return m.resize((side, side), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    return os.path.getsize(path)


written = []

# ---------- адаптивная иконка: только передний слой, фон задан цветом ----------
for name, side in FOREGROUND:
    img = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    img.alpha_composite(glyph_rgba(side, 0.255))       # содержимое внутри ⌀ 288/432
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher_foreground.png')
    written.append((p, save(img, p)))

# ---------- устаревшие иконки для Android 7 и старше ----------
for name, side in LEGACY:
    base = Image.new('RGBA', (side, side), BG + (255,))
    base.alpha_composite(glyph_rgba(side, 0.17))

    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(base, (0, 0), squircle_mask(side))
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher.png')
    written.append((p, save(sq, p)))

    rd = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    rd.paste(base, (0, 0), round_mask(side))
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher_round.png')
    written.append((p, save(rd, p)))

# ---------- иконка карточки Play: 512x512, без прозрачности ----------
store = Image.new('RGB', (512, 512), BG)
store.paste(glyph_rgba(512, 0.19), (0, 0), glyph_rgba(512, 0.19))
p = os.path.join(OUT, 'play-icon-512.png')
written.append((p, save(store, p)))

# ---------- баннер карточки: 1024x500 ----------
FONTS = ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf',
         'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf']


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


ban = gradient((1024, 500), (26, 22, 52), (11, 11, 18)).convert('RGBA')
# Пятно света за иконкой, чтобы баннер не был плоским.
glow = Image.new('RGBA', (1024, 500), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([40, 30, 500, 470], fill=(124, 92, 255, 46))
ban.alpha_composite(glow)

icon = glyph_rgba(300, 0.06)
ban.alpha_composite(icon, (120, 100))

d = ImageDraw.Draw(ban)
# Название подгоняем по ширине по той же причине, что и подпись: имя из
# двух латинских слов вдвое длиннее прежней аббревиатуры и на 96 кеглях
# уезжает за правый край.
NAME = 'Scrool Book'
size = 96
while size > 48 and d.textlength(NAME, font=font(size)) > 470:
    size -= 4
# Опускаем строку на половину съеденной высоты, чтобы блок остался на месте.
d.text((470, 168 + (96 - size) * 0.35), NAME, font=font(size), fill=(255, 255, 255))
# Подпись подгоняем по ширине: у баннера края обрезаются в разных местах
# карточки, и текст, доходящий до кромки, там теряет последние буквы.
TAG = 'Книга приходит сообщениями'
size = 32
while size > 18 and d.textlength(TAG, font=font(size)) > 470:
    size -= 2
d.text((474, 300), TAG, font=font(size), fill=(190, 182, 222))
p = os.path.join(OUT, 'play-feature-1024x500.png')
written.append((p, save(ban.convert('RGB'), p)))

# ---------- лист для просмотра: как иконка выглядит мелко ----------
sheet = Image.new('RGB', (760, 300), (24, 24, 34))
x = 40
for side in (192, 96, 72, 48):
    base = Image.new('RGBA', (side, side), BG + (255,))
    base.alpha_composite(glyph_rgba(side, 0.17))
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(base, (0, 0), squircle_mask(side))
    sheet.paste(sq, (x, 30), sq)
    rd = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    rd.paste(base, (0, 0), round_mask(side))
    sheet.paste(rd, (x, 250 - side), rd)
    x += side + 34
p = os.path.join(OUT, 'preview.png')
written.append((p, save(sheet, p)))

total = sum(s for _, s in written)
print('записано %d файлов, %.1f кБ' % (len(written), total / 1024.0))
for path, size in written:
    print('  %-64s %5.1f кБ' % (path.replace('\\', '/'), size / 1024.0))
