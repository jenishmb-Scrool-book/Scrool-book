import {describe, it, expect} from 'vitest';
import {dur, grad, likes, videoTitle, views} from './visual.js';

describe('бутафорские счётчики', () => {
  it('детерминированы — иначе число прыгает при каждом перерендере', () => {
    expect(likes(7)).toBe(likes(7));
    expect(views(7)).toBe(views(7));
    expect(grad(7)).toBe(grad(7));
  });

  it('длительность ролика — правдоподобное ММ:СС', () => {
    for (const i of [0, 1, 13, 400]) expect(dur(i)).toMatch(/^\d+:\d{2}$/);
  });
});

describe('videoTitle()', () => {
  it('берёт первое предложение, без точки на конце', () => {
    expect(videoTitle('Он вышел из дома рано утром. Дальше было хуже.'))
      .toBe('Он вышел из дома рано утром');
  });

  // «Да.» — не заголовок. Короткое первое предложение склеивается со следующим.
  it('слишком короткое первое предложение не берёт', () => {
    expect(videoTitle('Да. Он вышел из дома рано утром и пошёл к реке.'))
      .toBe('Да. Он вышел из дома рано утром и пошёл к реке');
  });

  it('длинный текст режет по границе слова и ставит многоточие', () => {
    const out = videoTitle('а'.repeat(20) + ' ' + 'б'.repeat(20) + ' ' + 'в'.repeat(40));
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(66);
    expect(out).not.toContain('вв');
  });

  it('не оставляет висящую запятую перед многоточием', () => {
    const out = videoTitle('слово '.repeat(9) + ', ' + 'хвост '.repeat(10));
    expect(out).not.toMatch(/[,\s]…$/);
  });

  it('схлопывает переносы — заголовок всегда в одну строку', () => {
    expect(videoTitle('первая\n  строка и вторая')).toBe('первая строка и вторая');
  });

  it('пустой вход не роняет', () => {
    expect(videoTitle('')).toBe('');
    expect(videoTitle(null)).toBe('');
    expect(videoTitle(undefined)).toBe('');
  });
});
