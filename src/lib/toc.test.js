import {describe, it, expect} from 'vitest';
import {detect} from './toc.js';

// Проверка главного инварианта: `at` — смещение в символах в ИСХОДНОМ тексте,
// та же координата, что и курсор чтения.
const startsAt = (text, ch) => text.slice(ch.at, ch.at + ch.title.split(' · ')[0].length);

describe('detect() — что считается заголовком', () => {
  it('«Глава N» с пустой строкой перед — заголовок', () => {
    const t = 'Начало текста.\n\nГлава 1\n\nТело главы.\n\nГлава 2\n\nЕщё тело.';
    const ch = detect(t);
    expect(ch.map(c => c.title)).toEqual(['Глава 1', 'Глава 2']);
    expect(startsAt(t, ch[0])).toBe('Глава 1');
    expect(startsAt(t, ch[1])).toBe('Глава 2');
  });

  it('римские цифры и голые числа', () => {
    const t = 'Вступление.\n\nI\n\nПервое.\n\nII\n\nВторое.';
    expect(detect(t).map(c => c.title)).toEqual(['I', 'II']);
    const n = 'Вступление.\n\n1.\n\nПервое.\n\n2.\n\nВторое.';
    expect(detect(n).map(c => c.title)).toEqual(['1.', '2.']);
  });

  it('строка капсом — заголовок', () => {
    const t = 'Что-то.\n\nЧАСТЬ ПЕРВАЯ\n\nТело.\n\nЧАСТЬ ВТОРАЯ\n\nТело.';
    expect(detect(t).map(c => c.title)).toEqual(['ЧАСТЬ ПЕРВАЯ', 'ЧАСТЬ ВТОРАЯ']);
  });

  it('английские заголовки тоже', () => {
    const t = 'Intro.\n\nChapter 1\n\nBody.\n\nChapter 2\n\nBody.';
    expect(detect(t).map(c => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  it('работает с переводами строк Windows', () => {
    const t = 'Начало.\r\n\r\nГлава 1\r\n\r\nТело.\r\n\r\nГлава 2\r\n\r\nТело.';
    const ch = detect(t);
    expect(ch).toHaveLength(2);
    expect(startsAt(t, ch[0])).toBe('Глава 1');
    expect(startsAt(t, ch[1])).toBe('Глава 2');
  });

  it('заголовок в самой первой строке не пропускается', () => {
    const t = 'Глава 1\n\nТело.\n\nГлава 2\n\nТело.';
    expect(detect(t)[0].at).toBe(0);
  });
});

describe('detect() — чего заголовком считать нельзя', () => {
  it('обычная короткая фраза — не заголовок', () => {
    const t = 'Он ушёл.\n\nОна осталась.\n\nПотом стемнело.';
    expect(detect(t)).toEqual([]);
  });

  it('строка посреди абзаца не заголовок, даже если похожа', () => {
    const t = 'Первая строка абзаца\nГлава 1\nтретья строка\n\nТекст дальше.';
    expect(detect(t)).toEqual([]);
  });

  // Одна глава — не оглавление, а строка, по которой некуда переходить.
  it('меньше двух заголовков — пусто', () => {
    expect(detect('Глава 1\n\nТолько одно тело.')).toEqual([]);
  });

  it('длинная строка не заголовок, даже если начинается со слова «Глава»', () => {
    const long = 'Глава ' + 'о том, как всё было устроено до того, как это случилось'.repeat(2);
    const t = 'Начало.\n\n' + long + '\n\nТело.\n\nГлава 2\n\nТело.';
    expect(detect(t).map(c => c.title)).toEqual([]);
  });

  it('пустой и мусорный ввод не роняет', () => {
    expect(detect('')).toEqual([]);
    expect(detect(null)).toEqual([]);
    expect(detect(undefined)).toEqual([]);
    expect(detect(12345)).toEqual([]);
  });

  it('строка из знаков без букв — не заголовок', () => {
    const t = 'Текст.\n\n***\n\nЕщё.\n\n---\n\nЕщё.';
    expect(detect(t)).toEqual([]);
  });
});

describe('detect() — склейка номера с названием', () => {
  it('«Глава 1» и следующая короткая строка склеиваются', () => {
    const t = 'Начало.\n\nГлава 1\nСтранная встреча\n\nТело.\n\nГлава 2\nВозвращение\n\nТело.';
    expect(detect(t).map(c => c.title))
      .toEqual(['Глава 1 · Странная встреча', 'Глава 2 · Возвращение']);
  });

  it('склейка не съедает начало абзаца', () => {
    const body = 'Это уже тело главы, довольно длинное предложение, которое заголовком быть не может.';
    const t = 'Начало.\n\nГлава 1\n' + body + '\n\nГлава 2\n' + body;
    expect(detect(t).map(c => c.title)).toEqual(['Глава 1', 'Глава 2']);
  });

  it('смещение указывает на номер главы, а не на приклеенное название', () => {
    const t = 'Начало.\n\nГлава 1\nВстреча\n\nТело.\n\nГлава 2\nПрощание\n\nТело.';
    const ch = detect(t);
    expect(t.slice(ch[0].at, ch[0].at + 7)).toBe('Глава 1');
  });
});

describe('detect() — форма результата', () => {
  const t = 'Начало.\n\nГлава 1\n\nТело.\n\nГлава 2\n\nТело.\n\nГлава 3\n\nТело.';

  it('смещения строго возрастают и лежат внутри текста', () => {
    const ch = detect(t);
    expect(ch).toHaveLength(3);
    for (let i = 0; i < ch.length; i++) {
      expect(ch[i].at).toBeGreaterThanOrEqual(0);
      expect(ch[i].at).toBeLessThan(t.length);
      expect(Number.isInteger(ch[i].at)).toBe(true);
      if (i) expect(ch[i].at).toBeGreaterThan(ch[i - 1].at);
    }
  });

  it('детерминирован', () => {
    expect(detect(t)).toEqual(detect(t));
  });
});
