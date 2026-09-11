// Файл, который принёс человек, → книга.
//
// Формат определяем ПО СОДЕРЖИМОМУ, а не по имени. Расширение осталось только
// запасным ходом. Причина в Android: файл приезжает из системного выбора по
// ссылке `content://`, и имя у него бывает какое угодно — с расширением в
// другом регистре, с двойным (`книга.fb2.zip`), а то и вовсе без него. Пока
// разбор выбирался по расширению, самая обычная книга из библиотеки —
// `.fb2.zip`, а раздают их так чаще, чем голым файлом, — получала ответ
// «формат не поддерживается».
//
// Наружу отдаём то же, что отдают сами парсеры: {title, text, chapters, images}.
import {parseFb2} from './fb2.js';
import {parseEpub} from './epub.js';
import {isZip, openZip, toBytes} from './zip.js';

/** Расширение имени файла в нижнем регистре; для «книга.fb2.zip» — «zip». */
const extOf = name => ((/\.(\w+)$/.exec(String(name || '')) || ['', ''])[1]).toLowerCase();

/** Эти расширения читаем как простой текст. Пустое — тоже: см. `parseBook`. */
const PLAIN = new Set(['', 'txt', 'md']);

const unsupported = ext =>
  Object.assign(new Error('неизвестный формат: ' + (ext || 'без расширения')), {code: 'unsupported'});

/**
 * Похоже ли начало файла на FB2.
 *
 * Смотрим на байты, а не на разобранный XML: кодировка у FB2 бывает и utf-8, и
 * windows-1251, и utf-16, а корневой тег во всех трёх пишется одними и теми же
 * латинскими буквами. Нули выбрасываем — именно ими utf-16 разбавляет латиницу.
 */
function looksFb2(u8) {
  const head = u8.subarray(0, 2048);
  let s = '';
  for (let i = 0; i < head.length; i++) if (head[i]) s += String.fromCharCode(head[i]);
  return /<\s*(\w+:)?FictionBook/i.test(s);
}

/**
 * Текст файла. Сначала строгий utf-8, и только если он не разобрался —
 * windows-1251.
 *
 * Порядок именно такой и подмены не боится: строгий разбор спотыкается ровно
 * на том, что корректным utf-8 не является. Зато .txt из русской библиотеки —
 * а он почти всегда в 1251 — открывается текстом, а не строкой «Ð“Ð»Ð°Ð²Ð°».
 */
function plainText(u8) {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(u8);
  } catch {
    return new TextDecoder('windows-1251').decode(u8);
  }
}

/** Архив: EPUB целиком либо FB2, завёрнутый в zip. */
async function fromZip(u8, ext) {
  const z = openZip(u8);
  if (z.names.includes('META-INF/container.xml')) return parseEpub(u8);

  // `.fb2.zip` — это один файл в архиве. Имя внутри бывает и без расширения,
  // поэтому единственную запись берём как есть и проверяем уже её содержимое.
  const inner = z.names.find(n => /\.fb2$/i.test(n))
    || (z.names.length === 1 ? z.names[0] : '');
  if (inner) {
    const bytes = await z.read(inner);
    if (bytes && looksFb2(bytes)) return parseFb2(bytes);
  }
  throw unsupported(ext);
}

/**
 * Разбирает файл книги.
 *
 * @param {{name?: string, arrayBuffer: () => Promise<ArrayBuffer>}} file
 * @returns {Promise<{title: string, text: string,
 *   chapters?: Array<{title: string, at: number}>,
 *   images?: Array<{at: number, type: string, data: string}>}>}
 * @throws {Error} у нечитаемого формата будет `code === 'unsupported'`,
 *   у неудавшейся распаковки — `code === 'zip'`
 */
export async function parseBook(file) {
  const ext = extOf(file && file.name);
  const u8 = toBytes(await file.arrayBuffer());
  if (!u8.length) throw new Error('Пустой файл');

  if (isZip(u8) || ext === 'epub' || ext === 'zip') return fromZip(u8, ext);
  if (looksFb2(u8) || ext === 'fb2') return parseFb2(u8);
  // Файл без расширения считаем текстом: хуже, чем отказ, только отказ по ошибке.
  if (PLAIN.has(ext)) return {title: '', text: plainText(u8)};
  throw unsupported(ext);
}
