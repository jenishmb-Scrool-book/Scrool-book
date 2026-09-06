import {describe, it, expect} from 'vitest';
import {CPM, minutesLeft, split} from './pace.js';

describe('minutesLeft()', () => {
  it('минута на CPM знаков', () => {
    expect(minutesLeft(0, CPM)).toBe(1);
    expect(minutesLeft(0, CPM * 100)).toBe(100);
  });

  it('дочитано — ноль', () => {
    expect(minutesLeft(1000, 1000)).toBe(0);
    expect(minutesLeft(0, 0)).toBe(0);
  });

  // Остаток меньше минуты — всё равно «1 мин»: ноль на непрочитанном тексте
  // выглядит как ошибка.
  it('непрочитанный хвост округляется вверх до минуты', () => {
    expect(minutesLeft(0, 10)).toBe(1);
    expect(minutesLeft(CPM * 2 - 5, CPM * 2)).toBe(1);
  });

  it('курсор за пределами текста не даёт отрицательного времени', () => {
    expect(minutesLeft(5000, 1000)).toBe(0);
    expect(minutesLeft(-100, 1000)).toBe(1);
  });

  it('мусор на входе не роняет', () => {
    expect(minutesLeft(NaN, 1000)).toBe(1);
    expect(minutesLeft(0, NaN)).toBe(0);
    expect(minutesLeft(undefined, undefined)).toBe(0);
  });
});

describe('split()', () => {
  it('меньше часа — только минуты', () => {
    expect(split(0)).toEqual({h: 0, m: 0});
    expect(split(59)).toEqual({h: 0, m: 59});
  });

  it('ровный час — минут нет', () => {
    expect(split(60)).toEqual({h: 1, m: 0});
    expect(split(180)).toEqual({h: 3, m: 0});
  });

  it('часы и минуты вместе', () => {
    expect(split(125)).toEqual({h: 2, m: 5});
    expect(split(61)).toEqual({h: 1, m: 1});
  });

  it('мусор не роняет', () => {
    expect(split(-10)).toEqual({h: 0, m: 0});
    expect(split(NaN)).toEqual({h: 0, m: 0});
  });
});
