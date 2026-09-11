// Сборка ZIP прямо в тесте — общая для epub.test.js, zip.test.js и book.test.js.
//
// Готовый .epub или .fb2.zip в репозиторий не кладём: бинарник нельзя прочитать
// глазами и нельзя поправить в дифе. По умолчанию пишем методом 0 (stored) —
// тогда сами тесты не зависят от наличия DecompressionStream в окружении,
// а deflate проверяется отдельно и только там, где есть CompressionStream.
//
// Файл называется `.fixture.js`, а не `.test.js`, намеренно: vitest забирает
// вторые и запускал бы этот как набор без единой проверки.

export const u8 = str => new TextEncoder().encode(str);

const u16 = n => [n & 0xff, (n >> 8) & 0xff];
const u32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/**
 * Собирает архив.
 * @param {Array<{name: string, data: Uint8Array, method?: 0|8, usize?: number}>} files
 * @returns {Uint8Array}
 */
export function zip(files) {
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

/** Архив из карты «путь → строка или байты». */
export const zipOf = map => zip(Object.entries(map).map(([name, data]) =>
  ({name, data: data instanceof Uint8Array ? data : u8(data)})));
