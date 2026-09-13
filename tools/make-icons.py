# -*- coding: utf-8 -*-
"""
Иконка приложения из рисунка владельца (tools/logo-source.png).

Рисунок — квадратная плашка: телефон со стрелкой вверх на фоне раскрытой
книги, под ним надпись «Scrool Book» — со старой опечаткой в имени, но в сборку
надпись не попадает (см. п. 1). В иконку рисунок попадает не целиком, и на
это три причины, каждая про то, как Android показывает иконки.

1. Надпись выброшена. Имя приложения система пишет сама, под значком. Второе
   имя внутри значка — это то же слово дважды, а на 48 пикселях (самый мелкий
   размер, который просит Android) буквы сливаются в серую полосу.

2. Плашка выброшена. У адаптивной иконки форму задаёт лаунчер: где-то круг,
   где-то квадрат со скруглением, где-то капля. Своя скруглённая рамка внутри
   чужой даёт квадрат в квадрате и полоску фона между ними.

3. Знак берётся вместе с куском родного фона, а фон дальше продолжается
   размножением краевой строки. Вырезать знак по контуру нельзя: у него по
   краям свечение, и любой порог режет свечение пополам, оставляя вокруг
   телефона светлый прямоугольник. Класть кусок на ровный цвет тоже нельзя:
   фон в исходнике не ровный, он светлеет к центру, и край куска виден
   рамкой. Размножение краевой строки шва не оставляет вовсе — фон просто
   продолжается тем же цветом, каким кончился.
   Кругом резать тоже нельзя: знак шире, чем высок, и круг, в который он
   влезает, дотягивается до надписи снизу и до края плашки сверху.

Знак вписан в круг ⌀288 из 432: это та часть холста, которую любой лаунчер
обязан показать целиком. Радиус знака измеряется по картинке, а не на глаз.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = 'tools/logo-source.png'       # исходник владельца, лежит в репозитории
RES = 'android/app/src/main/res'
OUT = 'docs/release/icons'          # то, что грузится руками в консоль
SS = 4                              # запас для сглаживания масок

# Плотности: у адаптивной иконки холст 108dp, у устаревшей квадратной — 48dp.
FOREGROUND = [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]
LEGACY = [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]

# Знак на исходнике: полосы яркости, измеренные по самой картинке. Ниже 870
# начинается надпись, и в эти границы она не попадает.
MARK_TOP, MARK_BOTTOM = 188, 821

# Запас фона вокруг знака. Ограничен он надписью: между знаком (821) и ею
# (870) всего 49 точек, поэтому со всех сторон берётся столько же.
PAD = 40


def measure(im):
    """Центр и радиус знака: самая дальняя от центра габаритов яркая точка."""
    a = np.asarray(im.convert('RGB'), dtype=np.int32)
    mx = a.max(axis=2)
    mx[:MARK_TOP] = 0
    mx[MARK_BOTTOM:] = 0
    ys, xs = np.nonzero(mx > 90)
    cx = (xs.min() + xs.max()) / 2.0
    cy = (ys.min() + ys.max()) / 2.0
    r = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())
    return cx, cy, r


def ground(im, box):
    """
    Цвет фона по краю вырезанного куска. Берётся с самой картинки, а не на
    глаз: разойдись он со швом на десяток единиц — и вокруг знака появится
    рамка, которую на чёрном видно.
    """
    a = np.asarray(im.crop(box).convert('RGB'), dtype=np.float32)
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                           a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    return tuple(int(round(v)) for v in edge.mean(axis=0))


SOURCE = Image.open(SRC).convert('RGBA')
CX, CY, MARK_R = measure(SOURCE)
# Кусок: знак плюс запас фона. Снизу запас упирается в надпись, поэтому он
# одинаков со всех сторон и равен тому, что помещается снизу.
BOX = (int(CX - (CX - 223) - PAD), MARK_TOP - PAD,
       int(CX + (1031 - CX) + PAD), MARK_BOTTOM + PAD)
BG = ground(SOURCE, BOX)


def tile():
    """
    Знак с фоном, продолженным во все стороны размножением краевой строки.

    Запас такой, что при любом нашем масштабе холст иконки закрыт целиком:
    непрозрачна вся картинка, и шва нет нигде, потому что резать нечего.
    """
    a = np.asarray(SOURCE.crop(BOX).convert('RGB'))
    pad = max(a.shape[0], a.shape[1])
    a = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    return Image.fromarray(a).convert('RGBA'), pad


def placed(art, side, fill):
    """
    `art` на прозрачном холсте `side`×`side`: знак внутри него вписан в круг
    диаметром `fill`·side и поставлен по центру холста. Масштаб считается по
    знаку, а не по картинке, — у картинки края это фон, и его не жалко.
    """
    k = (side * fill / 2.0) / MARK_R
    w = max(1, int(round(art.width * k)))
    h = max(1, int(round(art.height * k)))
    small = art.resize((w, h), Image.LANCZOS)
    # Центрируем по знаку, а не по картинке: у неё края — это фон, и его
    # с разных сторон разное количество.
    off = PADDING
    cx = (CX - BOX[0] + off) * k
    cy = (CY - BOX[1] + off) * k
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(small, (int(round(side / 2.0 - cx)), int(round(side / 2.0 - cy))))
    return canvas


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


def gradient(size, top, bottom):
    """Вертикальный переход. Полосами по строке — на наших размерах этого хватает."""
    w, h = size
    g = Image.new('RGB', (1, h))
    px = g.load()
    for y in range(h):
        k = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    return os.path.getsize(path)


TILE, PADDING = tile()

written = []

# ---------- адаптивная иконка: только передний слой, фон задан цветом ----------
# Круг ⌀288 из 432 — это 0.66, та часть холста, которую покажет любой лаунчер.
# Знак занимает 0.56: вплотную к границе он упирался в край каплевидной маски
# и выглядел тесно, а поле вокруг значка — половина того, что делает его
# значком, а не картинкой.
for name, side in FOREGROUND:
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher_foreground.png')
    written.append((p, save(placed(TILE, side, 0.56), p)))

# ---------- устаревшие иконки для Android 7 и старше ----------
# Здесь маску накладываем сами и фон рисуем сами: системной подложки нет,
# поле у знака своё, и потому его можно сделать крупнее.
for name, side in LEGACY:
    base = Image.new('RGBA', (side, side), BG + (255,))
    base.alpha_composite(placed(TILE, side, 0.74))

    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(base, (0, 0), squircle_mask(side))
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher.png')
    written.append((p, save(sq, p)))

    rd = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    rd.paste(base, (0, 0), round_mask(side))
    p = os.path.join(RES, 'mipmap-' + name, 'ic_launcher_round.png')
    written.append((p, save(rd, p)))

# ---------- цвет подложки адаптивной иконки ----------
# Пишется скриптом, а не руками: он обязан совпасть с фоном на краю выреза,
# иначе вокруг знака появится кольцо.
p = os.path.join(RES, 'values', 'ic_launcher_background.xml')
xml = (u"<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
       u"<resources>\n"
       u"    <!-- Цвет фона на краю выреза в tools/logo-source.png.\n"
       u"         Считается в tools/make-icons.py — руками не править. -->\n"
       u"    <color name=\"ic_launcher_background\">#%02x%02x%02x</color>\n"
       u"</resources>\n") % BG
os.makedirs(os.path.dirname(p), exist_ok=True)
with open(p, 'w', encoding='utf-8', newline='\n') as f:
    f.write(xml)
written.append((p, os.path.getsize(p)))

# ---------- иконка карточки Play: 512x512, без прозрачности ----------
# Play скругляет её сам, поэтому кладём знак на ровный фон и не режем.
store = Image.new('RGB', (512, 512), BG)
mark512 = placed(TILE, 512, 0.66)
store.paste(mark512, (0, 0), mark512)
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


ban = gradient((1024, 500), (26, 22, 52), BG).convert('RGBA')
# Пятно света за знаком, чтобы баннер не был плоским. Размывается: у ровной
# заливки виден край, и на тёмном фоне он читается кольцом вокруг значка.
glow = Image.new('RGBA', (1024, 500), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([60, 50, 480, 450], fill=(124, 92, 255, 58))
ban.alpha_composite(glow.filter(ImageFilter.GaussianBlur(70)))

# На баннере показываем настоящую иконку — скруглённым квадратом, как её
# покажет лаунчер. Непрозрачный кусок без маски лёг бы на градиент заплаткой.
side = 340
face = Image.new('RGBA', (side, side), BG + (255,))
face.alpha_composite(placed(TILE, side, 0.74))
icon = Image.new('RGBA', (side, side), (0, 0, 0, 0))
icon.paste(face, (0, 0), squircle_mask(side))
ban.alpha_composite(icon, (100, 80))

d = ImageDraw.Draw(ban)
# Имя набираем шрифтом, а не берём картинкой из исходника: в исходнике оно
# нарисовано под квадрат, и в полосе 1024×500 встало бы мелким.
# Подгоняем по ширине — у баннера края обрезаются в разных местах карточки,
# и текст, доходящий до кромки, там теряет последние буквы.
NAME = 'Scroll Book'
size = 96
while size > 48 and d.textlength(NAME, font=font(size)) > 470:
    size -= 4
# Опускаем строку на половину съеденной высоты, чтобы блок остался на месте.
d.text((470, 168 + (96 - size) * 0.35), NAME, font=font(size), fill=(255, 255, 255))
TAG = 'Книга приходит сообщениями'
size = 32
while size > 18 and d.textlength(TAG, font=font(size)) > 470:
    size -= 2
d.text((474, 300), TAG, font=font(size), fill=(190, 182, 222))
p = os.path.join(OUT, 'play-feature-1024x500.png')
written.append((p, save(ban.convert('RGB'), p)))

# ---------- лист для просмотра: как иконка выглядит мелко ----------
# Проверялось на 48 пикселях: на этом размере от рисунка остаётся силуэт,
# и силуэт обязан читаться. Верхний ряд — маска-квадрат, нижний — круг.
sheet = Image.new('RGB', (760, 300), (24, 24, 34))
x = 40
for side in (192, 96, 72, 48):
    base = Image.new('RGBA', (side, side), BG + (255,))
    base.alpha_composite(placed(TILE, side, 0.74))
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
print('фон иконки #%02x%02x%02x, радиус знака %.0f' % (BG + (MARK_R,)))
print('записано %d файлов, %.1f кБ' % (len(written), total / 1024.0))
for path, size in written:
    print('  %-64s %5.1f кБ' % (path.replace('\\', '/'), size / 1024.0))
