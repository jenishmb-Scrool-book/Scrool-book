# -*- coding: utf-8 -*-
"""
Картинки для лент. Три шага, каждый запускается отдельно:

    python tools/fetch-pics.py --cache     скачать оригиналы во временный кеш
    python tools/fetch-pics.py --sheets    собрать листы для просмотра глазами
    python tools/fetch-pics.py --build     разложить по лентам и сжать

Откуда. picsum.photos — витрина фотографий Unsplash. Лицензия Unsplash
разрешает скачивать, изменять и использовать снимки, в том числе коммерчески,
без разрешения автора и без указания. Запрещено ровно одно: продавать копии
как есть и собирать из них сервис, конкурирующий с самим Unsplash. Ни того, ни
другого мы не делаем — это фон под текстом.

Почему по номерам, а не по семенам. Раньше картинки брались по «семени»:
picsum.photos/seed/что-угодно. Семя выбирает снимок из каталога СЛУЧАЙНО, а
каталог конечный — 993 снимка. На ста семенах уже вылезли четыре повтора: три
ленты показывали одну и ту же фотографию. По номеру снимок берётся ровно один,
и повтор невозможен. Отсюда же потолок набора: больше 993 у этого источника
взять неоткуда, никакие ухищрения этого не изменят.

Почему в три шага. Скачивание идёт минуты, а раскладка по лентам и качество
сжатия подбираются несколько раз. Оригиналы лежат в кеше, и подбор не стоит
ничего. Между шагами вклинивается просмотр: в приложение не кладут картинок,
которых никто не видел, а девятьсот штук глазами смотрят по листам, а не по
одной.

Почему четыре ленты, а не три. Посты 4:5, обложки видео 16:9 и аватарки 1:1
просил хозяин. Вертикальная лента добавлена потому, что клипы и истории идут
на весь экран: обложка 16:9, растянутая на 9:16, обрезается до неузнаваемости.

Почему часть снимков выброшена. Крупный портрет в ленте, подписанной
выдуманным именем, читается как «этот человек это выложил». Лицензия Unsplash
такого права не даёт — она про снимок, а не про людей на нём. Номера
отвергнутых лежат в REJECT: список составлен просмотром, а не правилом,
поэтому он здесь, а не в коде.
"""
import io
import json
import os
import random
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw

CACHE = os.environ.get('PICS_CACHE', 'C:/Users/23A5~1/AppData/Local/Temp/claude/'
                       'C--src-programs-exp-SDVG-app/'
                       'a1eac4ee-56a6-4e58-badc-0815323de712/scratchpad/pics-cache')
IDS = 'tools/picsum-ids.txt'          # снимок каталога: набор обязан быть воспроизводимым
OUT = 'public/pics'
SHEETS = os.path.join(CACHE, 'sheets')

CACHE_LONG = 1280                     # длинная сторона оригинала в кеше
WORKERS = 8                           # больше — вежливость к чужому серверу кончается

# Ленты: (папка, сколько, ширина, высота, качество).
# Размеры взяты из того, как картинка показывается: шире 375 точек экрана она
# не бывает, поэтому двойной запас по ширине — предел полезного.
POOLS = [
    ('post', 390, 448, 560, 48),      # посты ленты: 4:5
    ('wide', 195, 480, 270, 52),      # обложки видео: 16:9
    ('tall', 195, 432, 768, 46),      # клипы и истории: 9:16, во весь экран
    ('face', 190, 144, 144, 58),      # аватарки: 1:1, показываются кружком 52 точки
]

# Отвергнуто после просмотра всех десяти листов.
#
# Лица. Снимок, где лицо человека и есть сюжет, выброшен, даже если оно
# наполовину в тени. В ленте, подписанной выдуманным именем, такое лицо
# читается как «этот человек это выложил», а разрешения на такое лицензия
# Unsplash не даёт — она про снимок, а не про людей на нём. Дети выброшены
# без обсуждения. Люди со спины, силуэты на просвет и мелкие фигуры в общем
# плане оставлены: там нет лица, которое можно узнать.
#
# 300 выброшен по другой причине — он почти пустой белый кадр. В аватарке
# такой снимок читается как «картинка не загрузилась».
REJECT = {
    64, 449, 453, 660, 775, 777, 822, 823, 832, 836, 838, 839,
    978, 996, 1005, 1013, 1027, 1066,     # лица и дети
    300,                                  # пустой кадр
}

MIX = 20260908                        # семя раскладки: одно и то же на каждом запуске


def catalog():
    """Номера снимков. Один раз спрашиваем у сервера, дальше читаем с диска."""
    if os.path.exists(IDS):
        return [int(x) for x in io.open(IDS, encoding='utf-8').read().split()]
    ids, page = [], 1
    while page < 30:
        url = 'https://picsum.photos/v2/list?page=%d&limit=100' % page
        req = urllib.request.Request(url, headers={'User-Agent': 'scroolbook-assets/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.load(r)
        if not rows:
            break
        ids += [int(x['id']) for x in rows]
        page += 1
    io.open(IDS, 'w', encoding='utf-8', newline='\n').write('\n'.join(str(i) for i in ids) + '\n')
    return ids


def cache_one(pid):
    """Оригинал в кеш. Длинная сторона 1280: хватит любой ленте, а место конечно."""
    dst = os.path.join(CACHE, '%04d.jpg' % pid)
    if os.path.exists(dst) and os.path.getsize(dst) > 4096:
        return True
    url = 'https://picsum.photos/id/%d/%d/%d' % (pid, CACHE_LONG, CACHE_LONG)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'scroolbook-assets/1.0'})
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
        Image.open(io.BytesIO(raw)).convert('RGB').save(dst, 'JPEG', quality=88)
        return True
    except Exception:
        return False


def do_cache(ids):
    os.makedirs(CACHE, exist_ok=True)
    ok = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for n, good in enumerate(pool.map(cache_one, ids), 1):
            ok += 1 if good else 0
            if n % 100 == 0:
                print('  ... %d/%d' % (n, len(ids)), flush=True)
    print('kesh: %d/%d' % (ok, len(ids)))
    return ok


def alive(ids):
    """Номера, которые действительно скачались."""
    return [i for i in ids
            if os.path.exists(os.path.join(CACHE, '%04d.jpg' % i))
            and os.path.getsize(os.path.join(CACHE, '%04d.jpg' % i)) > 4096]


def do_sheets(ids):
    """Листы по сто штук: просмотр девятисот снимков по одному невозможен."""
    os.makedirs(SHEETS, exist_ok=True)
    cell, cols = 118, 10
    for s in range(0, len(ids), 100):
        part = ids[s:s + 100]
        rows = (len(part) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell, rows * cell), (22, 22, 30))
        d = ImageDraw.Draw(sheet)
        for k, pid in enumerate(part):
            im = Image.open(os.path.join(CACHE, '%04d.jpg' % pid)).convert('RGB')
            w, h = im.size
            side = min(w, h)
            im = im.crop(((w - side) // 2, (h - side) // 2,
                          (w - side) // 2 + side, (h - side) // 2 + side))
            im = im.resize((cell - 6, cell - 6), Image.LANCZOS)
            x, y = (k % cols) * cell, (k // cols) * cell
            sheet.paste(im, (x + 3, y + 3))
            d.rectangle([x + 3, y + cell - 17, x + 40, y + cell - 3], fill=(0, 0, 0))
            d.text((x + 6, y + cell - 16), str(pid), fill=(255, 255, 255))
        p = os.path.join(SHEETS, 'sheet-%02d.png' % (s // 100 + 1))
        sheet.save(p)
        print(p)


def cut(im, w, h):
    """Обрезать по центру под нужное соотношение и уменьшить."""
    sw, sh = im.size
    want = w / h
    have = sw / sh
    if have > want:                       # шире нужного — режем бока
        nw = int(round(sh * want))
        box = ((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh)
    else:                                 # выше нужного — режем верх и низ
        nh = int(round(sw / want))
        box = (0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh)
    return im.crop(box).resize((w, h), Image.LANCZOS)


def do_build(ids):
    """Разложить по лентам. Раскладка перемешана с постоянным семенем: подряд
    идущие номера каталога часто из одной съёмки, и лента получилась бы полосами
    одинаковых кадров."""
    live = [i for i in alive(ids) if i not in REJECT]
    order = list(live)
    random.Random(MIX).shuffle(order)

    need = sum(p[1] for p in POOLS)
    if len(order) < need:
        print('vnimanie: dostupno %d, nuzhno %d' % (len(order), need))

    at, report = 0, []
    for name, count, w, h, q in POOLS:
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        for old in os.listdir(d):
            os.remove(os.path.join(d, old))
        part = order[at:at + count]
        at += len(part)
        total = 0
        for k, pid in enumerate(part, 1):
            im = Image.open(os.path.join(CACHE, '%04d.jpg' % pid)).convert('RGB')
            dst = os.path.join(d, '%03d.webp' % k)
            cut(im, w, h).save(dst, 'WEBP', quality=q, method=6)
            total += os.path.getsize(dst)
        report.append((name, len(part), total))
        print('  %-5s %3d sht, %5.2f MB, %4.1f kB srednee'
              % (name, len(part), total / 1048576.0, total / max(1, len(part)) / 1024.0))

    grand = sum(r[2] for r in report)
    print('itogo: %d kartinok, %.2f MB' % (sum(r[1] for r in report), grand / 1048576.0))
    print('POOLS dlya src/ui/pics.js: {%s}'
          % ', '.join('%s: %d' % (r[0], r[1]) for r in report))


def main():
    ids = catalog()
    print('katalog: %d' % len(ids))
    if '--cache' in sys.argv:
        do_cache(ids)
    if '--sheets' in sys.argv:
        do_sheets(alive(ids))
    if '--build' in sys.argv:
        do_build(ids)
    if len(sys.argv) == 1:
        print(__doc__)
    return 0


if __name__ == '__main__':
    sys.exit(main())
