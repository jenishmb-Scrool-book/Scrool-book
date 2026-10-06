import {describe, it, expect} from 'vitest';
import {classicOf, loadClassic} from './classics.js';
import {detect} from './lib/toc.js';
import {DICT} from './i18n.js';

// Тексты собраны из чужой разметки — вики-текста Викитеки и Project
// Gutenberg — и всё, что от неё осталось, тестировщик увидит буквами прямо в
// переписке. Оглавление же у них распознаётся из самого текста, как у
// вставленной книги, и лишняя строка капсом стала бы в нём главой.
describe.each([
  ['ru', 14, 'Глава I. Сержант гвардии', 'Глава XIV. Суд'],
  ['en', 12, 'Chapter I. Down the Rabbit-Hole', 'Chapter XII. Alice’s Evidence']
])('книга из приложения: %s', (lang, n, first, last) => {
  it('главы распознаются все и только они', async () => {
    const chapters = detect(await loadClassic(lang));
    expect(chapters).toHaveLength(n);
    expect(chapters[0].title).toBe(first);
    expect(chapters[n - 1].title).toBe(last);
  });

  it('без остатков разметки', async () => {
    const text = await loadClassic(lang);
    expect(text).not.toMatch(/\{\{|\}\}|\[\[|<\/?\w|__|_\w|''|&nbsp;|\r/);
    expect(text.toLowerCase()).not.toContain('gutenberg');
  });

  it('начинается с названия, под которым ляжет в библиотеку', async () => {
    const head = (await loadClassic(lang)).split('\n')[0].replace(/'/g, '’');
    expect(head).toBe(classicOf(lang).title);
  });

  // Подпись кнопки и роман связаны только словами: смени книгу — кнопка
  // продолжит звать прежнюю.
  it('кнопка называет именно эту книгу', () => {
    const word = lang === 'ru' ? 'Капитанскую дочку' : 'Alice';
    expect(DICT[lang]['lib.classic_add']).toContain(word);
  });
});
