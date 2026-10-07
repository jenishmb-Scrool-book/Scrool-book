"""Обложка для поста в Threads: заголовок и три телефона из готовых снимков.

Запуск из корня проекта:  python tools/make-threads-cover.py

Берёт docs/release/screenshots/ru/*.jpg и кладёт готовый набор для карусели в
docs/release/threads/ (папка release не публикуется на GitHub Pages). Первая
картинка карусели — обложка: по ней решают, листать ли дальше, поэтому на ней
крупная фраза и три разных «приложения», а не один экран.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'docs/release/screenshots/ru'
OUT = ROOT / 'docs/release/threads'
FONTS = Path('C:/Windows/Fonts')

W, H = 1080, 1350          # 4:5 — высокий кадр, но без обрезки в ленте
BG_TOP, BG_BOT = (14, 14, 28), (48, 36, 112)
ACCENT = (138, 164, 255)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def gradient():
    img = Image.new('RGB', (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        row = tuple(round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = row
    return img


def phone(name, width, radius=46):
    """Снимок экрана со скруглёнными углами и тонкой рамкой."""
    src = Image.open(SHOTS / name).convert('RGB')
    h = round(src.height * width / src.width)
    src = src.resize((width, h), Image.LANCZOS)
    mask = Image.new('L', src.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, h - 1), radius, fill=255)
    out = Image.new('RGBA', src.size, (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    ImageDraw.Draw(out).rounded_rectangle((0, 0, width - 1, h - 1), radius, outline=(255, 255, 255, 70), width=3)
    return out


def shadowed(base, im, x, y):
    sh = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((x - 6, y + 14, x + im.width + 6, y + im.height + 26), 54, fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(26))
    base.alpha_composite(sh)
    base.alpha_composite(im, (x, y))


def cover():
    base = gradient().convert('RGBA')
    d = ImageDraw.Draw(base)
    head = font('segoeuib.ttf', 112)
    d.text((72, 70), 'Читай книгу', font=head, fill='white')
    d.text((72, 190), 'как ленту', font=head, fill=ACCENT)
    d.text((76, 338), 'Scroll Book · бета-тест на Android', font=font('segoeui.ttf', 38), fill=(205, 207, 225))

    # центральный телефон крупнее и стоит впереди; боковые уходят за нижний край
    shadowed(base, phone('02-reels.jpg', 380), 28, 560)
    shadowed(base, phone('05-video.jpg', 380), 672, 560)
    shadowed(base, phone('01-chat.jpg', 470), 305, 470)

    # плашка поверх нижнего края — закрывает срез телефонов и несёт призыв
    bar = Image.new('RGBA', (W, 150), (14, 14, 28, 235))
    base.alpha_composite(bar, (0, H - 150))
    d = ImageDraw.Draw(base)
    d.text((W // 2, H - 75), 'Нужны тестировщики — ссылка в посте',
           font=font('segoeuib.ttf', 40), fill='white', anchor='mm')
    return base.convert('RGB')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cover().save(OUT / '01-cover.jpg', quality=92)
    # дальше — живые кадры в порядке «чем убедительнее, тем раньше»
    for n, name in enumerate(['01-chat.jpg', '02-reels.jpg', '04-home.jpg', '06-feed.jpg'], start=2):
        Image.open(SHOTS / name).save(OUT / f'{n:02d}-{name[3:]}', quality=92)
    print(*sorted(p.name for p in OUT.iterdir()), sep='\n')


if __name__ == '__main__':
    main()
