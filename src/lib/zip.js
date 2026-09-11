// ZIP — ровно столько, сколько нужно, чтобы достать из архива именованный файл.
//
// Библиотеку-распаковщик не тянем: и таблицу файлов, и inflate платформа умеет
// сама (DecompressionStream есть в Chrome 103+ и в Android WebView 103+), а
// лишняя зависимость — это лишние сотни килобайт apk ради формата, который
// читается сотней строк.
//
// Жил этот код внутри epub.js, пока архив был только там. Теперь в архиве
// приезжает и FB2: в библиотеках его раздают как `.fb2.zip` чаще, чем голым
// файлом, — и человек, скачавший книгу оттуда, получал «формат не
// поддерживается» на самом обычном для этого формата файле.

const UTF8 = new TextDecoder('utf-8');

/**
 * Ошибка распаковки. Library по коду 'zip' показывает `lib.parse_failed_zip`
 * («обнови Android System WebView»): это единственный случай, когда виноват не
 * файл, а окружение, и пользователю есть что сделать.
 */
export const zipError = msg => Object.assign(new Error(msg), {code: 'zip'});

/** Байты в Uint8Array; всё, что не похоже на байты, — ошибка, а не undefined. */
export function toBytes(bytes) {
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // instanceof тут ненадёжен: у jsdom и Node разные реалмы, и ArrayBuffer из
  // одного не instanceof ArrayBuffer из другого. Проверяем внутренний класс.
  if (Object.prototype.toString.call(bytes) === '[object ArrayBuffer]') return new Uint8Array(bytes);
  throw new Error('Не похоже на файл: ожидались байты книги');
}

/** Первые байты архива. По ним файл узнаётся до всякого разбора. */
export const isZip = u8 =>
  u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;

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

/**
 * Где начинаются данные записи. Длины имени и extra берём ИЗ ЛОКАЛЬНОГО
 * заголовка: в central directory extra-поле почти всегда другой длины (там
 * лежат свои атрибуты), и, посчитав по нему, попадёшь мимо данных.
 */
function dataAt(u8, dv, f) {
  if (f.lho + 30 > u8.length || dv.getUint32(f.lho, true) !== 0x04034b50)
    throw new Error('Битый локальный заголовок в ZIP-архиве');
  return f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
}

async function inflate(raw) {
  if (!raw.length) return raw;
  if (typeof DecompressionStream !== 'function')
    throw zipError('В этом WebView нет DecompressionStream — архив не распаковать');
  try {
    const src = new Response(raw).body.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(src).arrayBuffer());
  } catch (e) {
    throw zipError('Не удалось распаковать архив: ' + (e && e.message));
  }
}

/**
 * Открывает архив: читает таблицу файлов и отдаёт доступ к ним по имени.
 *
 * @param {ArrayBuffer|Uint8Array} bytes содержимое архива
 * @returns {{names: string[], read: (name: string) => Promise<Uint8Array|null>}}
 *   `read` отдаёт null, если такого файла в архиве нет.
 * @throws {Error} не ZIP или битая таблица файлов
 */
export function openZip(bytes) {
  const u8 = toBytes(bytes);
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

  const read = async name => {
    const f = files.get(name);
    if (!f) return null;
    const at = dataAt(u8, dv, f);
    const raw = u8.subarray(at, at + f.csize);
    if (f.method === 0) return raw;
    if (f.method !== 8) throw new Error('Неподдерживаемый метод сжатия в ZIP: ' + f.method);
    return inflate(raw);
  };

  return {names: [...files.keys()], read};
}
