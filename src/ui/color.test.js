import {describe, it, expect} from 'vitest';
import {hexOf, isLight, rgbOf} from './color.js';

describe('rgbOf()', () => {
  it('разбирает то, что отдаёт getComputedStyle', () => {
    expect(rgbOf('rgb(50, 130, 184)')).toEqual([50, 130, 184]);
    expect(rgbOf('rgba(31, 122, 85, 1)')).toEqual([31, 122, 85]);
  });

  // Прозрачное — это «цвета нет»: у дома фон градиентный, background-color там
  // пустой, и покрасить бар в него значит получить чёрную полоску.
  it('полупрозрачное считает отсутствием цвета', () => {
    expect(rgbOf('rgba(0, 0, 0, 0)')).toBe(null);
    expect(rgbOf('rgba(255, 255, 255, 0.5)')).toBe(null);
  });

  it('непрозрачное с альфой единица берёт', () => {
    expect(rgbOf('rgba(9, 9, 9, 1)')).toEqual([9, 9, 9]);
  });

  it('мусор не роняет', () => {
    expect(rgbOf('')).toBe(null);
    expect(rgbOf(null)).toBe(null);
    expect(rgbOf('transparent')).toBe(null);
  });

  // getComputedStyle таких значений не отдаёт, но разбор не должен зависеть
  // от того, кто его позвал: дробное округляем, большое прижимаем.
  it('дробное округляет, слишком большое прижимает', () => {
    expect(rgbOf('rgb(300, 5, 12.6)')).toEqual([255, 5, 13]);
  });

  it('отрицательное значение — не цвет, а поломка: отдаём null', () => {
    expect(rgbOf('rgb(-20, 5, 5)')).toBe(null);
  });

  // Полноэкранные экраны цвет не замеряют, а объявляют шестнадцатеричным.
  it('понимает #rrggbb и короткую форму', () => {
    expect(rgbOf('#000000')).toEqual([0, 0, 0]);
    expect(rgbOf('#0b0b12')).toEqual([11, 11, 18]);
    expect(rgbOf('#fff')).toEqual([255, 255, 255]);
    expect(rgbOf('#1f7a55')).toEqual([31, 122, 85]);
  });

  it('на не-цвет и битую шестнадцатеричную запись отдаёт null', () => {
    expect(rgbOf('#12345')).toBe(null);
    expect(rgbOf('#zzz')).toBe(null);
  });
});

describe('hexOf()', () => {
  it('дополняет нулём — плагину нужен ровно #rrggbb', () => {
    expect(hexOf([11, 11, 18])).toBe('#0b0b12');
    expect(hexOf([255, 255, 255])).toBe('#ffffff');
  });
});

describe('isLight()', () => {
  it('белое светлое, чёрное нет', () => {
    expect(isLight([255, 255, 255])).toBe(true);
    expect(isLight([0, 0, 0])).toBe(false);
  });

  // Ради этих двух и заведено: на синей шапке значки белые, на белой чёрные.
  it('синяя шапка тёмная, белая светлая', () => {
    expect(isLight([50, 130, 184])).toBe(false);
    expect(isLight([244, 244, 247])).toBe(true);
  });

  it('зелёный тянет яркость сильнее синего', () => {
    expect(isLight([0, 200, 0])).toBe(true);
    expect(isLight([0, 0, 200])).toBe(false);
  });
});
