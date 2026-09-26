import {describe, it, expect} from 'vitest';
import {SIZE, reelSize} from './sizes.js';

// Кусок клипа обязан поместиться в карточку целиком: хвост во внутренней
// прокрутке под snap-листанием никто не читает.
describe('reelSize()', () => {
  it('на обычном телефоне с обычным кеглем — полный кусок', () => {
    expect(reelSize('md', 375, 812)).toBe(SIZE.reels);
  });

  it('маленький экран и крупный кегль — кусок меньше', () => {
    const small = reelSize('lg', 360, 640);
    expect(small).toBeLessThan(SIZE.reels);
    expect(small).toBeLessThanOrEqual(200);
  });

  it('чем крупнее кегль, тем меньше кусок', () => {
    expect(reelSize('lg', 360, 640)).toBeLessThan(reelSize('md', 360, 640));
    expect(reelSize('md', 360, 640)).toBeLessThanOrEqual(reelSize('sm', 360, 640));
  });

  it('не меньше 120 даже на крошечном экране и не больше обычного', () => {
    expect(reelSize('lg', 240, 320)).toBe(120);
    expect(reelSize('sm', 1200, 2000)).toBe(SIZE.reels);
  });

  it('мусор на входе — как обычный телефон', () => {
    expect(reelSize('xx', undefined, NaN)).toBe(reelSize('md', 375, 812));
  });
});
