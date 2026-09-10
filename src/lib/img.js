// Картинки из книги: общие правила для обоих форматов.
//
// Наружу картинка всегда уезжает одинаково — `{at, type, data}`, где `data` это
// base64 без префикса, а `at` — СМЕЩЕНИЕ В СИМВОЛАХ того самого плоского текста,
// который отдаёт парсер. Та же координата, что у курсора и у глав: карточка
// сама найдёт свои картинки, как находит свою главу, и переезд между экранами
// с разной нарезкой ничего не сдвинет.
//
// Смещение указывает на НАЧАЛО следующего абзаца — то есть картинка стоит перед
// текстом того куска, которому досталась. Так она и стояла в книге.

/** Мельче этого не картинка, а распорка или маркер списка: в epub их сотни. */
export const MIN = 512;
/** Одна картинка крупнее — почти всегда скан страницы; на телефоне он не нужен. */
export const MAX = 4 * 1024 * 1024;
/** Потолок на книгу целиком: дальше начинается уже не чтение, а фотоальбом. */
export const TOTAL = 32 * 1024 * 1024;
/** И по числу — заслон от книг, где картинка стоит между каждой парой абзацев. */
export const COUNT = 300;

// Растровые форматы, и только они. SVG сюда не берём намеренно: внутри него
// живут ссылки и скрипты, а текст книги у нас пользовательский. В `<img>`
// браузер скрипты не выполняет, но правило «в разметку не попадает ничего из
// файла» стоит дешевле, чем разбирательство, где именно кончается песочница.
const TYPES = {
  'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg',
  'image/png': 'image/png', 'image/gif': 'image/gif',
  'image/webp': 'image/webp', 'image/bmp': 'image/bmp', 'image/x-ms-bmp': 'image/bmp'
};

const EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
};

/**
 * Тип картинки: сначала объявленный, потом по расширению имени.
 *
 * Одного объявленного мало. В fb2 сплошь и рядом `content-type="image/jpg"`
 * (такого типа не существует), а в epub попадается пустой media-type — но имя
 * файла при этом честное. Пустая строка значит «формат не наш, брать не будем».
 *
 * @param {string} declared из атрибута content-type / media-type
 * @param {string} name имя файла или id вложения
 * @returns {string} канонический MIME или ''
 */
export function mimeOf(declared, name) {
  const d = String(declared || '').toLowerCase().split(';')[0].trim();
  if (TYPES[d]) return TYPES[d];
  const m = /\.(\w+)$/.exec(String(name || '').toLowerCase());
  return (m && EXT[m[1]]) || '';
}

/**
 * Байты в base64. Через `apply` кусками, а не целиком: у
 * `String.fromCharCode(...массив)` аргументы кладутся в стек, и на мегабайте
 * это RangeError, то есть книга без картинок ровно там, где их больше всего.
 *
 * @param {Uint8Array} bytes
 * @returns {string} base64 без префикса `data:`
 */
export function toB64(bytes) {
  const STEP = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += STEP)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  return btoa(s);
}

/** Сколько байт стоит за base64-строкой. Хвостовые «=» — добивка, не данные. */
export function sizeOfB64(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
}

/**
 * Счётчик, который решает, влезает ли ещё одна картинка.
 *
 * Отдельной функцией, потому что решение одно на оба парсера, а забыть его в
 * одном из них — значит получить книгу, которая кладёт телефон только в epub.
 *
 * @returns {(size: number) => boolean} true — берём, false — пропускаем
 */
export function budget() {
  let count = 0;
  let bytes = 0;
  return size => {
    const n = Number(size) || 0;
    if (n < MIN || n > MAX) return false;
    if (count >= COUNT || bytes + n > TOTAL) return false;
    count += 1;
    bytes += n;
    return true;
  };
}

/** Готовый src для `<img>`. Тип сюда попадает только из `mimeOf`, из белого списка. */
export const dataUrl = (type, data) => 'data:' + type + ';base64,' + data;
