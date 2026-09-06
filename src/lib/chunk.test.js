import {describe, it, expect} from 'vitest';
import {chunk, indexAt} from './chunk.js';

// Чанкер отдаёт объекты {text, at, end}. Старые проверки формы текста никуда не
// делись — просто смотрят на .text; ниже к ним добавлены проверки смещений.
const texts = out => out.map(c => c.text);

describe('chunk() — нарезка', () => {
  it('режет текст на абзацы по пустым строкам', () => {
    expect(texts(chunk('раз\n\nдва'))).toEqual(['раз', 'два']);
  });

  it('отбрасывает пустые куски', () => {
    expect(chunk('  \n\n  ')).toEqual([]);
    expect(chunk('')).toEqual([]);
    expect(texts(chunk('раз\n\n   \n\nдва'))).toEqual(['раз', 'два']);
  });

  it('короткий абзац не режет', () => {
    expect(chunk('а'.repeat(50), 280)).toHaveLength(1);
    expect(texts(chunk('Одно. Два.', 280))).toEqual(['Одно. Два.']);
  });

  it('схлопывает переносы и пробелы внутри абзаца', () => {
    expect(texts(chunk('раз\nдва   три\tчетыре'))).toEqual(['раз два три четыре']);
  });

  it('длинный абзац режет по границам предложений', () => {
    const out = chunk('Первое предложение. '.repeat(40), 280);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.text).toMatch(/[.!?…»"]$/);
  });

  it('ни один кусок не длиннее max * 1.15', () => {
    for (const c of chunk('Первое предложение. '.repeat(40), 280))
      expect(c.text.length).toBeLessThanOrEqual(280 * 1.15);
  });

  it('уважает переданный max', () => {
    for (const c of chunk('Раз два три. '.repeat(30), 60))
      expect(c.text.length).toBeLessThanOrEqual(60 * 1.15);
  });

  it('по умолчанию max = 280', () => {
    const src = 'Фраза. '.repeat(200);
    expect(chunk(src)).toEqual(chunk(src, 280));
  });

  it('одно предложение длиннее max отдаёт целиком и не зацикливается', () => {
    const one = 'я'.repeat(600);
    expect(texts(chunk(one, 280))).toEqual([one]);
  });

  it('не теряет ни одного символа текста', () => {
    const src = 'Начало. ' + 'ю'.repeat(700) + ' Хвост первый. Хвост второй.\n\nВторой абзац.';
    const bare = s => s.replace(/\s+/g, '');
    expect(bare(texts(chunk(src, 280)).join(''))).toBe(bare(src));
  });

  it('чистая функция: одинаковый вход — одинаковый выход, новый массив', () => {
    const src = 'Раз. Два.\n\nТри.';
    const a = chunk(src), b = chunk(src);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('chunk() — смещения', () => {
  // Главное свойство: смещение указывает в ИСХОДНЫЙ текст, а не в нормализованный.
  // Без него курсор нельзя перенести между экранами с разной нарезкой.
  it('at указывает на первый символ куска в исходном тексте', () => {
    const src = 'Первый абзац.\n\nВторой абзац.';
    const [a, b] = chunk(src);
    expect(a.at).toBe(0);
    expect(src.slice(b.at)).toBe('Второй абзац.');
  });

  it('at пропускает ведущие пробелы и переносы', () => {
    const src = '\n\n   Абзац с отступом.';
    const [c] = chunk(src);
    expect(src[c.at]).toBe('А');
  });

  it('end указывает за последний символ куска, без хвостовых пробелов', () => {
    const src = 'Кусок.   \n\nДругой.';
    const [c] = chunk(src);
    expect(src.slice(c.at, c.end)).toBe('Кусок.');
  });

  it('срез исходника по [at, end) даёт тот же текст после нормализации', () => {
    const src = 'Раз два.  Три\nчетыре. '.repeat(20);
    for (const c of chunk(src, 100))
      expect(src.slice(c.at, c.end).replace(/\s+/g, ' ').trim()).toBe(c.text);
  });

  it('смещения строго возрастают', () => {
    const out = chunk('Предложение номер один. '.repeat(50), 90);
    for (let i = 1; i < out.length; i++) expect(out[i].at).toBeGreaterThan(out[i - 1].at);
  });

  it('at и end не выходят за границы исходника', () => {
    const src = 'Раз. Два. Три.\n\nЧетыре.';
    for (const c of chunk(src, 10)) {
      expect(c.at).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeLessThanOrEqual(src.length);
      expect(c.end).toBeGreaterThan(c.at);
    }
  });
});

describe('indexAt()', () => {
  const src = 'Раз два три. '.repeat(60);

  it('пустой список — нулевой индекс', () => {
    expect(indexAt([], 100)).toBe(0);
  });

  it('смещение до начала — первый кусок', () => {
    expect(indexAt(chunk(src, 80), -5)).toBe(0);
  });

  it('смещение за концом — последний кусок', () => {
    const out = chunk(src, 80);
    expect(indexAt(out, src.length + 999)).toBe(out.length - 1);
  });

  it('находит кусок, которому смещение принадлежит', () => {
    const out = chunk(src, 80);
    for (let i = 0; i < out.length; i++) {
      expect(indexAt(out, out[i].at)).toBe(i);        // ровно начало
      expect(indexAt(out, out[i].end - 1)).toBe(i);   // внутри
    }
  });

  // Ради этого всё и переделывается: одно смещение при РАЗНОЙ нарезке
  // обязано указывать примерно в одно место книги.
  it('переживает перенарезку с другим размером фрагмента', () => {
    const small = chunk(src, 60);
    const big = chunk(src, 400);
    const from = small[7];
    const to = big[indexAt(big, from.at)];
    expect(to.at).toBeLessThanOrEqual(from.at);
    expect(to.end).toBeGreaterThan(from.at);
  });
});
