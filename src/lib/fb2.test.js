import {describe, it, expect} from 'vitest';
import {parseFb2} from './fb2.js';

// windows-1251 кодировщика в браузере нет (TextEncoder умеет только utf-8),
// поэтому фикстуру собираем байтами руками. Бинарники в репозиторий не кладём:
// книга в 1251 — главный подводный камень формата, и тест должен читаться
// глазами, а не быть blob'ом, которому предлагается поверить.
const EXTRA = {'«': 0xab, '»': 0xbb, '—': 0x97, '…': 0x85, '№': 0xb9, 'Ё': 0xa8, 'ё': 0xb8};
const cp1251 = str => {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i], c = str.charCodeAt(i);
    if (c < 0x80) out[i] = c;
    else if (EXTRA[ch] !== undefined) out[i] = EXTRA[ch];
    else if (c >= 0x410 && c <= 0x44f) out[i] = c - 0x410 + 0xc0;
    else throw new Error('символ вне windows-1251: ' + ch);
  }
  return out;
};

const utf8 = str => new TextEncoder().encode(str);

// Минимальный валидный FB2. Пространство имён настоящее — селекторы обязаны
// работать и с ним, иначе на живых книгах всё развалится.
const fb2 = (title, body) =>
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">' +
  '<description><title-info><book-title>' + title + '</book-title></title-info></description>' +
  '<body>' + body + '</body></FictionBook>';

describe('parseFb2() — отказы', () => {
  it('пустой ввод — внятная ошибка, а не падение по undefined', () => {
    expect(() => parseFb2(new Uint8Array())).toThrow(/пуст/i);
    expect(() => parseFb2(new ArrayBuffer(0))).toThrow(/пуст/i);
  });

  it('null, число и строка — тоже ошибка с человеческим текстом', () => {
    for (const bad of [null, undefined, 42, 'строка']) {
      expect(() => parseFb2(bad)).toThrow(Error);
      try {
        parseFb2(bad);
      } catch (e) {
        expect(e.message).not.toMatch(/undefined|null|Cannot read/);
      }
    }
  });

  it('битый XML — Error, а не молчаливый мусор', () => {
    expect(() => parseFb2(utf8('<FictionBook><body><p>раз</body></FictionBook>'))).toThrow(/XML/i);
  });

  it('не XML вообще — Error', () => {
    expect(() => parseFb2(utf8('просто текст книги, никакого XML'))).toThrow(Error);
  });

  it('XML без body — Error: читать нечего', () => {
    expect(() => parseFb2(utf8('<?xml version="1.0"?><FictionBook><description/></FictionBook>')))
      .toThrow(/body|текст/i);
  });
});

describe('parseFb2() — заголовок и кодировка', () => {
  it('берёт book-title из description', () => {
    expect(parseFb2(utf8(fb2('Мёртвые души', '<section><p>раз</p></section>'))).title)
      .toBe('Мёртвые души');
  });

  it('заголовка нет — пустая строка, имя файла подставит вызывающий', () => {
    const src = '<?xml version="1.0"?><FictionBook><body><section><p>раз</p></section></body></FictionBook>';
    expect(parseFb2(utf8(src)).title).toBe('');
  });

  it('читает windows-1251 по объявлению в XML-декларации', () => {
    const src = '<?xml version="1.0" encoding="windows-1251"?>'
      + '<FictionBook><description><title-info><book-title>Ёжик — «Пример»</book-title></title-info></description>'
      + '<body><section><title><p>Глава первая</p></title>'
      + '<p>Съешь ещё этих мягких булок.</p></section></body></FictionBook>';
    const r = parseFb2(cp1251(src));
    expect(r.title).toBe('Ёжик — «Пример»');
    expect(r.text).toContain('Съешь ещё этих мягких булок.');
    expect(r.text).not.toContain('�');   // ромбики с вопросом = кодировку угадали неверно
  });

  it('один и тот же документ в utf-8 и в 1251 даёт одинаковый результат', () => {
    const inner = '<description><title-info><book-title>Тест</book-title></title-info></description>'
      + '<body><section><p>Ёлка и ёж</p></section></body>';
    const a = parseFb2(cp1251('<?xml version="1.0" encoding="windows-1251"?><FictionBook>' + inner + '</FictionBook>'));
    const b = parseFb2(utf8('<?xml version="1.0" encoding="utf-8"?><FictionBook>' + inner + '</FictionBook>'));
    expect(a).toEqual(b);
  });

  it('неизвестная кодировка — фолбэк на utf-8, не падаем', () => {
    const src = '<?xml version="1.0" encoding="x-cp20866-bogus"?>'
      + '<FictionBook><body><section><p>Текст</p></section></body></FictionBook>';
    expect(parseFb2(utf8(src)).text).toBe('Текст');
  });

  it('принимает и ArrayBuffer, и Uint8Array', () => {
    const bytes = utf8(fb2('Т', '<section><p>раз</p></section>'));
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(parseFb2(copy)).toEqual(parseFb2(bytes));
  });
});

describe('parseFb2() — текст', () => {
  it('абзацы разделены пустой строкой', () => {
    const r = parseFb2(utf8(fb2('Т', '<section><p>раз</p><p>два</p></section>')));
    expect(r.text).toBe('раз\n\nдва');
  });

  it('выбрасывает разметку внутри абзаца, оставляя слова', () => {
    const r = parseFb2(utf8(fb2('Т',
      '<section><p>Он был <emphasis>очень</emphasis> <strong>зол</strong>.</p></section>')));
    expect(r.text).toBe('Он был очень зол.');
  });

  it('схлопывает переносы строк внутри абзаца', () => {
    const r = parseFb2(utf8(fb2('Т', '<section><p>первая строка\n     вторая строка</p></section>')));
    expect(r.text).toBe('первая строка вторая строка');
  });

  it('пустые абзацы и empty-line не оставляют дыр', () => {
    const r = parseFb2(utf8(fb2('Т', '<section><p>раз</p><p>   </p><empty-line/><p>два</p></section>')));
    expect(r.text).toBe('раз\n\nдва');
  });

  it('сноски не оставляют болтающихся «[1]» посреди фразы', () => {
    const r = parseFb2(utf8(fb2('Т',
      '<section><p>Слово<a type="note">[1]</a> дальше.</p></section>')));
    expect(r.text).toBe('Слово дальше.');
  });

  it('body name="notes" в основной текст не попадает', () => {
    const src = '<?xml version="1.0"?><FictionBook>'
      + '<body><section><p>основной текст</p></section></body>'
      + '<body name="notes"><section><p>примечание переводчика</p></section></body>'
      + '</FictionBook>';
    const r = parseFb2(utf8(src));
    expect(r.text).toBe('основной текст');
    expect(r.chapters).toHaveLength(1);
  });

  it('стихи (v) идут строками-абзацами, а не одной кашей', () => {
    const r = parseFb2(utf8(fb2('Т',
      '<section><poem><stanza><v>Мой дядя</v><v>самых честных</v></stanza></poem></section>')));
    expect(r.text).toBe('Мой дядя\n\nсамых честных');
  });
});

describe('parseFb2() — главы и смещения', () => {
  const book = fb2('Т',
    '<section><title><p>Глава первая</p></title><p>Текст первой главы.</p></section>' +
    '<section><title><p>Глава вторая</p></title><p>Текст второй главы.</p></section>');

  it('находит все секции', () => {
    expect(parseFb2(utf8(book)).chapters.map(c => c.title))
      .toEqual(['Глава первая', 'Глава вторая']);
  });

  // Главное свойство контракта: at — смещение В СИМВОЛАХ внутри text, ровно
  // такое же, как курсор чтения в сторе. Не индекс главы и не номер фрагмента.
  it('at указывает ровно на начало заголовка главы в text', () => {
    const r = parseFb2(utf8(book));
    for (const c of r.chapters) expect(r.text.slice(c.at, c.at + c.title.length)).toBe(c.title);
  });

  it('at первой главы — 0, дальше строго возрастает', () => {
    const r = parseFb2(utf8(book));
    expect(r.chapters[0].at).toBe(0);
    for (let i = 1; i < r.chapters.length; i++)
      expect(r.chapters[i].at).toBeGreaterThan(r.chapters[i - 1].at);
  });

  it('at не выходит за пределы text', () => {
    const r = parseFb2(utf8(book));
    for (const c of r.chapters) {
      expect(c.at).toBeGreaterThanOrEqual(0);
      expect(c.at).toBeLessThan(r.text.length);
    }
  });

  it('секция без заголовка — глава с пустым title, at на первом абзаце', () => {
    const r = parseFb2(utf8(fb2('Т', '<section><p>Без заголовка.</p></section>')));
    expect(r.chapters).toEqual([{title: '', at: 0}]);
    expect(r.text.slice(0, 5)).toBe('Без з');
  });

  it('пустая секция главы не создаёт', () => {
    const r = parseFb2(utf8(fb2('Т', '<section><p>раз</p></section><section></section>')));
    expect(r.chapters).toHaveLength(1);
  });

  it('вложенные секции дают свои главы', () => {
    const r = parseFb2(utf8(fb2('Т',
      '<section><title><p>Часть</p></title>' +
      '<section><title><p>Глава</p></title><p>текст</p></section></section>')));
    expect(r.chapters.map(c => c.title)).toEqual(['Часть', 'Глава']);
    for (const c of r.chapters) expect(r.text.slice(c.at, c.at + c.title.length)).toBe(c.title);
  });

  it('многострочный заголовок склеивается в один абзац — иначе at врал бы', () => {
    const r = parseFb2(utf8(fb2('Т',
      '<section><title><p>Глава I</p><p>О пользе чтения</p></title><p>текст</p></section>')));
    expect(r.chapters[0].title).toBe('Глава I О пользе чтения');
    expect(r.text.slice(0, r.chapters[0].title.length)).toBe(r.chapters[0].title);
  });
});
