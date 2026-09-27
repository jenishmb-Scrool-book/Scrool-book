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

const failed = (msg, code) => Object.assign(new Error(msg), {code});

/** PDF узнаётся по первым байтам: «%PDF». Отказ у него свой — его пробуют чаще всего. */
const isPdf = u8 => u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;

/**
 * Похоже ли начало файла на двоичный, а не на текст.
 *
 * Без этой проверки картинка, документ Word или PDF без расширения — а имя
 * из `content://` бывает любым — ложились книгой из управляющих символов.
 * Признак простой и надёжный: в тексте нет нулевых байтов и почти нет
 * управляющих; в двоичном файле их в первых же килобайтах десятки.
 * UTF-16 с меткой порядка байтов сюда не доходит — он разбирается раньше.
 */
function binary(u8) {
  const head = u8.subarray(0, 4096);
  let odd = 0;
  for (let i = 0; i < head.length; i++) {
    const b = head[i];
    if (b === 0) return true;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) odd++;
  }
  return odd > head.length / 50;
}

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
  // UTF-16 с меткой порядка байтов — так сохраняет «Блокнот» Windows, если
  // выбрать «Юникод». Строгий utf-8 на нём падает, а 1251 дала бы кашу из
  // нулей и латиницы.
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
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
  // Документ Word — тот же ZIP. Частая ошибка, и у неё есть простой выход.
  if (z.names.includes('word/document.xml')) throw failed('Документ Word', 'docx');

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
 *   у неудавшейся распаковки — `code === 'zip'`, у PDF — `code === 'pdf'`,
 *   у пустого файла — `code === 'empty'`
 */
export async function parseBook(file) {
  const ext = extOf(file && file.name);
  const u8 = toBytes(await file.arrayBuffer());
  if (!u8.length) throw failed('Пустой файл', 'empty');

  if (isPdf(u8) || ext === 'pdf') throw failed('PDF не поддерживается', 'pdf');
  if (isZip(u8) || ext === 'epub' || ext === 'zip') return fromZip(u8, ext);
  if (looksFb2(u8) || ext === 'fb2') return parseFb2(u8);
  // Файл без расширения считаем текстом: хуже, чем отказ, только отказ по ошибке.
  // Но только если он и правда похож на текст: двоичный файл с именем
  // «книга.txt» — всё равно двоичный.
  if (PLAIN.has(ext)) {
    const utf16 = u8.length >= 2 && ((u8[0] === 0xff && u8[1] === 0xfe) || (u8[0] === 0xfe && u8[1] === 0xff));
    // Своё сообщение: «нужен .txt» человеку, выбравшему файл «книга.txt»,
    // ничего не объясняет.
    if (!utf16 && binary(u8)) throw failed('Не похоже на текст', 'binary');
    return {title: '', text: plainText(u8)};
  }
  throw unsupported(ext);
}
