import {describe, it, expect} from 'vitest';
import {PAGE, pageAt, pageCount} from './pages.js';

describe('pageCount()', () => {
  it('пустой текст — ноль страниц', () => {
    expect(pageCount(0)).toBe(0);
    expect(pageCount(null)).toBe(0);
  });

  it('любой непустой текст — минимум одна страница', () => {
    expect(pageCount(1)).toBe(1);
    expect(pageCount(PAGE)).toBe(1);
  });

  it('округляет вверх', () => {
    expect(pageCount(PAGE + 1)).toBe(2);
    expect(pageCount(PAGE * 3)).toBe(3);
  });
});

describe('pageAt()', () => {
  const len = PAGE * 3;

  it('начало текста — первая страница', () => {
    expect(pageAt(0, len)).toBe(1);
  });

  it('смещение внутри страницы даёт её номер', () => {
    expect(pageAt(PAGE - 1, len)).toBe(1);
    expect(pageAt(PAGE, len)).toBe(2);
    expect(pageAt(PAGE * 2 + 5, len)).toBe(3);
  });

  it('не вылезает за последнюю страницу', () => {
    expect(pageAt(len * 10, len)).toBe(3);
  });

  it('отрицательное смещение — первая страница', () => {
    expect(pageAt(-100, len)).toBe(1);
  });

  it('пустой текст — ноль', () => {
    expect(pageAt(0, 0)).toBe(0);
  });
});
