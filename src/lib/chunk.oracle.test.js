import {describe, it, expect} from 'vitest';
import {chunk} from './chunk.js';

// Эталон: нарезчик в том виде, в каком он жил до ускорения (сессия 31).
//
// Новый обязан выдавать ровно то же самое — те же куски, те же смещения, тот
// же текст до символа. От нарезки зависит всё: курсор, место прокрутки,
// картинки, «страница / осталось». Разойдись новая с прежней хоть на пробел —
// у каждого, кто уже читает, место в книге съехало бы на следующем запуске.
// Поэтому проверка не выборочная, а сплошная: тысячи случайных текстов со всем,
// что в книгах встречается, — от неразрывных пробелов до «…» и кавычек.

const PARA = /\n\s*\n+/g;
const SENT = /(?<=[.!?…»"])\s+/g;
const norm = s => s.trim().replace(/\s+/g, ' ');

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

function reference(text, max = 280) {
  const src = String(text ?? '');
  const out = [];
  for (const [ps, pe] of paragraphs(src)) {
    let buf = null;
    for (const s of sentences(src, ps, pe)) {
      if (!buf) buf = s;
      else if ((buf.text + ' ' + s.text).length > max) {
        out.push(buf);
        buf = s;
      } else {
        buf = {at: buf.at, end: s.end, text: buf.text + ' ' + s.text};
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

// Всё, из чего бывает сделана книга: буквы, знаки конца предложения, кавычки,
// переносы и пробелы всех сортов, которые JS считает пробелами (\s), — и один,
// который не считает (U+0085), чтобы проверить и границу этого множества.
const PIECES = [
  'а', 'б', 'Слово', 'word', 'ёж', '1984', ',', ';', ':', '—', '-',
  '.', '!', '?', '…', '»', '"', '«', '..', '?!',
  ' ', ' ', '  ', '\n', '\n\n', '\n \n', '\n\n\n', '\t', '\r\n', '\r\n\r\n',
  ' ', ' ', ' ', '　', '﻿', ' ', ' ', '\u0085'
];

function randomText(rnd, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += PIECES[Math.floor(rnd() * PIECES.length)];
  return s;
}

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

// Текст куска у нового нарезчика ленивый — свойство прототипа, а не поле.
// Сравниваем то, что видит экран: смещения и текст.
const seen = list => list.map(c => ({at: c.at, end: c.end, text: c.text}));

describe('ускоренный нарезчик совпадает с прежним', () => {
  it('на тысячах случайных текстов — куски, смещения и текст до символа', () => {
    const rnd = prng(20260926);
    for (let k = 0; k < 3000; k++) {
      const src = randomText(rnd, 1 + Math.floor(rnd() * 120));
      const max = [1, 5, 20, 60, 90, 140, 280, 600][k % 8];
      expect(seen(chunk(src, max)), JSON.stringify([src, max])).toEqual(reference(src, max));
    }
  });

  it('на тексте, похожем на книгу', () => {
    const rnd = prng(7);
    const words = 'он она сказал князь Андрей «Наташа» ёлка ещё её поле война мир и в на с что как'.split(' ');
    let s = '';
    while (s.length < 60000) {
      s += words[Math.floor(rnd() * words.length)];
      const r = rnd();
      s += r < 0.05 ? '.\n\n' : r < 0.1 ? '. ' : r < 0.12 ? '!\n' : r < 0.13 ? '…» ' : ' ';
    }
    for (const max of [90, 140, 180, 200, 220, 250, 280, 600]) {
      expect(seen(chunk(s, max))).toEqual(reference(s, max));
    }
  });

  it('пустое и не строка', () => {
    for (const v of ['', null, undefined, '   ', '\n\n']) expect(chunk(v)).toEqual(reference(v));
  });
});
