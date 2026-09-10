import {describe, it, expect} from 'vitest';
import {COUNT, MAX, MIN, TOTAL, budget, dataUrl, mimeOf, sizeOfB64, toB64} from './img.js';

const bytes = n => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = i % 256;
  return a;
};

describe('mimeOf()', () => {
  it('приводит объявленный тип к каноническому', () => {
    expect(mimeOf('image/jpeg', 'a.jpg')).toBe('image/jpeg');
    // Такого типа не существует, но в fb2 он встречается чаще правильного.
    expect(mimeOf('image/jpg', 'a.bin')).toBe('image/jpeg');
    expect(mimeOf('IMAGE/PNG', '')).toBe('image/png');
    expect(mimeOf('image/jpeg; charset=binary', '')).toBe('image/jpeg');
  });

  it('без объявленного типа берёт расширение', () => {
    expect(mimeOf('', 'cover.PNG')).toBe('image/png');
    expect(mimeOf(null, 'pics/img_01.webp')).toBe('image/webp');
    expect(mimeOf('application/octet-stream', 'x.gif')).toBe('image/gif');
  });

  it('незнакомое — пустая строка, а не догадка', () => {
    expect(mimeOf('', 'file.bin')).toBe('');
    expect(mimeOf('text/html', 'page.xhtml')).toBe('');
    expect(mimeOf('', '')).toBe('');
  });

  // Оговорено намеренно: в svg живут ссылки и скрипты, и это единственный
  // формат картинки, который сам себе разметка.
  it('svg не берём ни по типу, ни по расширению', () => {
    expect(mimeOf('image/svg+xml', 'cover.svg')).toBe('');
    expect(mimeOf('', 'cover.svg')).toBe('');
  });
});

describe('toB64()', () => {
  it('кодирует байты обратимо', () => {
    const src = bytes(300);
    const back = atob(toB64(src));
    expect(back).toHaveLength(300);
    for (let i = 0; i < 300; i++) expect(back.charCodeAt(i)).toBe(src[i]);
  });

  // Ровно тот случай, ради которого кодирование идёт кусками: на массиве
  // в мегабайт `String.fromCharCode(...массив)` бросает RangeError.
  it('мегабайт не роняет стек', () => {
    const src = bytes(1024 * 1024);
    const b64 = toB64(src);
    expect(sizeOfB64(b64)).toBe(src.length);
  });

  it('пустые байты — пустая строка', () => {
    expect(toB64(new Uint8Array(0))).toBe('');
  });
});

describe('sizeOfB64()', () => {
  it('считает размер с добивкой и без', () => {
    for (const n of [1, 2, 3, 4, 5, 100, 511, 512, 1000]) {
      expect(sizeOfB64(toB64(bytes(n))), String(n)).toBe(n);
    }
  });

  it('мусор не роняет', () => {
    expect(sizeOfB64(null)).toBe(0);
    expect(sizeOfB64('')).toBe(0);
  });
});

describe('budget()', () => {
  it('мелочь отсекает: это распорки и маркеры, а не иллюстрации', () => {
    const fits = budget();
    expect(fits(MIN - 1)).toBe(false);
    expect(fits(MIN)).toBe(true);
  });

  it('слишком крупное отсекает тоже', () => {
    const fits = budget();
    expect(fits(MAX + 1)).toBe(false);
    expect(fits(MAX)).toBe(true);
  });

  it('останавливается по числу картинок', () => {
    const fits = budget();
    for (let i = 0; i < COUNT; i++) expect(fits(MIN), 'картинка ' + i).toBe(true);
    expect(fits(MIN)).toBe(false);
  });

  it('останавливается по общему весу', () => {
    const fits = budget();
    let total = 0;
    while (total + MAX <= TOTAL) {
      expect(fits(MAX)).toBe(true);
      total += MAX;
    }
    expect(fits(MAX)).toBe(false);
    // Место под мелкую ещё осталось — значит счётчик считает вес, а не «хватит».
    expect(fits(MIN)).toBe(TOTAL - total >= MIN);
  });

  // Счётчики у двух книг подряд не должны складываться: иначе вторая книга
  // импортировалась бы без картинок и без единого следа почему.
  it('у каждого вызова свой счёт', () => {
    const a = budget();
    for (let i = 0; i < COUNT; i++) a(MIN);
    expect(a(MIN)).toBe(false);
    expect(budget()(MIN)).toBe(true);
  });
});

describe('dataUrl()', () => {
  it('собирает src для <img>', () => {
    expect(dataUrl('image/png', 'AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
