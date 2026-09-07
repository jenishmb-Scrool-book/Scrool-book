# -*- coding: utf-8 -*-
"""
Сто картинок для наполнения лент: python tools/fetch-pics.py

Откуда. picsum.photos — витрина фотографий Unsplash. Лицензия Unsplash
разрешает скачивать, изменять и использовать снимки, в том числе коммерчески,
без разрешения и без указания автора. Запрещено ровно одно: продавать копии
как есть и собирать из них сервис, конкурирующий с самим Unsplash. Ни того,
ни другого мы не делаем — это фон под текстом.

Почему в приложении, а не по сети. У приложения намеренно нет разрешения
INTERNET, и появиться оно не должно ради украшений. Картинки лежат в сборке.

Почему по фиксированным семенам. Набор обязан быть воспроизводимым: иначе
следующий запуск даст другие сто снимков, и просматривать их глазами придётся
заново. Просмотр обязателен — в приложение не кладут картинки, которых никто
не видел.

Размер. 448x560 при качестве 50 — около 12 кБ на снимок, 1,2 МБ на сотню.
Показываются они шириной до 375 точек под затемнением и текстом, поэтому
больше не нужно, а меньше уже видно полосами на небе.
"""
import io
import os
import sys
import urllib.request

from PIL import Image

OUT = 'public/pics'
COUNT = 100
SRC_W, SRC_H = 900, 1125      # берём с запасом и ужимаем сами: один проход сжатия вместо двух
DST_W, DST_H = 448, 560
QUALITY = 50

# Семя 54 заменено намеренно: там был крупный узнаваемый портрет. В ленте,
# подписанной чужим именем, лицо человека читается как «он это выложил», а
# разрешения на такое лицензия Unsplash не даёт — она про снимок, не про людей
# на нём. Остальные девяносто девять — виды, предметы и люди со спины.
SEEDS = {54: 'sdvg-054b'}


def main():
    os.makedirs(OUT, exist_ok=True)
    force = '--force' in sys.argv
    done, failed, total = 0, [], 0

    for i in range(1, COUNT + 1):
        dst = os.path.join(OUT, '%03d.webp' % i)
        if os.path.exists(dst) and not force:
            total += os.path.getsize(dst)
            done += 1
            continue
        seed = SEEDS.get(i, 'sdvg-%03d' % i)
        url = 'https://picsum.photos/seed/%s/%d/%d' % (seed, SRC_W, SRC_H)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'sdvg-assets/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            im.resize((DST_W, DST_H), Image.LANCZOS).save(dst, 'WEBP', quality=QUALITY, method=6)
            total += os.path.getsize(dst)
            done += 1
        except Exception as e:
            failed.append((i, str(e)[:70]))
        if i % 20 == 0:
            print('  ... %d/%d' % (i, COUNT), flush=True)

    print('gotovo: %d/%d, %.2f MB total, %.1f kB avg'
          % (done, COUNT, total / 1048576.0, total / max(1, done) / 1024.0))
    if failed:
        print('failed: %s' % failed[:8])
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
