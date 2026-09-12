// Обои рабочего стола: пользователь выбирает картинку из галереи, и домашний
// экран приложения начинает выглядеть как его настоящий телефон.
//
// Почему не берём настоящие обои телефона автоматически — две разные причины,
// и обе окончательные:
//
// 1. Скриншот системного лаунчера приложению снять нельзя, это закрыто на уровне
//    ОС. Обойти можно только через MediaProjection, то есть разрешение на запись
//    экрана — тяжёлое и притягивающее внимание ревью Play.
// 2. Сами обои система тоже больше не отдаёт. До Android 12 `WallpaperManager
//    .getDrawable()` работал по разрешению на чтение хранилища; в Android 13 стал
//    возвращать дефолтные обои вместо настоящих; с Android 14 бросает
//    SecurityException всегда. Исключение — MANAGE_EXTERNAL_STORAGE, но Play
//    выдаёт его узкому списку категорий, и читалка туда не входит.
//    У нас targetSdk 35, понизить нельзя: Play требует свежий target.
//
// Поэтому единственный работающий путь — попросить картинку у человека.
// Чтобы это не ощущалось лишней вознёй, просьба висит на самом домашнем экране
// (см. Home.jsx), а не только в настройках.
//
// Нативный пикер открывается обычным <input type="file" accept="image/*"> прямо
// в WebView — плагин камеры/галереи не нужен.
import {deleteText, loadText, saveText} from './lib/storage.js';

const ID = '__wallpaper';   // зарезервированный id: книжные id — это Date.now(), пересечься не могут

// Двадцать готовых обоев.
//
// Лежат отдельно от лент, в `public/pics/wall`, и это единственное место в
// сборке, где снимок хранится крупно: 1080x2340 против 432x768 у вертикальной
// ленты. Обои растягиваются на весь экран, и миниатюра из ленты увеличивалась
// бы там в два с половиной раза вместе со всеми огрехами сжатия.
//
// Рядом, в `wall/small`, те же снимки плитками для решётки выбора. Двадцать
// картинок по 1080x2340 разом — это четверть гигабайта распакованных пикселей
// в памяти телефона ради плиток шириной в палец.
//
// Какие это снимки, откуда и почему именно они — в `tools/fetch-pics.py`,
// шаг `--walls`. Номера там заморожены: выбраны просмотром, а не правилом.
const COUNT = 20;
const file = k => String(k + 1).padStart(3, '0') + '.webp';

/** Двадцать готовых обоев, путями для `url()`. */
export const WALLS = Array.from({length: COUNT}, (_, k) => 'pics/wall/' + file(k));

/** Те же снимки плитками. Порядок тот же: `WALLS[k]` и `THUMBS[k]` — один кадр. */
export const THUMBS = Array.from({length: COUNT}, (_, k) => 'pics/wall/small/' + file(k));

/** Те же обои, которые видны до того, как человек вообще что-то выбрал. */
export const DEFAULT_WALL = WALLS[6];

// undefined — ещё не читали, '' — обоев нет.
let cache;

export async function getWallpaper() {
  if (cache === undefined) cache = await loadText(ID);
  return cache;
}

export async function setWallpaper(dataUri) {
  await saveText(ID, dataUri);
  cache = dataUri;
}

export async function clearWallpaper() {
  await deleteText(ID);
  cache = '';
}

/**
 * Ужимает выбранный файл до data-URI пригодного размера.
 *
 * Обои с телефона — это 3–12 МБ и 4K по ширине, а показываем мы их на экране
 * шириной 1080 точек. Хранить оригинал незачем: он не влезет в квоту
 * localStorage на вебе и будет зря занимать место на устройстве.
 *
 * 1080 — не запас, а ровно ширина экрана типичного телефона: своя картинка
 * должна выглядеть так же, как двадцать готовых, а те именно такие.
 */
export function shrink(file, maxW = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Это не картинка'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.naturalWidth);   // апскейлить не надо
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try {
        // WebP при том же качестве весит вдвое меньше JPEG, а WebView на
        // Android — это Chromium, там он есть всегда. Браузер без WebP молча
        // отдаёт PNG, то есть мегабайты вместо сотен килобайт, — поэтому
        // проверяем, что вернули именно то, что просили, а не верим на слово.
        const out = c.toDataURL('image/webp', quality);
        resolve(out.startsWith('data:image/webp') ? out : c.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(new Error('Не удалось обработать картинку'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать картинку'));
    };
    img.src = url;
  });
}
