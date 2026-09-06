// Обои рабочего стола: пользователь выбирает картинку из галереи, и домашний
// экран приложения начинает выглядеть как его настоящий телефон.
//
// Почему не «сканирование» настоящего рабочего стола: Android не даёт приложению
// снять скриншот системного лаунчера — это закрыто на уровне ОС (обойти можно
// только через MediaProjection, то есть разрешение на запись экрана). Выбор
// картинки из галереи даёт тот же результат без тяжёлого разрешения.
//
// Нативный пикер открывается обычным <input type="file" accept="image/*"> прямо
// в WebView — плагин камеры/галереи не нужен.
import {deleteText, loadText, saveText} from './lib/storage.js';

const ID = '__wallpaper';   // зарезервированный id: книжные id — это Date.now(), пересечься не могут

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
 * Обои с телефона — это 3–12 МБ и 4K по ширине, а показываем мы их на полосе
 * шириной 440 CSS-пикселей. Хранить оригинал незачем: он не влезет в квоту
 * localStorage на вебе и будет зря занимать место на устройстве.
 * 900px по ширине с запасом покрывает экраны с плотностью 2x.
 */
export function shrink(file, maxW = 900, quality = 0.75) {
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
        resolve(c.toDataURL('image/jpeg', quality));
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
