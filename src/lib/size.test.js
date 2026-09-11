import {describe, it, expect} from 'vitest';
import {pixels} from './size.js';
import {headOf, toB64} from './img.js';

/* Настоящих картинок в репозитории нет намеренно: двоичный файл нельзя
   прочитать глазами и нельзя поправить в дифе. Заголовки собираем побайтно —
   тем более что проверяем мы именно их разбор, а не декодирование. */

// flat() не разворачивает Uint8Array — собираем через Array.from, иначе
// вложенный кусок заголовка превратится в один нулевой байт.
const bytes = (...parts) => new Uint8Array(parts.flatMap(p => Array.from(p)));
const be16 = n => [(n >> 8) & 0xff, n & 0xff];
const le16 = n => [n & 0xff, (n >> 8) & 0xff];
const le32 = n => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const ascii = s => [...s].map(c => c.charCodeAt(0));

const png = (w, h) => bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  [0, 0, 0, 13], ascii('IHDR'), [0, 0, ...be16(w)], [0, 0, ...be16(h)], [8, 2, 0, 0, 0]
);

/** JPEG с сегментом-помехой перед кадром: у настоящих там EXIF и профиль. */
const jpeg = (w, h, junk = 40) => bytes(
  [0xff, 0xd8],
  [0xff, 0xe0], be16(junk + 2), new Array(junk).fill(0x20),
  [0xff, 0xc0], be16(17), [8], be16(h), be16(w), new Array(8).fill(0)
);

const gif = (w, h) => bytes(ascii('GIF89a'), le16(w), le16(h), [0, 0, 0]);

const bmp = (w, h) => bytes(
  ascii('BM'), le32(0), le32(0), le32(54), le32(40), le32(w), le32(h), [1, 0, 24, 0]
);

const riff = (kind, tail) => bytes(ascii('RIFF'), le32(0), ascii('WEBP'), ascii(kind), le32(0), tail);
const webpLossy = (w, h) =>
  riff('VP8 ', bytes([0, 0, 0], [0x9d, 0x01, 0x2a], le16(w), le16(h), [0, 0, 0, 0]));
const webpLossless = (w, h) => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return riff('VP8L', bytes([0x2f], le32(bits >>> 0), new Array(6).fill(0)));
};
const webpExt = (w, h) => riff('VP8X', bytes(
  [0, 0, 0, 0], [(w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff],
  [(h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff], [0, 0, 0, 0]
));

describe('pixels() — размер по заголовку', () => {
  it('PNG', () => expect(pixels(png(800, 1200))).toEqual({w: 800, h: 1200}));
  it('GIF', () => expect(pixels(gif(320, 240))).toEqual({w: 320, h: 240}));
  it('BMP', () => expect(pixels(bmp(100, 50))).toEqual({w: 100, h: 50}));
  it('WebP с потерями', () => expect(pixels(webpLossy(640, 480))).toEqual({w: 640, h: 480}));
  it('WebP без потерь', () => expect(pixels(webpLossless(300, 900))).toEqual({w: 300, h: 900}));
  it('WebP расширенный', () => expect(pixels(webpExt(1024, 768))).toEqual({w: 1024, h: 768}));

  // У BMP высота со знаком: минус значит «строки сверху вниз», а не «минус 50».
  it('BMP с перевёрнутыми строками отдаёт положительную высоту', () => {
    const b = bmp(100, 50);
    b.set(le32(-50 >>> 0), 22);
    expect(pixels(b)).toEqual({w: 100, h: 50});
  });
});

describe('pixels() — JPEG', () => {
  it('находит кадр за служебными сегментами', () => {
    expect(pixels(jpeg(1600, 900))).toEqual({w: 1600, h: 900});
  });

  // Ровно то, ради чего сегменты перебираются по длинам, а не ищутся сдвигом:
  // до кадра в настоящем файле лежит EXIF с превью, и он бывает огромным.
  it('находит кадр и за длинным EXIF', () => {
    expect(pixels(jpeg(120, 340, 20000))).toEqual({w: 120, h: 340});
  });

  it('файл обрывается раньше кадра — null, а не выдуманный размер', () => {
    expect(pixels(jpeg(800, 600).subarray(0, 30))).toBe(null);
  });
});

describe('pixels() — что размером не считаем', () => {
  it('чужой формат, обрывок и мусор дают null', () => {
    expect(pixels(bytes(ascii('%PDF-1.4 и дальше'), [0, 0]))).toBe(null);
    expect(pixels(bytes([1, 2, 3]))).toBe(null);
    expect(pixels(new Uint8Array())).toBe(null);
    expect(pixels(null)).toBe(null);
  });

  it('нулевая сторона — не размер', () => {
    expect(pixels(png(0, 500))).toBe(null);
    expect(pixels(gif(320, 0))).toBe(null);
  });
});

// Размер читается из base64, в котором картинка и хранится, — разворачивать
// ради него всю иллюстрацию незачем.
describe('размер прямо из base64', () => {
  it('заголовка из первых байт хватает', () => {
    const b64 = toB64(png(640, 960));
    expect(pixels(headOf(b64, 64))).toEqual({w: 640, h: 960});
  });

  it('не base64 — пустые байты, а не исключение', () => {
    expect(headOf('это не base64 %%%', 64)).toEqual(new Uint8Array());
    expect(headOf(null, 64)).toEqual(new Uint8Array());
  });

  it('запрошено больше, чем в строке, — отдаём сколько есть', () => {
    expect(headOf(toB64(new Uint8Array([1, 2, 3])), 4096).length).toBe(3);
  });
});
