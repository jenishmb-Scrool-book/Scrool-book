// Оглавление для обычного текста.
//
// В .fb2 и .epub главы размечены, и парсеры отдают их сами. Но большинство
// книг сюда попадёт вставкой текста в библиотеку, а там разметки нет вообще —
// и без этого файла экран оглавления был бы пустым у всех, кроме тех, кто
// импортировал файл.
//
// Координата та же, что у курсора чтения: `at` — смещение в символах в
// ИСХОДНОЙ строке. Поэтому строку нельзя нормализовать, а границы приходится
// считать обходом строк с накоплением длины.

// Через `(?!\p{L})`, а не через `\b`: границу слова JS считает по ASCII, и
// после кириллического «глава» её просто нет — регулярка молча не срабатывала.
const KEY = /^(глава|часть|пролог|эпилог|chapter|part|book|prologue|epilogue)(?!\p{L})/iu;
const ROMAN = /^[IVXLCDM]{1,7}\.?$/;
const NUM = /^\d{1,3}\.?$/;

const MAX_TITLE = 70;   // длиннее — это уже абзац, а не заголовок
const MAX_SHORT = 24;   // «Глава 1» короче: к такому имеет смысл приклеить название
const JOIN = ' · ';

const letters = s => (s.match(/\p{L}/gu) || []).length;

// Капсом набирают заголовки, но капсом же набирают «АААА!». Двух букв достаточно,
// чтобы отсечь «***» и «---», а длина уже ограничена сверху.
const upper = s => letters(s) >= 2 && s === s.toUpperCase() && s !== s.toLowerCase();

const looksLikeHeading = s => KEY.test(s) || ROMAN.test(s) || NUM.test(s) || upper(s);

/**
 * Ищет заголовки глав в плоском тексте.
 *
 * Заголовком считается короткая строка, стоящая отдельно (перед ней пустая
 * строка или начало текста) и похожая на заголовок: «Глава N», «Часть N»,
 * римская цифра, голое число или строка капсом.
 *
 * Требование «стоит отдельно» делает почти всю работу по отсечению ложных
 * срабатываний: строка «Глава 1» внутри абзаца заголовком не станет.
 *
 * @returns {{title: string, at: number}[]} пусто, если нашлось меньше двух —
 *   одна глава это не оглавление, а строка, по которой некуда переходить.
 */
export function detect(text) {
  const src = typeof text === 'string' ? text : '';
  if (!src) return [];

  const lines = src.split('\n');
  const trimmed = lines.map(l => l.trim());
  const out = [];
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = trimmed[i];
    const standalone = i === 0 || trimmed[i - 1] === '';

    if (standalone && line && line.length <= MAX_TITLE && looksLikeHeading(line)) {
      let title = line;
      // «Глава 1» отдельной строкой, а название — следующей: без склейки
      // оглавление превратилось бы в список из одних номеров.
      if (line.length <= MAX_SHORT && !upper(line)) {
        const next = trimmed[i + 1];
        const after = i + 2 >= trimmed.length ? '' : trimmed[i + 2];
        if (next && next.length <= MAX_TITLE && after === '') title += JOIN + next;
      }
      out.push({title, at: pos + (raw.length - raw.replace(/^\s+/, '').length)});
    }
    pos += raw.length + 1;   // +1 — сам перевод строки; \r остался внутри raw
  }

  return out.length >= 2 ? out : [];
}
