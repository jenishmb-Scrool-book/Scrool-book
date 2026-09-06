import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {loadMeta, saveMeta, loadText, saveText, deleteText, saveToc, loadToc, deleteToc, StorageFullError} from './storage.js';

// В jsdom Capacitor.isNativePlatform() === false, значит проверяется веб-ветка на localStorage.
const META = 'scroll.meta';
const meta = () => ({
  books: [{id: '1', title: 'Книга', n: 3}],
  cur: '1',
  pos: {'1': 2},
  last: 'reels'
});
const quota = () => new DOMException('quota', 'QuotaExceededError');

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('мета', () => {
  it('на пустом хранилище отдаёт null', async () => {
    expect(await loadMeta()).toBeNull();
  });

  it('переживает круговорот сохранить/прочитать', async () => {
    await saveMeta(meta());
    expect(await loadMeta()).toEqual(meta());
  });

  // Одна кривая запись не должна навсегда убить приложение у пользователя.
  it('на битом JSON отдаёт null, а не бросает', async () => {
    localStorage.setItem(META, '{это не json');
    await expect(loadMeta()).resolves.toBeNull();
  });

  it('на валидном JSON не той формы отдаёт null', async () => {
    localStorage.setItem(META, '"строка"');
    expect(await loadMeta()).toBeNull();
    localStorage.setItem(META, 'null');
    expect(await loadMeta()).toBeNull();
    localStorage.setItem(META, '{"cur":"1"}');   // нет books
    expect(await loadMeta()).toBeNull();
  });

  it('переполнение при записи меты даёт StorageFullError', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw quota();});
    await expect(saveMeta(meta())).rejects.toBeInstanceOf(StorageFullError);
  });
});

describe('тексты', () => {
  it('переживают круговорот сохранить/прочитать', async () => {
    await saveText('42', 'Жил-был текст.');
    expect(await loadText('42')).toBe('Жил-был текст.');
  });

  it('для неизвестного id отдают пустую строку', async () => {
    expect(await loadText('нет-такого')).toBe('');
  });

  it('deleteText убирает ключ', async () => {
    await saveText('42', 'Жил-был текст.');
    await deleteText('42');
    expect(await loadText('42')).toBe('');
    expect(Object.keys(localStorage).some(k => k.includes('42'))).toBe(false);
  });

  it('deleteText на несуществующем id не бросает', async () => {
    await expect(deleteText('нет-такого')).resolves.toBeUndefined();
  });

  // Мета маленькая и пишется на каждый сдвиг курсора, текст большой и пишется один раз.
  // Смешать их — значит пересериализовывать мегабайт на каждом скролле.
  it('никогда не лежат внутри меты', async () => {
    await saveMeta(meta());
    const before = localStorage.getItem(META);
    await saveText('1', 'ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ');
    const after = localStorage.getItem(META);
    expect(after).toBe(before);
    expect(after).not.toContain('ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ');
    expect(JSON.stringify(await loadMeta())).not.toContain('ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ');
  });
});

describe('переполнение хранилища', () => {
  it('saveText бросает StorageFullError', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw quota();});
    await expect(saveText('1', 'текст')).rejects.toBeInstanceOf(StorageFullError);
  });

  it('StorageFullError — это Error с внятным именем и сообщением', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw quota();});
    const e = await saveText('1', 'текст').catch(x => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StorageFullError');
    expect(String(e.message)).not.toHaveLength(0);
  });

  it('не-квотную ошибку записи не выдаёт за переполнение', async () => {
    const boom = new DOMException('нет доступа', 'SecurityError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw boom;});
    const e = await saveText('1', 'текст').catch(x => x);
    expect(e).not.toBeInstanceOf(StorageFullError);
    expect(e).toBe(boom);
  });
});

describe('оглавление', () => {
  const toc = [{title: 'Глава 1', at: 0}, {title: 'Глава 2', at: 900}];

  it('переживает круговорот сохранить/прочитать', async () => {
    await saveToc('1', toc);
    expect(await loadToc('1')).toEqual(toc);
  });

  it('у книги без оглавления — пустой массив, а не null', async () => {
    expect(await loadToc('нет-такой')).toEqual([]);
  });

  // Испорченное оглавление не должно мешать открыть саму книгу.
  it('мусор в хранилище отдаётся как пустое оглавление', async () => {
    localStorage.setItem('scroll.book.1.toc', '{это не json');
    expect(await loadToc('1')).toEqual([]);
    localStorage.setItem('scroll.book.1.toc', '"строка вместо массива"');
    expect(await loadToc('1')).toEqual([]);
  });

  it('не мешает тексту той же книги и удаляется отдельно', async () => {
    await saveText('1', 'текст книги');
    await saveToc('1', toc);
    await deleteToc('1');
    expect(await loadToc('1')).toEqual([]);
    expect(await loadText('1')).toBe('текст книги');
  });

  it('не-массив на входе сохраняется как пустое оглавление', async () => {
    await saveToc('1', null);
    expect(await loadToc('1')).toEqual([]);
  });
});
