import {describe, it, expect} from 'vitest';
import {isZip, openZip} from './zip.js';
import {u8, zipOf} from './zip.fixture.js';

// Распаковка целых книг проверяется в epub.test.js и book.test.js — здесь
// только то, что стало наружным, когда архив уехал из epub.js в свой модуль.
describe('isZip()', () => {
  it('узнаёт архив по первым четырём байтам', () => {
    expect(isZip(zipOf({'a.txt': 'раз'}))).toBe(true);
  });

  it('на тексте и на коротком куске не срабатывает', () => {
    expect(isZip(u8('обычный текст, а не архив'))).toBe(false);
    expect(isZip(new Uint8Array([0x50, 0x4b]))).toBe(false);
  });
});

describe('openZip()', () => {
  it('отдаёт имена файлов в том порядке, в каком они в архиве', () => {
    expect(openZip(zipOf({'b.txt': 'два', 'a.txt': 'раз'})).names).toEqual(['b.txt', 'a.txt']);
  });

  it('читает файл по имени', async () => {
    const z = openZip(zipOf({'a.txt': 'раз'}));
    expect(new TextDecoder().decode(await z.read('a.txt'))).toBe('раз');
  });

  it('файла нет — null, а не исключение', async () => {
    expect(await openZip(zipOf({'a.txt': 'раз'})).read('b.txt')).toBe(null);
  });

  it('не архив — ошибка с человеческим текстом', () => {
    expect(() => openZip(u8('это не архив, а просто текст подлиннее двадцати двух байт')))
      .toThrow(/архив/i);
  });
});
