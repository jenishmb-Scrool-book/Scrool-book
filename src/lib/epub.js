// EPUB — это ZIP с XHTML внутри. Сам архив разбирает lib/zip.js: код оттуда
// уехал, когда в архиве приехал ещё и FB2, — здесь остался только EPUB.
//
// Наружу отдаём то же, что и fb2.js: плоский текст с «\n\n» между абзацами и
// смещения глав В СИМВОЛАХ этого текста — одна координата с курсором чтения
// в сторе. Разметку выбрасываем: в React её всё равно не вставить, текст
// пользовательский и dangerouslySetInnerHTML запрещён.

//
// Картинки, наоборот, выбрасывать перестали: их отдаём отдельным списком, где
// у каждой то же смещение в символах. Сам файл картинки лежит в архиве рядом
// с главой, и ссылка на него относительна ФАЙЛУ ГЛАВЫ, а не корню и не папке
// OPF, — на этом спотыкается любой читатель epub, написанный за вечер.
import {budget, mimeOf, toB64} from './img.js';
import {openZip, toBytes} from './zip.js';

const UTF8 = new TextDecoder('utf-8');

const squash = s => String(s).replace(/\s+/g, ' ').trim();

const XLINK = 'http://www.w3.org/1999/xlink';

/** Ссылка `xlink:href`: у неё бывает любой префикс, поэтому спрашиваем и по имени, и по НП. */
const hrefOf = el =>
  el.getAttributeNS(XLINK, 'href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';

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

// `svg` в этом списке больше нет: обложка в epub сплошь и рядом завёрнута
// именно в него, и, выбрасывая тег целиком, мы выбрасывали её вместе с ним.
// Текста внутри svg мы по-прежнему не берём — только ссылку на картинку.
const DROP = new Set(['script', 'style', 'head', 'link', 'meta', 'noscript', 'template']);

/**
 * XHTML-файл → массив абзацев и ссылки на картинки.
 *
 * Сначала строгий разбор, при ошибке — как HTML: в живых книгах попадаются
 * незакрытые теги, и ронять из-за них всю книгу незачем, браузерный парсер их
 * прощает.
 *
 * У картинки запоминается НОМЕР СЛЕДУЮЩЕГО АБЗАЦА, а не смещение: смещения
 * этой главы в общем тексте здесь ещё никто не знает. Переводит номер в
 * смещение тот, кто склеивает главы.
 */
function paragraphs(str) {
  const doc = xml(str, 'application/xhtml+xml') || new DOMParser().parseFromString(str, 'text/html');
  const root = doc.body || doc.documentElement;
  if (!root) return {blocks: [], heading: '', pics: []};

  const blocks = [];
  const pics = [];
  let buf = '';
  const flush = () => {
    const v = squash(buf);
    buf = '';
    if (v) blocks.push(v);
  };

  // Картинка закрывает абзац: в разметке она стоит между ними, а не внутри.
  const addPic = href => {
    const v = String(href || '').trim();
    if (!v) return;
    flush();
    pics.push({href: v, block: blocks.length});
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
      if (tag === 'img') addPic(n.getAttribute('src'));
      else if (tag === 'image') addPic(hrefOf(n));
      else if (tag === 'svg') {
        // Внутрь заходим только за ссылками: подписи и `<text>` в svg — часть
        // рисунка, и в потоке чтения они выглядели бы обрывком без начала.
        for (const im of n.getElementsByTagName('*'))
          if (im.localName.toLowerCase() === 'image') addPic(hrefOf(im));
      } else if (tag === 'br') buf += ' ';
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
  return {blocks, heading: h ? squash(h.textContent) : '', pics};
}

/* ===================== разбор книги ===================== */

// Что вообще может быть текстом главы. Всё прочее (картинки, шрифты, css) в
// спайне игнорируем — иначе в книгу попадёт бинарный мусор.
const READABLE = ['application/xhtml+xml', 'text/html', 'application/x-dtbook+xml'];

/**
 * id обложки в манифесте. Объявляют её двумя способами, и оба живые:
 * `properties="cover-image"` (epub3) и `<meta name="cover" content="id">`
 * (epub2, которого в библиотеках до сих пор больше).
 */
function coverId(opf, items) {
  for (const [id, it] of items) if (/(^|\s)cover-image(\s|$)/.test(it.props)) return id;
  const m = byTag(opf, 'meta').find(el => (el.getAttribute('name') || '').toLowerCase() === 'cover');
  return (m && m.getAttribute('content')) || '';
}

/**
 * Ссылки → сами картинки. Один файл читается один раз, даже если ссылок на него
 * несколько: у книг с виньеткой между сценами их бывают десятки.
 *
 * Ничто здесь не имеет права уронить книгу. Битая запись в архиве, неизвестный
 * формат, картинка на десять мегабайт — всё это просто пропускается: текст уже
 * разобран, и терять его из-за иллюстрации нельзя.
 */
async function pictures(z, refs, types) {
  const fits = budget();
  const done = new Map();          // путь → {type, data} либо null, если не взяли
  const seen = new Set();
  const out = [];

  for (const r of refs) {
    const key = r.path + '@' + r.at;
    if (!r.path || seen.has(key)) continue;              // обложка бывает объявлена дважды
    seen.add(key);

    let img = done.get(r.path);
    if (img === undefined) {
      img = null;
      const type = mimeOf(types.get(r.path), r.path);
      if (type) {
        try {
          const bytes = await z.read(r.path);
          if (bytes && fits(bytes.length)) img = {type, data: toB64(bytes)};
        } catch {
          /* битая запись в архиве — эта картинка просто не покажется */
        }
      }
      done.set(r.path, img);
    }
    if (img) out.push({at: r.at, type: img.type, data: img.data});
  }
  return out;
}

/**
 * Разбирает EPUB.
 *
 * @param {ArrayBuffer|Uint8Array} bytes содержимое файла
 * @returns {Promise<{title: string, text: string, chapters: Array<{title: string, at: number}>,
 *   images: Array<{at: number, type: string, data: string}>}>}
 * @throws {Error} пустой файл, не-ZIP, не-EPUB; при неудачной распаковке
 *   у ошибки будет `code === 'zip'`
 */
export async function parseEpub(bytes) {
  const u8 = toBytes(bytes);
  if (!u8.length) throw new Error('Пустой файл');

  const z = openZip(u8);

  const containerRaw = await z.read('META-INF/container.xml');
  if (!containerRaw) throw new Error('В архиве нет META-INF/container.xml — это не EPUB');
  const container = xml(UTF8.decode(containerRaw));
  const rootfile = container && byTag(container, 'rootfile')[0];
  const opfPath = rootfile && rootfile.getAttribute('full-path');
  if (!opfPath) throw new Error('В container.xml нет пути к OPF');

  const opfRaw = await z.read(resolve('', opfPath));
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

  // Тип картинки берём из манифеста: расширение бывает и .img, и вовсе без
  // точки, а media-type там объявлен для каждого файла.
  const types = new Map();
  for (const it of items.values()) if (it.href) types.set(resolve(base, it.href), it.type);

  let text = '';
  const chapters = [];
  // Ссылки на картинки: путь в архиве и смещение в тексте. Обложка идёт первой
  // и нулевым смещением — она и в книге стоит до первой страницы.
  const refs = [];
  const cover = items.get(coverId(opf, items));
  if (cover && cover.href) refs.push({path: resolve(base, cover.href), at: 0});
  const nextAt = () => (text ? text.length + 2 : 0);

  // Порядок чтения задаёт spine, а не manifest: в manifest файлы лежат как
  // попало, и по нему книга собралась бы в случайном порядке.
  for (const ref of byTag(opf, 'itemref')) {
    const it = items.get(ref.getAttribute('idref'));
    if (!it || !it.href) continue;
    if (it.type && !READABLE.includes(it.type)) continue;
    if (/(^|\s)nav(\s|$)/.test(it.props)) continue;      // оглавление — навигация, не текст

    const path = resolve(base, it.href);
    const raw = await z.read(path);
    if (!raw) continue;                                  // файла нет: читаем, что уцелело

    const {blocks, heading, pics} = paragraphs(UTF8.decode(raw));
    const at = nextAt();

    // Смещение каждого абзаца этой главы в общем тексте: между абзацами «\n\n».
    let off = 0;
    const starts = blocks.map(b => {
      const v = at + off;
      off += b.length + 2;
      return v;
    });
    // Ссылки собираем ДО проверки на пустоту. Глава из одной картинки без
    // единого абзаца — это обложка или вклейка, и таких в epub большинство:
    // выйди мы отсюда раньше, именно они бы и терялись. Такая картинка встаёт
    // на смещение, с которого начнётся следующая глава.
    const dir = path.split('/').slice(0, -1).join('/');
    for (const p of pics)
      refs.push({
        path: resolve(dir, p.href),
        // За последним абзацем главы «следующий абзац» — это первый абзац главы
        // следующей: та же формула, продолженная на один шаг. У самой последней
        // картинки книги смещение окажется за концом текста, и стор подожмёт
        // его к последнему куску.
        at: p.block < blocks.length ? starts[p.block] : at + off
      });

    if (!blocks.length) continue;                        // пустой файл главы не создаёт

    chapters.push({title: heading, at});
    text += (text ? '\n\n' : '') + blocks.join('\n\n');
  }

  return {
    title: titleEl ? squash(titleEl.textContent) : '',
    text,
    chapters,
    images: await pictures(z, refs, types)
  };
}
