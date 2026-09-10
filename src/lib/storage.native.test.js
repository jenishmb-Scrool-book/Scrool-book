import {describe, it, expect, beforeEach, vi} from 'vitest';

// Хранилище на телефоне.
//
// Отдельный файл, потому что storage.js — второе место в проекте, где ветка
// «только на телефоне» не выполнялась ни разу: в jsdom `isNativePlatform()`
// отдаёт false, и все тесты проверяли localStorage. Первым таким местом был
// native.js, и там из-за этого месяц молчала аппаратная «назад».
//
// Через эту ветку теперь идут и картинки книги, а их файлы — самое тяжёлое,
// что приложение вообще пишет. Здесь платформа подменена на «телефон», а
// плагины Capacitor — заглушками, которые помнят, что у них просили.

const H = vi.hoisted(() => ({native: true, prefs: new Map(), files: new Map(), writes: []}));

vi.mock('@capacitor/core', () => ({Capacitor: {isNativePlatform: () => H.native}}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({key}) => ({value: H.prefs.has(key) ? H.prefs.get(key) : null}),
    set: async ({key, value}) => {
      if (H.full) throw new Error('нет места на устройстве');
      H.prefs.set(key, value);
    }
  }
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: {Data: 'DATA'},
  Encoding: {UTF8: 'UTF8'},
  Filesystem: {
    readFile: async ({path, directory, encoding}) => {
      if (!H.files.has(path)) throw new Error('файла нет');    // плагин бросает, а не отдаёт null
      return {data: H.files.get(path), directory, encoding};
    },
    writeFile: async ({path, data, recursive, directory, encoding}) => {
      if (H.full) throw new Error('нет места на устройстве');
      H.writes.push({path, recursive, directory, encoding});
      H.files.set(path, String(data));
    },
    deleteFile: async ({path}) => {
      if (!H.files.delete(path)) throw new Error('файла нет');
    }
  }
}));

const S = await import('./storage.js');

beforeEach(() => {
  H.native = true;
  H.full = false;
  H.prefs.clear();
  H.files.clear();
  H.writes.length = 0;
  localStorage.clear();
});

describe('на телефоне', () => {
  it('мета уходит в Preferences, а не в localStorage', async () => {
    await S.saveMeta({books: [], cur: null});
    expect(H.prefs.get('scroll.meta')).toBe('{"books":[],"cur":null}');
    expect(localStorage.length).toBe(0);
    expect(await S.loadMeta()).toEqual({books: [], cur: null});
  });

  it('пустое и испорченное хранилище меты — null, а не исключение', async () => {
    expect(await S.loadMeta()).toBeNull();
    H.prefs.set('scroll.meta', 'не json');
    expect(await S.loadMeta()).toBeNull();
  });

  // recursive обязателен: папки books на свежем устройстве ещё нет, и без него
  // первая же книга не сохранилась бы.
  it('текст книги — отдельным файлом, с созданием папки', async () => {
    await S.saveText('b1', 'Текст книги.');
    expect(H.writes[0]).toMatchObject({path: 'books/b1.txt', recursive: true, directory: 'DATA'});
    expect(await S.loadText('b1')).toBe('Текст книги.');
    expect(localStorage.length).toBe(0);
  });

  it('текста нет — пустая строка, а не падение', async () => {
    expect(await S.loadText('нет такой')).toBe('');
  });

  it('оглавление лежит своим файлом рядом с книгой', async () => {
    await S.saveToc('b1', [{title: 'Глава', at: 0}]);
    expect(H.files.has('books/b1.toc.txt')).toBe(true);
    expect(await S.loadToc('b1')).toEqual([{title: 'Глава', at: 0}]);
  });

  it('картинка — своим файлом, и читается обратно целиком', async () => {
    const src = 'data:image/png;base64,' + 'A'.repeat(4096);
    await S.savePic('b1', 3, src);
    expect(H.files.has('books/b1.pic.3.txt')).toBe(true);
    expect(await S.loadPic('b1', 3)).toBe(src);
  });

  it('список картинок читается и переживает мусор', async () => {
    await S.savePix('b1', [{at: 12, k: 0}]);
    expect(await S.loadPix('b1')).toEqual([{at: 12, k: 0}]);
    H.files.set('books/b1.pix.txt', 'не json');
    expect(await S.loadPix('b1')).toEqual([]);
  });

  it('удаление того, чего нет, не роняет приложение', async () => {
    await expect(S.deletePic('b1', 9)).resolves.toBeUndefined();
    await expect(S.deleteText('нет')).resolves.toBeUndefined();
    await expect(S.deletePix('нет')).resolves.toBeUndefined();
  });

  it('удаление уносит файл', async () => {
    await S.savePic('b1', 0, 'data:image/png;base64,AAAA');
    await S.deletePic('b1', 0);
    expect(H.files.has('books/b1.pic.0.txt')).toBe(false);
  });

  // На телефоне отказ записи это кончившееся место, и сказать об этом надо
  // человеку: сам он о переполнении не догадается, книга просто не появится.
  it('отказ записи превращается в StorageFullError', async () => {
    H.full = true;
    await expect(S.saveText('b1', 'текст')).rejects.toBeInstanceOf(S.StorageFullError);
    await expect(S.saveMeta({books: []})).rejects.toBeInstanceOf(Error);
  });
});

describe('в браузере', () => {
  it('всё то же самое идёт в localStorage, а плагины не трогаются', async () => {
    H.native = false;
    await S.saveText('b1', 'Текст.');
    await S.savePic('b1', 0, 'data:image/png;base64,AAAA');
    await S.saveMeta({books: []});

    expect(H.writes).toHaveLength(0);
    expect(H.prefs.size).toBe(0);
    expect(await S.loadText('b1')).toBe('Текст.');
    expect(await S.loadPic('b1', 0)).toBe('data:image/png;base64,AAAA');
    expect(localStorage.getItem('scroll.meta')).toBe('{"books":[]}');
  });
});
