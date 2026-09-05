// Хранилище за одним интерфейсом: на Android — Capacitor (Preferences для меты,
// Filesystem для текстов), в браузере — localStorage.
//
// Главное правило: тексты книг НИКОГДА не лежат внутри меты. Мета крошечная и
// пишется на каждый сдвиг курсора, текст большой и пишется один раз при импорте.
// Смешать их — значит пересериализовывать мегабайт на каждом кадре скролла.
import {Capacitor} from '@capacitor/core';
import {Preferences} from '@capacitor/preferences';
import {Directory, Encoding, Filesystem} from '@capacitor/filesystem';

const META_KEY = 'scroll.meta';
const BOOK_KEY = 'scroll.book.';          // веб: отдельный ключ localStorage на книгу
const BOOK_DIR = 'books';                 // нативно: отдельный файл в Directory.Data
const fileOf = id => `${BOOK_DIR}/${id}.txt`;

/** Не влезло в хранилище. Приложение от этого падать не должно — только сказать пользователю. */
export class StorageFullError extends Error {
  constructor(message = 'Не влезло в хранилище устройства. Разбей текст на части.', options) {
    super(message, options);
    this.name = 'StorageFullError';
  }
}

const native = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

// В приватном режиме и на opaque origin localStorage бросает SecurityError уже
// на обращении — тогда живём в памяти до перезагрузки, но не падаем при старте.
const LS = (() => {
  try {
    localStorage.setItem('scroll._probe', '1');
    localStorage.removeItem('scroll._probe');
    return localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => void mem.delete(k)
    };
  }
})();

// DOMException переполнения зовётся по-разному в разных браузерах.
const isQuota = e =>
  e instanceof StorageFullError ||
  (e && (e.name === 'QuotaExceededError' ||
         e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
         e.code === 22 || e.code === 1014));

// Мету парсим строго защищённо: одна кривая запись не должна навсегда
// убить приложение — лучше начать с чистого листа, чем не запуститься.
function parseMeta(raw) {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object' || !Array.isArray(m.books)) return null;
    return m;
  } catch {
    return null;
  }
}

/** @returns {Promise<object|null>} */
export async function loadMeta() {
  if (native()) {
    try {
      const {value} = await Preferences.get({key: META_KEY});
      return parseMeta(value);
    } catch {
      return null;
    }
  }
  return parseMeta(LS.getItem(META_KEY));
}

/** @param {object} meta @returns {Promise<void>} */
export async function saveMeta(meta) {
  const value = JSON.stringify(meta);
  try {
    if (native()) await Preferences.set({key: META_KEY, value});
    else LS.setItem(META_KEY, value);
  } catch (e) {
    if (isQuota(e)) throw new StorageFullError(undefined, {cause: e});
    throw e;
  }
}

/** @param {string} id @returns {Promise<string>} пустая строка, если книги нет */
export async function loadText(id) {
  if (native()) {
    try {
      const {data} = await Filesystem.readFile({
        path: fileOf(id), directory: Directory.Data, encoding: Encoding.UTF8
      });
      return typeof data === 'string' ? data : '';
    } catch {
      return '';                                  // файла нет — книга пустая, не падаем
    }
  }
  return LS.getItem(BOOK_KEY + id) || '';
}

/** @param {string} id @param {string} text @returns {Promise<void>} бросает StorageFullError */
export async function saveText(id, text) {
  try {
    if (native()) {
      await Filesystem.writeFile({
        path: fileOf(id), data: String(text), directory: Directory.Data,
        encoding: Encoding.UTF8, recursive: true
      });
    } else {
      LS.setItem(BOOK_KEY + id, String(text));
    }
  } catch (e) {
    // На вебе это квота ~5 МБ, нативно — кончилось место на диске.
    if (isQuota(e) || native()) throw new StorageFullError(undefined, {cause: e});
    throw e;
  }
}

/** @param {string} id @returns {Promise<void>} */
export async function deleteText(id) {
  if (native()) {
    try {
      await Filesystem.deleteFile({path: fileOf(id), directory: Directory.Data});
    } catch {
      /* нечего удалять — не повод падать */
    }
    return;
  }
  LS.removeItem(BOOK_KEY + id);
}
