// FB2 — это XML. Разбираем штатным DOMParser: своего парсера здесь не нужно,
// а зависимость ради формата, который умеет платформа, — лишний вес в apk.
//
// Наружу отдаём плоский текст, а не разметку. Причина не в лени: чанкер режет
// книгу по абзацам и предложениям, разметка ему не нужна, а вставить её в React
// всё равно нельзя — текст пользовательский, dangerouslySetInnerHTML запрещён.
//
// Смещения глав считаются в символах ИТОГОВОГО text — это та же координата,
// что и курсор чтения в сторе. Индекс главы или номер фрагмента для этого не
// годятся: у каждого экрана своя нарезка.
//
// Картинки — по той же координате. Сами они лежат в конце файла отдельными
// `<binary>` в base64, а в тексте от них стоит только ссылка; мы запоминаем,
// на каком смещении стояла ссылка, и достаём вложение уже по ней.
import {budget, mimeOf, sizeOfB64} from './img.js';

// Абзацеобразующие элементы FB2: каждый даёт отдельный кусок текста.
// `v` — строка стиха, `th`/`td` — ячейки таблицы (лучше строкой, чем слитно).
const BLOCK = new Set(['p', 'v', 'subtitle', 'text-author', 'th', 'td']);

// В ТЕКСТ не идут ни вложения, ни аннотация. `image` в этом списке больше нет:
// картинка в текст по-прежнему не попадает, но теперь она запоминается
// отдельно — со смещением, по которому её найдёт карточка.
const SKIP = new Set(['binary', 'annotation', 'empty-line']);

const squash = s => String(s).replace(/\s+/g, ' ').trim();

const XLINK = 'http://www.w3.org/1999/xlink';

/**
 * id вложения, на которое ссылается `<image>`.
 *
 * Пишут это по-разному: `l:href`, `xlink:href`, изредка просто `href`. Через
 * `getAttributeNS` тоже спрашиваем, потому что префикс в файле бывает не `l`,
 * а любой — привязка идёт к пространству имён, а не к букве перед двоеточием.
 */
const refOf = el => {
  const href = el.getAttributeNS(XLINK, 'href')
    || el.getAttribute('l:href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';
  return href.replace(/^#/, '').trim();
};

/** Байты в Uint8Array; всё, что не похоже на байты, — ошибка, а не undefined. */
function toBytes(bytes) {
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // instanceof тут ненадёжен: у jsdom и Node разные реалмы, и ArrayBuffer из
  // одного не instanceof ArrayBuffer из другого. Проверяем внутренний класс.
  if (Object.prototype.toString.call(bytes) === '[object ArrayBuffer]') return new Uint8Array(bytes);
  throw new Error('Не похоже на файл: ожидались байты книги');
}

/**
 * Кодировка из XML-декларации. Русские FB2 сплошь и рядом в windows-1251,
 * а TextDecoder по умолчанию читает utf-8 и превращает их в ромбики.
 * Декларация — чистый ASCII, поэтому первые байты можно смотреть как latin1
 * ещё до того, как настоящая кодировка известна.
 */
function sniffEncoding(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';   // BOM главнее декларации
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 200));
  const m = /<\?xml[^>]*?encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head);
  return m ? m[1] : 'utf-8';
}

function decode(bytes) {
  const enc = sniffEncoding(bytes);
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    // Экзотическая или выдуманная кодировка — не повод отказывать в книге.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Текст блочного элемента без разметки. Сноски (`<a type="note">`) выкидываем:
 * их тело лежит в `<body name="notes">`, который мы не читаем, и «[1]» посреди
 * фразы был бы мусором, который потом попадёт в карточку.
 */
function flat(el) {
  let s = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue;
    else if (n.nodeType === 1) {
      if (n.localName === 'a' && (n.getAttribute('type') || '') === 'note') continue;
      // Пробел добавляем только после блочных вложений (заголовок из нескольких
      // `<p>`). Инлайн клеим встык, иначе «зол</strong>.» превратится в «зол .».
      s += flat(n) + (BLOCK.has(n.localName) ? ' ' : '');
    }
  }
  return s;
}

/**
 * Вложения книги: id → элемент `<binary>`.
 *
 * Именно элемент, а не его содержимое. base64-хвост иллюстрированной книги
 * весит столько же, сколько сама книга, и снять его текст «на всякий случай»
 * значит удвоить память ради вложений, на которые может не быть ни одной ссылки.
 */
function binaries(doc) {
  const out = new Map();
  for (const el of doc.getElementsByTagName('*')) {
    if (el.localName !== 'binary') continue;
    const id = (el.getAttribute('id') || '').trim();
    if (id && !out.has(id)) out.set(id, el);
  }
  return out;
}

/**
 * Ссылки на картинки → сами картинки. Ссылка без вложения, вложение неизвестного
 * формата, слишком мелкое или слишком крупное — просто пропускаются: книга без
 * одной иллюстрации читается, книга, которая не открылась, — нет.
 */
function images(doc, refs) {
  if (!refs.length) return [];
  const bins = binaries(doc);
  const fits = budget();
  const done = new Map();          // id → готовая картинка либо null, если не взяли
  const out = [];

  for (const r of refs) {
    let img = done.get(r.id);
    // Одно вложение читается один раз, даже если ссылок на него десяток: у книг
    // с виньеткой между сценами их столько и бывает. Иначе мегабайтная строка
    // переписывалась бы на каждую ссылку, а потолок веса выбирался бы одной и
    // той же картинкой по десять раз.
    if (img === undefined) {
      img = null;
      const el = bins.get(r.id);
      const type = el ? mimeOf(el.getAttribute('content-type'), r.id) : '';
      if (type) {
        // Внутри `<binary>` base64 разбит на строки — пробелы в data: URL не нужны.
        const data = String(el.textContent || '').replace(/\s+/g, '');
        if (data && fits(sizeOfB64(data))) img = {type, data};
      }
      done.set(r.id, img);
    }
    if (img) out.push({at: r.at, type: img.type, data: img.data});
  }
  return out;
}

/**
 * Разбирает FB2.
 *
 * @param {ArrayBuffer|Uint8Array} bytes содержимое файла
 * @returns {{title: string, text: string, chapters: Array<{title: string, at: number}>,
 *   images: Array<{at: number, type: string, data: string}>}}
 * @throws {Error} пустой файл, не-XML или FB2 без текста
 */
export function parseFb2(bytes) {
  const u8 = toBytes(bytes);
  if (!u8.length) throw new Error('Пустой файл');

  const doc = new DOMParser().parseFromString(decode(u8), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл не разобрался как XML');

  const root = doc.documentElement;
  if (!root) throw new Error('Файл не разобрался как XML');

  // Первый body, кроме сносок и комментариев: они не часть чтения.
  const body = [...root.children].find(
    el => el.localName === 'body' && !['notes', 'comments'].includes(el.getAttribute('name') || '')
  );
  if (!body) throw new Error('В файле нет body — читать нечего');

  let text = '';
  const chapters = [];
  const refs = [];

  // Смещение, с которого начнётся следующий абзац. Между абзацами «\n\n»,
  // поэтому у непустого текста это длина плюс два.
  const nextAt = () => (text ? text.length + 2 : 0);

  // Ссылка на картинку с местом, где она стояла. Один и тот же id на одном и
  // том же смещении берём один раз: обложка книги почти всегда объявлена дважды
  // — в описании и первой же картинкой в теле, — и без этого она показалась бы
  // на первой карточке дважды подряд.
  const seen = new Set();
  const refPic = (el, at) => {
    const id = refOf(el);
    const key = id + '@' + at;
    if (!id || seen.has(key)) return;
    seen.add(key);
    refs.push({id, at});
  };

  const push = raw => {
    const v = squash(raw);
    if (!v) return;
    text += text ? '\n\n' + v : v;
  };

  // Заголовок главы кладём ОДНИМ абзацем, даже если в разметке он из нескольких
  // `<p>`. Иначе chapters[i].title не совпадал бы с тем, что лежит по at, и
  // прыжок по оглавлению попадал бы на половину заголовка.
  const titleOf = sec => {
    const t = [...sec.children].find(el => el.localName === 'title');
    return t ? squash(flat(t)) : '';
  };

  const walk = node => {
    for (const el of node.children) {
      const tag = el.localName;
      if (SKIP.has(tag)) continue;

      if (tag === 'image') {
        // Смещение — начало СЛЕДУЮЩЕГО абзаца: ровно там картинка и стояла,
        // перед ним. Если после неё в книге ничего нет, смещение окажется за
        // концом текста — стор подожмёт его к последнему куску.
        refPic(el, nextAt());
        continue;
      }
      if (tag === 'section') {
        // Место в списке занимаем ДО обхода: вложенные секции добавляют свои
        // главы внутри walk(), и запись «постфактум» перевернула бы порядок —
        // подглава оказалась бы выше своей части.
        const at = nextAt();
        const slot = chapters.length;
        chapters.push({title: titleOf(el), at});
        walk(el);
        // Пустая секция главы не создаёт: at указывал бы за конец текста.
        if (text.length <= at) chapters.splice(slot, 1);
        continue;
      }
      if (tag === 'title') {                 // и заголовок книги в body, и заголовок секции
        push(flat(el));
        continue;
      }
      if (BLOCK.has(tag)) {
        push(flat(el));
        continue;
      }
      walk(el);                              // epigraph, cite, poem, stanza, table…
    }
  };

  // Обложка объявлена не в теле, а в описании, и её ссылку обход не увидит.
  // Ставим её нулевым смещением — то есть на самую первую карточку книги,
  // и ДО обхода: в списке она должна идти первой, как и в книге.
  const coverEl = doc.querySelector('description > title-info > coverpage > image');
  if (coverEl) refPic(coverEl, 0);

  walk(body);

  const t = doc.querySelector('description > title-info > book-title');
  return {title: t ? squash(t.textContent) : '', text, chapters, images: images(doc, refs)};
}
