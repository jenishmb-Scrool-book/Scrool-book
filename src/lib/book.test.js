import {describe, it, expect} from 'vitest';
import {parseBook} from './book.js';
import {u8, zipOf} from './zip.fixture.js';

/* Разбор файла проверяем через тот же объект, что приезжает из <input type=file>:
   имя и arrayBuffer(). Больше parseBook от файла ничего не берёт — и не должна,
   потому что на Android имя врёт чаще, чем говорит правду. */
const file = (name, bytes) => ({
  name,
  arrayBuffer: async () => (bytes instanceof Uint8Array ? bytes.slice() : u8(bytes)).buffer
});

/** Строка в windows-1251: в ней лежит половина русских .txt и .fb2. */
const cp1251 = s => new Uint8Array([...s].map(ch => {
  const c = ch.codePointAt(0);
  if (c < 0x80) return c;
  if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
  if (c === 0x401) return 0xa8;
  if (c === 0x451) return 0xb8;
  throw new Error('нет в windows-1251: ' + ch);
}));

const FB2 = '<?xml version="1.0" encoding="utf-8"?>'
  + '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">'
  + '<description><title-info><book-title>Мёртвые души</book-title></title-info></description>'
  + '<body><section><p>Раз.</p><p>Два.</p></section></body></FictionBook>';

const EPUB = () => zipOf({
  'mimetype': 'application/epub+zip',
  'META-INF/container.xml': '<?xml version="1.0"?>'
    + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    + '<rootfiles><rootfile full-path="c.opf" media-type="application/oebps-package+xml"/></rootfiles>'
    + '</container>',
  'c.opf': '<?xml version="1.0" encoding="utf-8"?>'
    + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
    + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Из архива</dc:title></metadata>'
    + '<manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest>'
    + '<spine><itemref idref="a"/></spine></package>',
  'a.xhtml': '<?xml version="1.0" encoding="utf-8"?>'
    + '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Страница.</p></body></html>'
});

describe('parseBook() — формат узнаётся по содержимому', () => {
  // Ровно тот случай, ради которого разбор перестал смотреть на расширение:
  // Android отдаёт файл по ссылке content:// и имя приносит какое угодно.
  it('FB2 без расширения в имени всё равно разбирается как FB2', async () => {
    const r = await parseBook(file('bezimeni', FB2));
    expect(r.title).toBe('Мёртвые души');
    expect(r.text).toBe('Раз.\n\nДва.');
  });

  it('FB2 с расширением в верхнем регистре — тоже FB2', async () => {
    expect((await parseBook(file('Книга.FB2', FB2))).title).toBe('Мёртвые души');
  });

  it('FB2 в windows-1251 читается своей кодировкой', async () => {
    const src = '<?xml version="1.0" encoding="windows-1251"?>'
      + '<FictionBook><description><title-info><book-title>Тарас</book-title>'
      + '</title-info></description><body><section><p>Чуден Днепр.</p></section></body></FictionBook>';
    const r = await parseBook(file('t.fb2', cp1251(src)));
    expect(r.title).toBe('Тарас');
    expect(r.text).toBe('Чуден Днепр.');
  });

  it('EPUB без расширения разбирается как EPUB', async () => {
    const r = await parseBook(file('document', EPUB()));
    expect(r.title).toBe('Из архива');
    expect(r.text).toBe('Страница.');
  });
});

// `.fb2.zip` — то, как fb2 раздают в библиотеках чаще, чем голым файлом.
// Расширение у такого файла `zip`, и по нему разбор уходил в отказ.
describe('parseBook() — FB2 внутри архива', () => {
  it('архив с одним .fb2 внутри читается как книга', async () => {
    const r = await parseBook(file('kniga.fb2.zip', zipOf({'kniga.fb2': FB2})));
    expect(r.title).toBe('Мёртвые души');
    expect(r.text).toBe('Раз.\n\nДва.');
  });

  it('единственный файл в архиве берём даже без расширения', async () => {
    const r = await parseBook(file('kniga.zip', zipOf({'kniga': FB2})));
    expect(r.title).toBe('Мёртвые души');
  });

  it('.fb2 находится среди служебных файлов архива', async () => {
    const r = await parseBook(file('kniga.zip', zipOf({'readme.txt': 'привет', 'k.fb2': FB2})));
    expect(r.title).toBe('Мёртвые души');
  });

  it('архив без книги внутри — отказ с кодом unsupported', async () => {
    const e = await parseBook(file('arh.zip', zipOf({'a.txt': 'раз', 'b.txt': 'два'}))).catch(x => x);
    expect(e.code).toBe('unsupported');
  });
});

describe('parseBook() — простой текст', () => {
  it('.txt в utf-8 приходит как есть', async () => {
    expect((await parseBook(file('a.txt', 'Просто текст.'))).text).toBe('Просто текст.');
  });

  // Без этого русский .txt открывался строкой «Ð“Ð»Ð°Ð²Ð°»: TextDecoder по
  // умолчанию читает utf-8, а .txt из русской библиотеки почти всегда 1251.
  it('.txt в windows-1251 читается, а не превращается в ромбики', async () => {
    const r = await parseBook(file('a.txt', cp1251('Глава первая. Ёжик.')));
    expect(r.text).toBe('Глава первая. Ёжик.');
  });

  it('файл без расширения и без признаков формата читается текстом', async () => {
    expect((await parseBook(file('zametki', 'строка'))).text).toBe('строка');
  });
});

describe('parseBook() — отказы', () => {
  it('пустой файл — внятная ошибка', async () => {
    await expect(parseBook(file('a.txt', new Uint8Array()))).rejects.toThrow(/пуст/i);
  });

  it('чужое расширение — код unsupported', async () => {
    const e = await parseBook(file('kniga.pdf', '%PDF-1.4 и дальше двоичное')).catch(x => x);
    expect(e.code).toBe('unsupported');
  });

  it('в сообщении об ошибке нет undefined и null', async () => {
    for (const bad of [file('a.pdf', 'x'), file('a.zip', zipOf({'a.bin': 'x'}))]) {
      const e = await parseBook(bad).catch(x => x);
      expect(e.message).not.toMatch(/undefined|null|Cannot read/);
    }
  });
});
