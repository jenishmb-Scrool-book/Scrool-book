import {describe, it, expect} from 'vitest';
import {parseEpub} from './epub.js';

/* ===== сборка ZIP прямо в тесте =====
   Готовый .epub в репозиторий не кладём: бинарник нельзя прочитать глазами и
   нельзя поправить в дифе. Пишем методом 0 (stored) — тогда сами тесты не
   зависят от наличия DecompressionStream в окружении, а deflate проверяется
   отдельно и только там, где CompressionStream есть. */

const u8 = str => new TextEncoder().encode(str);

const u16 = n => [n & 0xff, (n >> 8) & 0xff];
const u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** files: [{name, data: Uint8Array, method?: 0|8, raw?: Uint8Array}] */
function zip(files) {
  const local = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = u8(f.name);
    const body = f.data;
    const usize = f.usize === undefined ? body.length : f.usize;
    const head = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(f.method || 0),
      ...u16(0), ...u16(0),                    // время и дата — читателю не нужны
      ...u32(0),                               // CRC не считаем: распаковщик его не проверяет
      ...u32(body.length), ...u32(usize),
      ...u16(name.length), ...u16(0)
    ];
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(f.method || 0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(usize),
      ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(off),
      ...name
    ]);
    local.push([...head, ...name, ...body]);
    off += head.length + name.length + body.length;
  }
  const cdOff = off;
  const cd = central.flat();
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(cd.length), ...u32(cdOff), ...u16(0)
  ];
  return new Uint8Array([...local.flat(), ...cd, ...eocd]);
}

const CONTAINER = '<?xml version="1.0"?>'
  + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
  + '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>'
  + '</container>';

const opf = (title, items, spine) =>
  '<?xml version="1.0" encoding="utf-8"?>'
  + '<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
  + (title === null ? '' : '<dc:title>' + title + '</dc:title>')
  + '</metadata><manifest>'
  + items.map(i => '<item id="' + i.id + '" href="' + i.href + '" media-type="'
      + (i.type || 'application/xhtml+xml') + '"'
      + (i.props ? ' properties="' + i.props + '"' : '') + '/>').join('')
  + '</manifest><spine>'
  + spine.map(id => '<itemref idref="' + id + '"/>').join('')
  + '</spine></package>';

const page = body =>
  '<?xml version="1.0" encoding="utf-8"?>'
  + '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>служебный заголовок</title></head>'
  + '<body>' + body + '</body></html>';

/** Собирает epub из карты «путь → строка». */
const book = map => zip(Object.entries(map).map(([name, data]) => ({name, data: u8(data)})));

// Простейшая книга: OPF лежит в подпапке — самый частый источник ошибок
// с относительными путями.
const simple = () => book({
  'mimetype': 'application/epub+zip',
  'META-INF/container.xml': CONTAINER,
  'OEBPS/content.opf': opf('Название книги',
    [{id: 'c1', href: 'text/ch1.xhtml'}, {id: 'c2', href: 'text/ch2.xhtml'}], ['c1', 'c2']),
  'OEBPS/text/ch1.xhtml': page('<h1>Глава первая</h1><p>Раз.</p><p>Два.</p>'),
  'OEBPS/text/ch2.xhtml': page('<h1>Глава вторая</h1><p>Три.</p>')
});

describe('parseEpub() — отказы', () => {
  it('пустой ввод — внятная ошибка, а не падение по undefined', async () => {
    await expect(parseEpub(new Uint8Array())).rejects.toThrow(/пуст/i);
    await expect(parseEpub(new ArrayBuffer(0))).rejects.toThrow(/пуст/i);
  });

  it('null, число и строка — ошибка с человеческим текстом', async () => {
    for (const bad of [null, undefined, 42, 'строка']) {
      await expect(parseEpub(bad)).rejects.toThrow(Error);
      const e = await parseEpub(bad).catch(x => x);
      expect(e.message).not.toMatch(/undefined|null|Cannot read/);
    }
  });

  it('не ZIP — Error', async () => {
    await expect(parseEpub(u8('это не архив, а просто текст подлиннее двадцати двух байт')))
      .rejects.toThrow(/zip|архив/i);
  });

  it('ZIP без META-INF/container.xml — Error', async () => {
    await expect(parseEpub(book({'hello.txt': 'привет'}))).rejects.toThrow(/container/i);
  });

  it('container.xml без rootfile — Error', async () => {
    await expect(parseEpub(book({
      'META-INF/container.xml': '<?xml version="1.0"?><container><rootfiles/></container>'
    }))).rejects.toThrow(Error);
  });

  it('битый OPF — Error', async () => {
    await expect(parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': '<package><manifest></package>'
    }))).rejects.toThrow(Error);
  });
});

describe('parseEpub() — распаковка', () => {
  it('читает stored (метод 0)', async () => {
    const r = await parseEpub(simple());
    expect(r.title).toBe('Название книги');
    expect(r.text).toContain('Раз.');
  });

  it('принимает и ArrayBuffer, и Uint8Array', async () => {
    const bytes = simple();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(await parseEpub(copy)).toEqual(await parseEpub(bytes));
  });

  it('неизвестный метод сжатия — Error', async () => {
    const z = book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'c1', href: 'a.xhtml'}], ['c1'])
    });
    // Метод лежит и в локальном заголовке (смещение 8), и в central directory
    // (смещение 10 от начала записи). Читаем из central — правим оба.
    z[8] = 12;
    z[findSig(z, 0x02014b50) + 10] = 12;
    await expect(parseEpub(z)).rejects.toThrow(/сжат|метод/i);
  });

  it('без DecompressionStream и с методом 8 — ошибка с кодом zip', async () => {
    const z = book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'c1', href: 'a.xhtml'}], ['c1'])
    });
    z[8] = 8;
    z[findSig(z, 0x02014b50) + 10] = 8;

    const saved = globalThis.DecompressionStream;
    delete globalThis.DecompressionStream;
    try {
      const e = await parseEpub(z).catch(x => x);
      expect(e).toBeInstanceOf(Error);
      // Library по этому коду показывает lib.parse_failed_zip — «обнови WebView».
      expect(e.code).toBe('zip');
    } finally {
      globalThis.DecompressionStream = saved;
    }
  });

  const canDeflate = typeof CompressionStream === 'function';
  it.skipIf(!canDeflate)('читает deflate (метод 8), когда DecompressionStream есть', async () => {
    const deflate = async str => {
      const src = new Response(u8(str)).body.pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(src).arrayBuffer());
    };
    const raw = {
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Сжатая', [{id: 'c1', href: 'ch1.xhtml'}], ['c1']),
      'OEBPS/ch1.xhtml': page('<p>' + 'Длинный повторяющийся текст. '.repeat(30) + '</p>')
    };
    const files = [];
    for (const [name, str] of Object.entries(raw))
      files.push({name, data: await deflate(str), usize: u8(str).length, method: 8});
    const r = await parseEpub(zip(files));
    expect(r.title).toBe('Сжатая');
    expect(r.text).toContain('Длинный повторяющийся текст.');
  });
});

describe('parseEpub() — структура книги', () => {
  it('пути в OPF считаются от папки OPF, а не от корня архива', async () => {
    const r = await parseEpub(simple());
    expect(r.text).toContain('Раз.');
    expect(r.text).toContain('Три.');
  });

  it('порядок глав берётся из spine, а не из manifest', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т',
        [{id: 'a', href: 'a.xhtml'}, {id: 'b', href: 'b.xhtml'}], ['b', 'a']),
      'OEBPS/a.xhtml': page('<p>первый в манифесте</p>'),
      'OEBPS/b.xhtml': page('<p>первый в спайне</p>')
    }));
    expect(r.text.indexOf('первый в спайне')).toBeLessThan(r.text.indexOf('первый в манифесте'));
  });

  it('href с процентным кодированием разрешается в имя файла', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'Глава%201.xhtml'}], ['a']),
      'OEBPS/Глава 1.xhtml': page('<p>нашлось</p>')
    }));
    expect(r.text).toBe('нашлось');
  });

  it('href с ../ выходит из папки OPF', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: '../text/a.xhtml'}], ['a']),
      'text/a.xhtml': page('<p>снаружи</p>')
    }));
    expect(r.text).toBe('снаружи');
  });

  it('заголовка нет — пустая строка, имя файла подставит вызывающий', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf(null, [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<p>текст</p>')
    }));
    expect(r.title).toBe('');
  });

  it('пропавший файл спайна не роняет разбор — читаем что есть', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т',
        [{id: 'a', href: 'a.xhtml'}, {id: 'b', href: 'нет.xhtml'}], ['a', 'b']),
      'OEBPS/a.xhtml': page('<p>уцелевший</p>')
    }));
    expect(r.text).toBe('уцелевший');
  });

  it('картинки и оглавление (nav) в текст не попадают', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [
        {id: 'nav', href: 'nav.xhtml', props: 'nav'},
        {id: 'img', href: 'cover.png', type: 'image/png'},
        {id: 'a', href: 'a.xhtml'}
      ], ['nav', 'img', 'a']),
      'OEBPS/nav.xhtml': page('<nav><ol><li>Оглавление тут</li></ol></nav>'),
      'OEBPS/cover.png': 'не картинка, но и не важно',
      'OEBPS/a.xhtml': page('<p>текст книги</p>')
    }));
    expect(r.text).toBe('текст книги');
  });
});

describe('parseEpub() — текст и главы', () => {
  it('абзацы разделены пустой строкой, инлайн-разметка склеена', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Он был <em>очень</em> <b>зол</b>.</p><p>Второй абзац.</p>')
    }));
    expect(r.text).toBe('Он был очень зол.\n\nВторой абзац.');
  });

  it('script и style выброшены', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<style>p{color:red}</style><script>alert(1)</script><p>только текст</p>')
    }));
    expect(r.text).toBe('только текст');
  });

  it('вложенные блоки не слипаются в один абзац', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<div><div><p>раз</p><p>два</p></div></div>')
    }));
    expect(r.text).toBe('раз\n\nдва');
  });

  it('битый XHTML разбирается как HTML, а не роняет книгу', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': '<html><body><p>незакрытый абзац<br>ещё<p>второй</body></html>'
    }));
    expect(r.text).toContain('незакрытый абзац');
    expect(r.text).toContain('второй');
  });

  it('глава на каждый файл спайна, заголовок берётся из первого h1..h6', async () => {
    const r = await parseEpub(simple());
    expect(r.chapters.map(c => c.title)).toEqual(['Глава первая', 'Глава вторая']);
  });

  // То же свойство, что и в fb2: at — смещение в символах внутри text,
  // одна координата с курсором чтения в сторе.
  it('at указывает ровно на начало заголовка главы в text', async () => {
    const r = await parseEpub(simple());
    for (const c of r.chapters) expect(r.text.slice(c.at, c.at + c.title.length)).toBe(c.title);
  });

  it('at первой главы — 0, дальше строго возрастает и не вылезает за text', async () => {
    const r = await parseEpub(simple());
    expect(r.chapters[0].at).toBe(0);
    for (let i = 1; i < r.chapters.length; i++)
      expect(r.chapters[i].at).toBeGreaterThan(r.chapters[i - 1].at);
    for (const c of r.chapters) expect(c.at).toBeLessThan(r.text.length);
  });

  it('файл без заголовка — глава с пустым title, at на первом абзаце', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Просто текст.</p>')
    }));
    expect(r.chapters).toEqual([{title: '', at: 0}]);
  });

  it('пустой файл спайна главы не создаёт', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т',
        [{id: 'a', href: 'a.xhtml'}, {id: 'b', href: 'b.xhtml'}], ['a', 'b']),
      'OEBPS/a.xhtml': page('<p>текст</p>'),
      'OEBPS/b.xhtml': page('<div>   </div>')
    }));
    expect(r.chapters).toHaveLength(1);
  });

  it('книга без единого читаемого абзаца — пустой text, а не исключение', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('Т', [{id: 'a', href: 'a.xhtml'}], ['a']),
      'OEBPS/a.xhtml': page('<div>  </div>')
    }));
    expect(r.text).toBe('');
    expect(r.chapters).toEqual([]);
  });
});

/** Смещение первой сигнатуры (little-endian u32) в массиве. */
function findSig(bytes, sig) {
  const want = [sig & 0xff, (sig >>> 8) & 0xff, (sig >>> 16) & 0xff, (sig >>> 24) & 0xff];
  for (let i = 0; i <= bytes.length - 4; i++)
    if (bytes[i] === want[0] && bytes[i + 1] === want[1]
      && bytes[i + 2] === want[2] && bytes[i + 3] === want[3]) return i;
  return -1;
}
