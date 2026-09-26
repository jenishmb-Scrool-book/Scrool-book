import {describe, it, expect} from 'vitest';
import {CAP, MIN, around, find, pattern} from './find.js';

const ats = r => r.hits.map(h => h.at);

describe('pattern()', () => {
  it('короче MIN знаков — искать нечего', () => {
    expect(pattern('')).toBeNull();
    expect(pattern(' a ')).toBeNull();
    expect(pattern('a'.repeat(MIN))).not.toBeNull();
  });

  it('не строка — искать нечего', () => {
    expect(pattern(null)).toBeNull();
    expect(pattern(42)).toBeNull();
  });
});

describe('find()', () => {
  it('отдаёт смещения в исходном тексте, без учёта регистра', () => {
    const text = 'Анна пришла. Потом АННА ушла, а анна осталась.';
    const r = find(text, 'анна');
    expect(ats(r)).toEqual([0, 19, 32]);
    expect(r.hits.every(h => h.len === 4)).toBe(true);
    expect(r.total).toBe(3);
    expect(r.more).toBe(false);
  });

  it('ё и е — одна буква: в книгах ё ставят через раз', () => {
    expect(ats(find('Её ёлка', 'ее елка'))).toEqual([0]);
    expect(ats(find('Ее елка', 'её ёлка'))).toEqual([0]);
    expect(ats(find('ЁЖ и еж', 'еж'))).toEqual([0, 5]);
  });

  it('пробел в запросе совпадает с переводом строки и несколькими пробелами', () => {
    const text = 'конец\nстроки и конец   строки';
    expect(ats(find(text, 'конец строки'))).toEqual([0, 15]);
    // Длина совпадения — по тексту, а не по запросу: подсветке нужна именно она.
    expect(find(text, 'конец строки').hits[1].len).toBe(14);
  });

  it('знаки регулярных выражений ищутся буквально', () => {
    expect(ats(find('axb a.b', 'a.b'))).toEqual([4]);
    expect(ats(find('сноска (1) и (2)', '(1)'))).toEqual([7]);
    expect(ats(find('a+b a\\b', 'a\\b'))).toEqual([4]);
  });

  it('любой набранный знак собирается в шаблон, а не роняет поиск', () => {
    // С флагом `u` лишнее экранирование — ошибка конструктора. Перебираем
    // всё, что есть на клавиатуре телефона, включая дефис из «из-за».
    const keys = '-_=!@#№%&:;"«»,<>~`' + ".*+?^${}()|[]\\/'’";
    for (const c of keys) expect(() => find('x' + c + 'x', 'x' + c + 'x')).not.toThrow();
    expect(ats(find('из-за угла, из за угла', 'из-за'))).toEqual([0]);
  });

  it('прямой и типографский апостроф — одно и то же', () => {
    expect(ats(find('don’t and don\'t', "don't"))).toEqual([0, 10]);
    expect(ats(find('don’t and don\'t', 'don’t'))).toEqual([0, 10]);
  });

  it('отдаёт не больше limit находок, но считает дальше', () => {
    const text = 'ab '.repeat(50);
    const r = find(text, 'ab', 10);
    expect(r.hits).toHaveLength(10);
    expect(r.total).toBe(50);
    expect(r.more).toBe(false);
  });

  it('счёт обрывается на CAP — и говорит об этом', () => {
    const text = 'ab '.repeat(CAP + 50);
    const r = find(text, 'ab', 5);
    expect(r.total).toBe(CAP);
    expect(r.more).toBe(true);
  });

  it('пустой запрос или текст — пусто, без падения', () => {
    expect(find('текст', '')).toEqual({hits: [], total: 0, more: false});
    expect(find('', 'текст')).toEqual({hits: [], total: 0, more: false});
    expect(find(null, 'текст')).toEqual({hits: [], total: 0, more: false});
  });
});

describe('around()', () => {
  const text = 'Первое предложение тут. Второе, где живёт Анна Каренина, и третье потом.';
  const at = text.indexOf('Анна');

  it('делит строку на до, само совпадение и после', () => {
    const s = around(text, at, 4, 1000, 1000);
    expect(s.head + s.hit + s.tail).toBe(text);
    expect(s.hit).toBe('Анна');
  });

  it('не рвёт слова на краях и ставит многоточие, где текст обрезан', () => {
    const s = around(text, at, 4, 12, 12);
    expect(s.hit).toBe('Анна');
    expect(s.head.startsWith('…')).toBe(true);
    expect(s.tail.endsWith('…')).toBe(true);
    // Слово на краю либо целое, либо его нет вовсе.
    const words = text.split(/\s+/);
    const first = s.head.slice(1).trim().split(' ')[0];
    const last = s.tail.slice(0, -1).trim().split(' ').pop();
    expect(words).toContain(first);
    expect(words).toContain(last);
  });

  it('переводы строк превращает в пробелы: превью — одна строка', () => {
    const s = around('раз\n\nдва Анна\nтри', 9, 4, 100, 100);
    expect(s.head).toBe('раз два ');
    expect(s.tail).toBe(' три');
  });

  it('у начала и конца текста многоточия нет', () => {
    const s = around('Анна', 0, 4);
    expect(s).toEqual({head: '', hit: 'Анна', tail: ''});
  });
});
