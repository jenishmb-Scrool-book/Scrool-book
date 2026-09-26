import {describe, it, expect} from 'vitest';
import {FAST, STEP, credit, dayKey, readPace, streakOf, tally, todayOf} from './streak.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

describe('dayKey()', () => {
  it('местная дата, а не UTC: полночь считается там, где человек', () => {
    expect(dayKey(at(2026, 9, 26, 0))).toBe('2026-09-26');
    expect(dayKey(at(2026, 9, 26, 23))).toBe('2026-09-26');
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });
});

describe('tally()', () => {
  it('первое чтение заводит счёт: сегодня столько, серия — один день', () => {
    expect(tally(null, 500, at(2026, 9, 26))).toEqual({d: '2026-09-26', n: 500, s: 1});
  });

  it('в тот же день — прибавляет', () => {
    const p = tally(tally(null, 500, at(2026, 9, 26, 9)), 300, at(2026, 9, 26, 22));
    expect(p).toEqual({d: '2026-09-26', n: 800, s: 1});
  });

  it('на следующий день — серия растёт, счёт дня начинается заново', () => {
    const p = tally(tally(null, 500, at(2026, 9, 26)), 300, at(2026, 9, 27));
    expect(p).toEqual({d: '2026-09-27', n: 300, s: 2});
  });

  it('через месяц и год — тоже «следующий день»', () => {
    expect(tally({d: '2026-09-30', n: 1, s: 4}, 10, at(2026, 10, 1)).s).toBe(5);
    expect(tally({d: '2026-12-31', n: 1, s: 4}, 10, at(2027, 1, 1)).s).toBe(5);
  });

  it('пропущенный день обрывает серию', () => {
    const p = tally({d: '2026-09-24', n: 900, s: 7}, 300, at(2026, 9, 26));
    expect(p).toEqual({d: '2026-09-26', n: 300, s: 1});
  });

  it('один сдвиг засчитывается не больше чем на STEP знаков', () => {
    // Быстрый бросок ленты пальцем проносит десятки карточек за раз: это
    // не чтение, и сорок страниц за секунду в счёт не идут.
    expect(tally(null, STEP * 10, at(2026, 9, 26)).n).toBe(STEP);
  });

  it('ноль и мусор счёт не трогают', () => {
    const p = {d: '2026-09-26', n: 5, s: 2};
    expect(tally(p, 0, at(2026, 9, 26))).toBe(p);
    expect(tally(p, -40, at(2026, 9, 26))).toBe(p);
    expect(tally(p, NaN, at(2026, 9, 26))).toBe(p);
  });

  it('часы, переведённые назад, серию не ломают и не удваивают', () => {
    // Последнее чтение «в будущем»: считаем его сегодняшним днём, а не новым.
    const p = tally({d: '2026-09-28', n: 5, s: 3}, 10, at(2026, 9, 26));
    expect(p).toEqual({d: '2026-09-26', n: 10, s: 3});
  });
});

describe('todayOf() и streakOf()', () => {
  const p = {d: '2026-09-26', n: 2200, s: 4};

  it('сегодня: знаки дня и серия', () => {
    expect(todayOf(p, at(2026, 9, 26))).toBe(2200);
    expect(streakOf(p, at(2026, 9, 26))).toBe(4);
  });

  it('назавтра серия ещё жива, а сегодняшний счёт — ноль', () => {
    // Не читал ещё сегодня — это не «серия прервана»: день не кончился.
    expect(todayOf(p, at(2026, 9, 27))).toBe(0);
    expect(streakOf(p, at(2026, 9, 27))).toBe(4);
  });

  it('через день серии нет', () => {
    expect(streakOf(p, at(2026, 9, 28))).toBe(0);
    expect(todayOf(p, at(2026, 9, 28))).toBe(0);
  });

  it('пусто — нули', () => {
    expect(todayOf(null, at(2026, 9, 26))).toBe(0);
    expect(streakOf(null, at(2026, 9, 26))).toBe(0);
  });
});

describe('readPace()', () => {
  it('пропускает только целую запись', () => {
    expect(readPace({d: '2026-09-26', n: 10, s: 2})).toEqual({d: '2026-09-26', n: 10, s: 2});
    expect(readPace({d: '2026-09-26', n: 10.7, s: 2.2})).toEqual({d: '2026-09-26', n: 10, s: 2});
  });

  it('мусор из хранилища — null', () => {
    for (const bad of [null, 5, 'x', {}, {d: 'вчера', n: 1, s: 1}, {d: '2026-09-26', n: -1, s: 1},
      {d: '2026-09-26', n: 1, s: 0}, {d: '2026-09-26', n: 'много', s: 1}]) {
      expect(readPace(bad)).toBeNull();
    }
  });
});

describe('credit()', () => {
  it('засчитывает сдвиг целиком, если на него было время', () => {
    expect(credit(500, 60000)).toBe(500);
  });

  it('бросок ленты засчитывается не целиком, а сколько можно было успеть', () => {
    // Три тысячи знаков за две секунды не прочитать: втрое быстрее спокойного
    // чтения — это около ста знаков за две секунды.
    expect(credit(3000, 2000)).toBe(Math.floor(2000 * FAST));
    expect(credit(3000, 2000)).toBeLessThan(200);
  });

  it('не больше STEP и не меньше нуля', () => {
    expect(credit(STEP * 5, 1e9)).toBe(STEP);
    expect(credit(-50, 1e9)).toBe(0);
    expect(credit(100, -5)).toBe(0);
    expect(credit(NaN, 1000)).toBe(0);
  });
});
