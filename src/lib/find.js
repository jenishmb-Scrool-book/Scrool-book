// Поиск по тексту книги.
//
// Координата та же, что у курсора, глав и картинок: смещение в символах в
// ИСХОДНОЙ строке. Поэтому текст не нормализуется — ни регистр, ни ё, ни
// пробелы. Вся терпимость к написанию живёт в шаблоне, а ищет сам движок
// регулярных выражений: он проходит мегабайт текста быстрее, чем любой
// самодельный обход, и не требует держать в памяти вторую копию книги.

/** Короче — не поиск: одна буква есть в каждом слове. */
export const MIN = 2;

/** Сколько находок показываем. Больше на экране телефона никто не пролистает. */
export const LIMIT = 200;

/**
 * Дальше не считаем. Число нужно, чтобы сказать «уточни запрос», а не ради
 * точности: «больше тысячи» и «двенадцать тысяч» говорят человеку одно и то же,
 * а досчитать до второго на слове «он» — это пройти всю книгу.
 */
export const CAP = 999;

// Ровно синтаксические знаки и ничего сверх. С флагом `u` лишнее
// экранирование — ошибка, а не пустяк: `\-` роняет конструктор, и поиск
// «из-за» падал бы вместо того, чтобы искать.
const SPECIAL = /[.*+?^${}()|[\]\\/]/g;

// Что считаем одной буквой. Ё в книгах ставят через раз, апостроф — то прямой,
// то типографский; человек же набирает так, как ему удобно на клавиатуре.
const SAME = {
  'е': '[её]', 'ё': '[её]', 'Е': '[её]', 'Ё': '[её]',
  "'": "['’ʼ]", '’': "['’ʼ]", 'ʼ': "['’ʼ]"
};

/**
 * Регулярное выражение из того, что человек набрал. null — искать нечего.
 *
 * Флаг `i` вместе с `u` — ради кириллицы: без `u` регистр сворачивается не
 * у всех букв. Пробел в запросе совпадает с любым пробельным промежутком: в
 * книге между словами бывает перевод строки, а набрать его в строке поиска
 * нельзя.
 */
export function pattern(query) {
  if (typeof query !== 'string') return null;
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < MIN) return null;
  const src = q
    .replace(SPECIAL, '\\$&')
    .replace(/[еёЕЁ'’ʼ]/g, c => SAME[c])
    .replace(/ /g, '\\s+');
  return new RegExp(src, 'giu');
}

/**
 * Все места, где встречается запрос.
 *
 * @returns {{hits: {at: number, len: number}[], total: number, more: boolean}}
 *   `hits` — первые `limit` находок по порядку книги; `total` — сколько всего,
 *   но не больше CAP; `more` — упёрлись в CAP, на деле их больше.
 */
export function find(text, query, limit = LIMIT) {
  const empty = {hits: [], total: 0, more: false};
  const src = typeof text === 'string' ? text : '';
  const re = pattern(query);
  if (!src || !re) return empty;
  const hits = [];
  let total = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Досчитываем до CAP + 1: ровно CAP совпадений — это «нашлось 999», а не
    // «больше 999».
    if (total === CAP) return {hits, total, more: true};
    if (hits.length < limit) hits.push({at: m.index, len: m[0].length});
    total += 1;
  }
  return {hits, total, more: false};
}

const flat = s => s.replace(/\s+/g, ' ');

/**
 * Строка вокруг находки: что до неё, она сама и что после.
 *
 * Края отступают до ближайшего пробела: обрубок слова в начале превью читается
 * как поломка, а не как отрывок. Многоточие ставится только там, где текст на
 * самом деле обрезан, — у начала и конца книги его нет.
 */
export function around(text, at, len, before = 40, after = 70) {
  const src = typeof text === 'string' ? text : '';
  const end = at + len;

  let a = Math.max(0, at - before);
  if (a > 0 && !/\s/.test(src[a - 1])) {
    const k = src.slice(a, at).search(/\s/);
    a = k < 0 ? at : a + k;
  }
  let b = Math.min(src.length, end + after);
  if (b < src.length && !/\s/.test(src[b])) {
    const k = src.slice(end, b).search(/\s\S*$/);
    b = k < 0 ? end : end + k;
  }

  const head = flat(src.slice(a, at)).trimStart();
  const tail = flat(src.slice(end, b)).trimEnd();
  return {
    head: (a > 0 ? '…' : '') + head,
    hit: flat(src.slice(at, end)),
    tail: tail + (b < src.length ? '…' : '')
  };
}
