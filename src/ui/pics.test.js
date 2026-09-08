import {describe, expect, it} from 'vitest';
import {FACE, POOLS, pic, shot} from './pics.js';

describe('pic', () => {
  it('нумерует с единицы и добивает нулями', () => {
    expect(pic('post', 0)).toBe('pics/post/001.webp');
    expect(pic('post', 9)).toBe('pics/post/010.webp');
    expect(pic('post', 99)).toBe('pics/post/100.webp');
  });

  it('у каждой ленты своя папка и свой счёт', () => {
    expect(pic('wide', 0)).toBe('pics/wide/001.webp');
    expect(pic('tall', 0)).toBe('pics/tall/001.webp');
    expect(pic('face', 0)).toBe('pics/face/001.webp');
  });

  it('идёт по кругу: книга длиннее любой ленты', () => {
    for (const [kind, count] of Object.entries(POOLS)) {
      expect(pic(kind, count)).toBe(pic(kind, 0));
      expect(pic(kind, count * 3 + 5)).toBe(pic(kind, 5));
      expect(pic(kind, count - 1)).toBe('pics/' + kind + '/' + String(count).padStart(3, '0') + '.webp');
    }
  });

  it('отрицательный номер отсчитывает с конца, а не ломает путь', () => {
    // Смещение приходит из прокрутки, и на резком движении вверх оно
    // ненадолго уходит в минус. Путь `pics/post/000.webp` дал бы пустой кадр.
    expect(pic('post', -1)).toBe('pics/post/' + POOLS.post + '.webp');
    expect(pic('face', -POOLS.face)).toBe('pics/face/001.webp');
  });

  it('мусор вместо номера даёт первую картинку, а не поломанный путь', () => {
    for (const bad of [undefined, null, NaN, 'что-то', {}, Infinity]) {
      expect(pic('post', bad)).toBe('pics/post/001.webp');
    }
  });

  it('неизвестная лента не роняет: отдаёт посты', () => {
    expect(pic('нет-такой', 0)).toBe('pics/post/001.webp');
    expect(pic(undefined, 3)).toBe('pics/post/004.webp');
  });
});

describe('shot', () => {
  it('кладёт снимок поверх запасной заливки', () => {
    expect(shot('post', 0, 'red')).toBe('url(pics/post/001.webp) center/cover no-repeat,red');
  });

  it('без запасной заливки не оставляет висящую запятую', () => {
    // Запятая в конце — недопустимое значение `background`, и браузер
    // отбрасывает всё правило целиком, а не только хвост.
    expect(shot('face', 2)).toBe('url(pics/face/003.webp) center/cover no-repeat');
    expect(shot('face', 2, '')).toBe('url(pics/face/003.webp) center/cover no-repeat');
  });
});

describe('FACE', () => {
  it('указывает внутрь ленты аватарок', () => {
    expect(FACE).toBeGreaterThanOrEqual(0);
    expect(FACE).toBeLessThan(POOLS.face);
  });
});
