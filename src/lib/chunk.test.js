import {describe, it, expect} from 'vitest';
import {chunk} from './chunk.js';

describe('chunk()', () => {
  it('режет текст на абзацы по пустым строкам', () => {
    expect(chunk('раз\n\nдва')).toEqual(['раз', 'два']);
  });

  it('отбрасывает пустые куски', () => {
    expect(chunk('  \n\n  ')).toEqual([]);
    expect(chunk('')).toEqual([]);
    expect(chunk('раз\n\n   \n\nдва')).toEqual(['раз', 'два']);
  });

  it('короткий абзац не режет', () => {
    expect(chunk('а'.repeat(50), 280)).toHaveLength(1);
    expect(chunk('Одно. Два.', 280)).toEqual(['Одно. Два.']);
  });

  it('схлопывает переносы и пробелы внутри абзаца', () => {
    expect(chunk('раз\nдва   три\tчетыре')).toEqual(['раз два три четыре']);
  });

  it('длинный абзац режет по границам предложений', () => {
    const out = chunk('Первое предложение. '.repeat(40), 280);
    expect(out.length).toBeGreaterThan(1);
    // разрез именно по точкам: каждый кусок кончается знаком конца предложения
    for (const c of out) expect(c).toMatch(/[.!?…»"]$/);
  });

  it('ни один кусок не длиннее max * 1.15', () => {
    const out = chunk('Первое предложение. '.repeat(40), 280);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(280 * 1.15);
  });

  it('уважает переданный max', () => {
    const out = chunk('Раз два три. '.repeat(30), 60);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(60 * 1.15);
  });

  it('по умолчанию max = 280', () => {
    expect(chunk('Фраза. '.repeat(200))).toEqual(chunk('Фраза. '.repeat(200), 280));
  });

  // Граница: предложение длиннее max разрезать не по чему. Оно обязано выйти
  // целиком одним куском, а не потеряться и не увести цикл в бесконечность.
  it('одно предложение длиннее max отдаёт целиком и не зацикливается', () => {
    const one = 'я'.repeat(600);
    const out = chunk(one, 280);
    expect(out).toEqual([one]);
  });

  it('не теряет ни одного символа текста', () => {
    const src = 'Начало. ' + 'ю'.repeat(700) + ' Хвост первый. Хвост второй.\n\nВторой абзац.';
    const bare = s => s.replace(/\s+/g, '');
    expect(bare(chunk(src, 280).join(''))).toBe(bare(src));
  });

  it('чистая функция: одинаковый вход — одинаковый выход, новый массив', () => {
    const src = 'Раз. Два.\n\nТри.';
    const a = chunk(src), b = chunk(src);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
