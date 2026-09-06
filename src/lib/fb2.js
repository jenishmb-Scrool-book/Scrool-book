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

// Абзацеобразующие элементы FB2: каждый даёт отдельный кусок текста.
// `v` — строка стиха, `th`/`td` — ячейки таблицы (лучше строкой, чем слитно).
const BLOCK = new Set(['p', 'v', 'subtitle', 'text-author', 'th', 'td']);

// Картинки и base64-вложения в текст не идут вообще.
const SKIP = new Set(['image', 'binary', 'annotation', 'empty-line']);

const squash = s => String(s).replace(/\s+/g, ' ').trim();

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
 * Разбирает FB2.
 *
 * @param {ArrayBuffer|Uint8Array} bytes содержимое файла
 * @returns {{title: string, text: string, chapters: Array<{title: string, at: number}>}}
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

  // Смещение, с которого начнётся следующий абзац. Между абзацами «\n\n»,
  // поэтому у непустого текста это длина плюс два.
  const nextAt = () => (text ? text.length + 2 : 0);

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

  walk(body);

  const t = doc.querySelector('description > title-info > book-title');
  return {title: t ? squash(t.textContent) : '', text, chapters};
}
