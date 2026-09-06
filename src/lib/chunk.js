// Чанкер: режет книгу на карточки. Чистая функция без побочных эффектов —
// один и тот же текст обязан всегда давать один и тот же результат.
//
// Каждый кусок несёт СМЕЩЕНИЕ в исходном тексте, а не только сам текст.
// Это принципиально: у разных экранов разный размер фрагмента, и номер куска
// у них означал бы разные места книги. Смещение — единственная величина,
// которая переживает и перенарезку, и смену размера шрифта.
//
// Отсюда же вся возня с индексами ниже. Наивный `split()` смещения теряет,
// а нормализация пробелов (в .txt перенос стоит по ширине колонки, а не по
// смыслу) рвёт связь между выданным текстом и позицией в оригинале. Поэтому
// текст нормализуется для показа, а границы считаются по исходной строке.

const PARA = /\n\s*\n+/g;              // пустая строка = граница абзаца
const SENT = /(?<=[.!?…»"])\s+/g;      // пробел после знака конца предложения

const norm = s => s.trim().replace(/\s+/g, ' ');

/** Границы абзацев в исходной строке, как пары [начало, конец). */
function paragraphs(src) {
  const out = [];
  let i = 0, m;
  PARA.lastIndex = 0;
  while ((m = PARA.exec(src))) {
    out.push([i, m.index]);
    i = PARA.lastIndex;
  }
  out.push([i, src.length]);
  return out;
}

/**
 * Предложения внутри абзаца — уже со смещениями в исходной строке.
 * Резать можно прямо по оригиналу: разделитель это пробелы после знака
 * препинания, а схлопывание пробелов последовательность непробельных
 * символов не меняет.
 */
function sentences(src, ps, pe) {
  const seg = src.slice(ps, pe);
  const spans = [];
  let i = 0, m;
  SENT.lastIndex = 0;
  while ((m = SENT.exec(seg))) {
    spans.push([i, m.index]);
    i = SENT.lastIndex;
  }
  spans.push([i, seg.length]);

  const out = [];
  for (const [a, b] of spans) {
    const raw = seg.slice(a, b);
    const text = norm(raw);
    if (!text) continue;
    const lead = raw.length - raw.replace(/^\s+/, '').length;
    const trail = raw.length - raw.replace(/\s+$/, '').length;
    out.push({at: ps + a + lead, end: ps + b - trail, text});
  }
  return out;
}

/**
 * @param {string} text исходный текст книги
 * @param {number} [max=280] желаемый потолок длины куска в символах
 * @returns {Array<{text: string, at: number, end: number}>} куски без пустых
 */
export function chunk(text, max = 280) {
  const src = String(text ?? '');
  const out = [];

  for (const [ps, pe] of paragraphs(src)) {
    let buf = null;
    for (const s of sentences(src, ps, pe)) {
      if (!buf) {
        buf = s;
      } else if ((buf.text + ' ' + s.text).length > max) {
        out.push(buf);
        buf = s;
      } else {
        buf = {at: buf.at, end: s.end, text: buf.text + ' ' + s.text};
      }
    }
    // Одно предложение длиннее max резать не по чему: оно выйдет отдельным
    // куском длиннее max. Это лучше, чем рубить слово посередине или крутиться.
    if (buf) out.push(buf);
  }
  return out;
}

/**
 * Номер куска, которому принадлежит смещение: последний кусок с `at <= offset`.
 * Двоичный поиск — вызывается на каждый кадр скролла, линейный перебор по книге
 * на несколько тысяч кусков там неуместен.
 *
 * @param {Array<{at: number}>} chunks
 * @param {number} offset
 * @returns {number} индекс в пределах массива; 0 для пустого
 */
export function indexAt(chunks, offset) {
  if (!chunks.length) return 0;
  if (!(offset > chunks[0].at)) return 0;             // включая NaN и отрицательные
  let lo = 0, hi = chunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid].at <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
