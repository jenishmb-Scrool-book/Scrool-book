import {describe, it, expect} from 'vitest';
import {parseEpub} from './epub.js';
import {toB64} from './img.js';
import {u8, zipOf as book, zip} from './zip.fixture.js';

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

/* ===== картинки =====
   В epub картинка это отдельный файл архива, а в главе от неё стоит ссылка —
   относительная ФАЙЛУ ГЛАВЫ. Проверяем и путь, и смещение, на которое она
   встала в общем тексте. */

// 600 байт: больше порога MIN. Настоящий PNG не нужен — парсер картинку не
// декодирует, он перекладывает байты в base64.
const PIC = (() => {
  const a = new Uint8Array(600);
  for (let i = 0; i < a.length; i++) a[i] = i % 256;
  return a;
})();
const PIC_B64 = toB64(PIC);

describe('parseEpub() — картинки', () => {
  it('картинка в главе встаёт на начало следующего абзаца', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.png', type: 'image/png'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p><img src="p.png"/><p>Два.</p>'),
      'OEBPS/p.png': PIC
    }));
    expect(r.text).toBe('Раз.\n\nДва.');
    expect(r.images).toHaveLength(1);
    expect(r.images[0]).toEqual({at: r.text.indexOf('Два.'), type: 'image/png', data: PIC_B64});
  });

  // Самая частая ошибка при чтении epub: путь считают от корня или от папки
  // OPF, а он считается от файла главы.
  it('ссылка относительна файлу главы, а не корню архива', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'text/a.xhtml'}, {id: 'p', href: 'images/p.png', type: 'image/png'}], ['a']),
      'OEBPS/text/a.xhtml': page('<p>Раз.</p><img src="../images/p.png"/><p>Два.</p>'),
      'OEBPS/images/p.png': PIC
    }));
    expect(r.images).toHaveLength(1);
    expect(r.images[0].data).toBe(PIC_B64);
  });

  it('обложка epub3 встаёт нулевым смещением', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'},
         {id: 'c', href: 'cover.jpg', type: 'image/jpeg', props: 'cover-image'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p>'),
      'OEBPS/cover.jpg': PIC
    }));
    expect(r.images).toHaveLength(1);
    expect(r.images[0].at).toBe(0);
    expect(r.images[0].type).toBe('image/jpeg');
  });

  // epub2 в библиотеках до сих пор больше, чем epub3, и обложка там объявлена
  // строкой в метаданных.
  it('обложка epub2 объявлена через <meta name="cover">', async () => {
    const opf2 = '<?xml version="1.0" encoding="utf-8"?>'
      + '<package xmlns="http://www.idpf.org/2007/opf" version="2.0">'
      + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>К</dc:title>'
      + '<meta name="cover" content="c"/></metadata>'
      + '<manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>'
      + '<item id="c" href="cover.jpg" media-type="image/jpeg"/></manifest>'
      + '<spine><itemref idref="a"/></spine></package>';
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf2,
      'OEBPS/a.xhtml': page('<p>Раз.</p>'),
      'OEBPS/cover.jpg': PIC
    }));
    expect(r.images).toHaveLength(1);
    expect(r.images[0].at).toBe(0);
  });

  // Страница-вклейка без единого абзаца — это и есть обложка в большинстве
  // книг. Раньше такой файл выходил из разбора раньше, чем до картинки
  // доходило дело, и терялась ровно она.
  it('глава из одной картинки без текста не теряется', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'c', href: 'cover.xhtml'}, {id: 'a', href: 'a.xhtml'},
         {id: 'p', href: 'p.png', type: 'image/png'}], ['c', 'a']),
      'OEBPS/cover.xhtml': page('<div><img src="p.png"/></div>'),
      'OEBPS/a.xhtml': page('<p>Раз.</p>'),
      'OEBPS/p.png': PIC
    }));
    expect(r.text).toBe('Раз.');
    expect(r.chapters).toHaveLength(1);
    expect(r.images).toHaveLength(1);
    expect(r.images[0].at).toBe(0);
  });

  it('картинка внутри svg берётся, а текст из svg — нет', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.png', type: 'image/png'}], ['a']),
      'OEBPS/a.xhtml': page('<svg xmlns="http://www.w3.org/2000/svg"'
        + ' xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
        + '<text>подпись внутри рисунка</text><image xlink:href="p.png"/></svg><p>Раз.</p>'),
      'OEBPS/p.png': PIC
    }));
    expect(r.text).toBe('Раз.');
    expect(r.images).toHaveLength(1);
    expect(r.images[0].at).toBe(0);
  });

  it('один файл на двух местах читается один раз, а записей две', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.png', type: 'image/png'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p><img src="p.png"/><p>Два.</p><img src="p.png"/><p>Три.</p>'),
      'OEBPS/p.png': PIC
    }));
    expect(r.images.map(i => i.at)).toEqual([r.text.indexOf('Два.'), r.text.indexOf('Три.')]);
    expect(r.images[0].data).toBe(r.images[1].data);
  });

  it('svg-файл картинкой не берём', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.svg', type: 'image/svg+xml'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p><img src="p.svg"/><p>Два.</p>'),
      'OEBPS/p.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9"/></svg>'
    }));
    expect(r.images).toEqual([]);
  });

  it('распорка мельче порога пропускается', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.gif', type: 'image/gif'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p><img src="p.gif"/><p>Два.</p>'),
      'OEBPS/p.gif': new Uint8Array(64)
    }));
    expect(r.images).toEqual([]);
  });

  it('картинки нет в архиве — книга всё равно читается', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'p', href: 'p.png', type: 'image/png'}], ['a']),
      'OEBPS/a.xhtml': page('<p>Раз.</p><img src="p.png"/><p>Два.</p>')
    }));
    expect(r.text).toBe('Раз.\n\nДва.');
    expect(r.images).toEqual([]);
  });

  it('картинки не сдвигают смещения глав', async () => {
    const r = await parseEpub(book({
      'META-INF/container.xml': CONTAINER,
      'OEBPS/content.opf': opf('К',
        [{id: 'a', href: 'a.xhtml'}, {id: 'b', href: 'b.xhtml'},
         {id: 'p', href: 'p.png', type: 'image/png'}], ['a', 'b']),
      'OEBPS/a.xhtml': page('<h1>Первая</h1><p>Раз.</p><img src="p.png"/>'),
      'OEBPS/b.xhtml': page('<h1>Вторая</h1><p>Два.</p>'),
      'OEBPS/p.png': PIC
    }));
    expect(r.chapters.map(c => c.at)).toEqual([0, r.text.indexOf('Вторая')]);
    expect(r.images[0].at).toBe(r.text.indexOf('Вторая'));
  });

  it('книга без картинок отдаёт пустой список, а не undefined', async () => {
    expect((await parseEpub(simple())).images).toEqual([]);
  });
});
