// EPUB — это ZIP с XHTML внутри. Библиотеку-распаковщик не тянем: и ZIP, и
// inflate платформа умеет сама (DecompressionStream есть в Chrome 103+ и в
// Android WebView 103+), а лишняя зависимость — это лишние сотни килобайт apk
// ради формата, который читается сотней строк.
//
// Наружу отдаём то же, что и fb2.js: плоский текст с «\n\n» между абзацами и
// смещения глав В СИМВОЛАХ этого текста — одна координата с курсором чтения
// в сторе. Разметку выбрасываем: в React её всё равно не вставить, текст
// пользовательский и dangerouslySetInnerHTML запрещён.

const UTF8 = new TextDecoder('utf-8');

const squash = s => String(s).replace(/\s+/g, ' ').trim();

/**
 * Ошибка распаковки. Library по коду 'zip' показывает `lib.parse_failed_zip`
 * («обнови Android System WebView»): это единственный случай, когда виноват не
 * файл, а окружение, и пользователю есть что сделать.
 */
const zipError = msg => Object.assign(new Error(msg), {code: 'zip'});

/** Байты в Uint8Array; всё, что не похоже на байты, — ошибка, а не undefined. */
function toBytes(bytes) {
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // instanceof тут ненадёжен: у jsdom и Node разные реалмы, и ArrayBuffer из
  // одного не instanceof ArrayBuffer из другого. Проверяем внутренний класс.
  if (Object.prototype.toString.call(bytes) === '[object ArrayBuffer]') return new Uint8Array(bytes);
  throw new Error('Не похоже на файл: ожидались байты книги');
}

/* ===================== ZIP ===================== */

/**
 * Хвостовая запись каталога (EOCD). Ищем с конца: за ней может лежать комментарий
 * архива длиной до 64 КБ, поэтому «последние 22 байта» — недостаточно.
 */
function findEocd(u8) {
  const min = Math.max(0, u8.length - 22 - 0xffff);
  for (let i = u8.length - 22; i >= min; i--)
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) return i;
  return -1;
}

/** Central directory → карта «имя файла → где лежат данные». */
function readZip(u8) {
  const eocd = findEocd(u8);
  if (eocd < 0) throw new Error('Файл не похож на ZIP-архив');

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const count = dv.getUint16(eocd + 10, true);
  const files = new Map();
  let off = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50)
      throw new Error('Битая таблица файлов в ZIP-архиве');
    const nameLen = dv.getUint16(off + 28, true);
    files.set(UTF8.decode(u8.subarray(off + 46, off + 46 + nameLen)), {
      method: dv.getUint16(off + 10, true),
      csize: dv.getUint32(off + 20, true),
      lho: dv.getUint32(off + 42, true)
    });
    off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
  }
  return {u8, dv, files};
}

/**
 * Где начинаются данные записи. Длины имени и extra берём ИЗ ЛОКАЛЬНОГО
 * заголовка: в central directory extra-поле почти всегда другой длины (там
 * лежат свои атрибуты), и, посчитав по нему, попадёшь мимо данных.
 */
function dataAt(z, f) {
  if (f.lho + 30 > z.u8.length || z.dv.getUint32(f.lho, true) !== 0x04034b50)
    throw new Error('Битый локальный заголовок в ZIP-архиве');
  return f.lho + 30 + z.dv.getUint16(f.lho + 26, true) + z.dv.getUint16(f.lho + 28, true);
}

async function inflate(raw) {
  if (!raw.length) return raw;
  if (typeof DecompressionStream !== 'function')
    throw zipError('В этом WebView нет DecompressionStream — EPUB не распаковать');
  try {
    const src = new Response(raw).body.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(src).arrayBuffer());
  } catch (e) {
    throw zipError('Не удалось распаковать EPUB: ' + (e && e.message));
  }
}

/** Содержимое файла из архива или null, если такого файла нет. */
async function read(z, name) {
  const f = z.files.get(name);
  if (!f) return null;
  const at = dataAt(z, f);
  const raw = z.u8.subarray(at, at + f.csize);
  if (f.method === 0) return raw;
  if (f.method !== 8) throw new Error('Неподдерживаемый метод сжатия в ZIP: ' + f.method);
  return inflate(raw);
}

/* ===================== XML/XHTML ===================== */

/** Разбор с проверкой parsererror: без неё битый файл отдаёт пустой текст молча. */
function xml(str, mime = 'application/xml') {
  const doc = new DOMParser().parseFromString(str, mime);
  return doc.querySelector('parsererror') ? null : doc;
}

/**
 * Элементы по локальному имени. Именно по локальному: в OPF и container.xml
 * теги бывают и без префикса, и с ним (`<opf:item>`), а getElementsByTagName
 * в XML сравнивает имя целиком вместе с префиксом.
 */
const byTag = (root, name) =>
  [...root.getElementsByTagName('*')].filter(el => el.localName === name);

/**
 * Путь из OPF в путь внутри архива. Ссылки в OPF относительны ПАПКЕ OPF, а не
 * корню архива — это самая частая ошибка при чтении epub. Плюс проценты:
 * «Глава%201.xhtml» в архиве лежит под именем с пробелом.
 */
function resolve(base, href) {
  let path = String(href).split('#')[0].split('?')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* кривой процент — берём как есть, вдруг файл так и называется */
  }
  const out = [];
  for (const part of (base ? base + '/' + path : path).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

// Блочные элементы XHTML: каждый закрывает абзац. Всё остальное (em, strong,
// span, a) — инлайн и клеится встык.
const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'figure', 'figcaption',
  'hr', 'address', 'center', 'form', 'fieldset'
]);

const DROP = new Set(['script', 'style', 'svg', 'head', 'link', 'meta', 'noscript', 'template']);

/**
 * XHTML-файл → массив абзацев. Сначала строгий разбор, при ошибке — как HTML:
 * в живых книгах попадаются незакрытые теги, и ронять из-за них всю книгу
 * незачем, браузерный парсер их прощает.
 */
function paragraphs(str) {
  const doc = xml(str, 'application/xhtml+xml') || new DOMParser().parseFromString(str, 'text/html');
  const root = doc.body || doc.documentElement;
  if (!root) return {blocks: [], heading: ''};

  const blocks = [];
  let buf = '';
  const flush = () => {
    const v = squash(buf);
    buf = '';
    if (v) blocks.push(v);
  };

  const walk = node => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        buf += n.nodeValue;
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.localName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (tag === 'br') buf += ' ';
      else if (BLOCK.has(tag)) {
        flush();
        walk(n);
        flush();
      } else walk(n);
    }
  };
  walk(root);
  flush();

  const h = [...root.getElementsByTagName('*')]
    .find(el => /^h[1-6]$/.test(el.localName.toLowerCase()));
  return {blocks, heading: h ? squash(h.textContent) : ''};
}

/* ===================== разбор книги ===================== */

// Что вообще может быть текстом главы. Всё прочее (картинки, шрифты, css) в
// спайне игнорируем — иначе в книгу попадёт бинарный мусор.
const READABLE = ['application/xhtml+xml', 'text/html', 'application/x-dtbook+xml'];

/**
 * Разбирает EPUB.
 *
 * @param {ArrayBuffer|Uint8Array} bytes содержимое файла
 * @returns {Promise<{title: string, text: string, chapters: Array<{title: string, at: number}>}>}
 * @throws {Error} пустой файл, не-ZIP, не-EPUB; при неудачной распаковке
 *   у ошибки будет `code === 'zip'`
 */
export async function parseEpub(bytes) {
  const u8 = toBytes(bytes);
  if (!u8.length) throw new Error('Пустой файл');

  const z = readZip(u8);

  const containerRaw = await read(z, 'META-INF/container.xml');
  if (!containerRaw) throw new Error('В архиве нет META-INF/container.xml — это не EPUB');
  const container = xml(UTF8.decode(containerRaw));
  const rootfile = container && byTag(container, 'rootfile')[0];
  const opfPath = rootfile && rootfile.getAttribute('full-path');
  if (!opfPath) throw new Error('В container.xml нет пути к OPF');

  const opfRaw = await read(z, resolve('', opfPath));
  if (!opfRaw) throw new Error('OPF не найден по пути из container.xml: ' + opfPath);
  const opf = xml(UTF8.decode(opfRaw));
  if (!opf) throw new Error('OPF не разобрался как XML');

  const base = opfPath.split('/').slice(0, -1).join('/');

  const items = new Map();
  for (const el of byTag(opf, 'item')) {
    const id = el.getAttribute('id');
    if (id) items.set(id, {
      href: el.getAttribute('href') || '',
      type: (el.getAttribute('media-type') || '').toLowerCase(),
      props: el.getAttribute('properties') || ''
    });
  }

  const meta = byTag(opf, 'metadata')[0];
  const titleEl = meta && byTag(meta, 'title')[0];

  let text = '';
  const chapters = [];
  const nextAt = () => (text ? text.length + 2 : 0);

  // Порядок чтения задаёт spine, а не manifest: в manifest файлы лежат как
  // попало, и по нему книга собралась бы в случайном порядке.
  for (const ref of byTag(opf, 'itemref')) {
    const it = items.get(ref.getAttribute('idref'));
    if (!it || !it.href) continue;
    if (it.type && !READABLE.includes(it.type)) continue;
    if (/(^|\s)nav(\s|$)/.test(it.props)) continue;      // оглавление — навигация, не текст

    const raw = await read(z, resolve(base, it.href));
    if (!raw) continue;                                  // файла нет: читаем, что уцелело

    const {blocks, heading} = paragraphs(UTF8.decode(raw));
    if (!blocks.length) continue;                        // пустой файл главы не создаёт

    chapters.push({title: heading, at: nextAt()});
    text += (text ? '\n\n' : '') + blocks.join('\n\n');
  }

  return {title: titleEl ? squash(titleEl.textContent) : '', text, chapters};
}
