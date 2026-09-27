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

  // «Блокнот» Windows сохраняет «Юникод» как UTF-16 с меткой порядка байтов:
  // в нём нули через байт, и без отдельной ветки он читался бы кашей.
  it('UTF-16 с меткой порядка байтов читается текстом', async () => {
    const s = 'Глава первая. Ёжик.';
    const le = new Uint8Array(2 + s.length * 2);
    le[0] = 0xff; le[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      le[2 + i * 2] = s.charCodeAt(i) & 0xff;
      le[3 + i * 2] = s.charCodeAt(i) >> 8;
    }
    expect((await parseBook(file('a.txt', le))).text).toBe(s);
    const be = new Uint8Array(le.length);
    be[0] = 0xfe; be[1] = 0xff;
    for (let i = 2; i < le.length; i += 2) {be[i] = le[i + 1]; be[i + 1] = le[i];}
    expect((await parseBook(file('b', be))).text).toBe(s);
  });
});

describe('parseBook() — отказы', () => {
  it('пустой файл — внятная ошибка и свой код', async () => {
    const e = await parseBook(file('a.txt', new Uint8Array())).catch(x => x);
    expect(e.message).toMatch(/пуст/i);
    expect(e.code).toBe('empty');
  });

  // PDF — то, что пробуют первым, и у него свой ответ: не «формат не тот», а
  // «вот почему и что взять вместо».
  it('PDF узнаётся по содержимому — и с расширением, и без', async () => {
    for (const name of ['kniga.pdf', 'kniga', 'kniga.txt']) {
      const e = await parseBook(file(name, '%PDF-1.4 и дальше двоичное')).catch(x => x);
      expect(e.code, name).toBe('pdf');
    }
  });

  it('чужое расширение — код unsupported', async () => {
    const e = await parseBook(file('kniga.docx', 'что-то')).catch(x => x);
    expect(e.code).toBe('unsupported');
  });

  // Имя из content:// бывает любым: картинка или документ без расширения,
  // а то и с «.txt», раньше ложились книгой из управляющих символов.
  it('двоичный файл под именем текста — отказ, а не книга из мусора', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    for (const name of ['kartinka', 'kniga.txt']) {
      const e = await parseBook(file(name, png)).catch(x => x);
      expect(e.code, name).toBe('binary');
    }
    const noisy = new Uint8Array(400).map((_, i) => (i % 7 === 0 ? 0x01 : 0x41));
    expect((await parseBook(file('x.txt', noisy)).catch(x => x)).code).toBe('binary');
  });

  it('текст с табуляциями и переводами строк — всё ещё текст', async () => {
    const r = await parseBook(file('a.txt', 'Раз\tдва\r\nтри\fчетыре'));
    expect(r.text).toBe('Раз\tдва\r\nтри\fчетыре');
  });

  it('в сообщении об ошибке нет undefined и null', async () => {
    for (const bad of [file('a.pdf', 'x'), file('a.zip', zipOf({'a.bin': 'x'}))]) {
      const e = await parseBook(bad).catch(x => x);
      expect(e.message).not.toMatch(/undefined|null|Cannot read/);
    }
  });
});

describe('parseBook() — документ Word', () => {
  it('узнаётся по содержимому архива и получает свой код', async () => {
    const docx = zipOf({'[Content_Types].xml': '<Types/>', 'word/document.xml': '<w:document/>'});
    for (const name of ['kniga.docx', 'kniga']) {
      const e = await parseBook(file(name, docx)).catch(x => x);
      expect(e.code, name).toBe('docx');
    }
  });
});

