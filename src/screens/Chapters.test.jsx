import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act, fireEvent} from '@testing-library/react';
import App from '../App.jsx';
import {StoreProvider} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {DICT} from '../i18n.js';

// Поиск по книге — вкладка оглавления. Проверяется через всё приложение, а не
// отдельным экраном: половина того, что здесь может сломаться, — провода.
// Строка поиска на домашнем экране обязана открыть именно вкладку поиска, а
// находка — поставить место чтения и вернуть в то «приложение», откуда пришли.

vi.mock('../native.js', async orig => ({
  ...(await orig()),
  initNative: async () => {},
  refreshNotifications: async () => 'on'
}));

const FILL = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(60);
const NEEDLE = 'Однажды пришёл Ёжик Колючкин и сел под ёлкой.\n\n';
const TEXT = FILL + NEEDLE + FILL;
const AT = FILL.length + NEEDLE.indexOf('Ёжик');

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const here = () => {
  const el = document.querySelector('.screen');
  return el ? el.id : null;
};
const input = () => document.querySelector('.qbox input');

async function boot(place) {
  await Promise.all([
    saveText('b1', TEXT),
    saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1',
      at: {b1: 0},
      last: 'feed',
      intro: 1,
      place
    })
  ]);
  render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
  // Экран загрузки ушёл — это коммит гидрации, но не её эффекты: возврат на
  // прошлый экран делает эффект, и под нагрузкой (файлы тестов идут
  // параллельно) он успевал не всегда. Тест тогда видел дом вместо места.
  await act(async () => {});
}

async function ask(q) {
  await act(async () => {fireEvent.change(input(), {target: {value: q}});});
}

beforeEach(() => localStorage.clear());

describe('поиск по книге', () => {
  it('строка поиска на домашнем экране открывает поиск с поднятой клавиатурой', async () => {
    await boot({id: 'home', arg: null});
    await act(async () => {document.querySelector('.qsearch').click();});
    expect(here()).toBe('toc');
    expect(document.querySelector('.tabs span.on').textContent).toBe(DICT.ru['toc.tab_search']);
    expect(document.activeElement).toBe(input());
  });

  it('без глав вкладок две: страницы и поиск', async () => {
    await boot({id: 'toc', arg: null});
    const tabs = [...document.querySelectorAll('.tabs span')].map(s => s.textContent);
    expect(tabs).toEqual([DICT.ru['toc.tab_pages'], DICT.ru['toc.tab_search']]);
  });

  it('находит без учёта регистра и ё и подсвечивает найденное', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('ежик колючкин');
    await waitFor(() => expect(document.querySelectorAll('.snip')).toHaveLength(1));
    expect(document.querySelector('.snip mark').textContent).toBe('Ёжик Колючкин');
    expect(document.querySelector('.scount').textContent).toBe('Нашлось: 1');
  });

  it('находка ставит место чтения и возвращает туда, где читали', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('колючкин');
    await waitFor(() => expect(document.querySelector('.snip')).not.toBeNull());
    await act(async () => {document.querySelector('.snip').closest('.ch').click();});
    expect(here()).toBe('feed');
    // Место — ровно на найденном слове, а не на начале страницы: карточка,
    // которая откроется, та, что это слово содержит.
    await waitFor(() => expect(rawMeta().at.b1).toBe(AT + 'Ёжик '.length));
    // Перепрыгнутые страницы — не прочитанные: в счёт дня они не идут.
    expect(rawMeta().pace || null).toBeNull();
  });

  it('на экране чтения найденное слово — под маркером, другой переход маркер снимает', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('колючкин');
    await waitFor(() => expect(document.querySelector('.snip')).not.toBeNull());
    await act(async () => {document.querySelector('.snip').closest('.ch').click();});
    expect(here()).toBe('feed');
    const marks = [...document.querySelectorAll('mark.hit')];
    expect(marks.map(m => m.textContent)).toEqual(['Колючкин']);
    // Любой переход после этого — уже не «вот оно»: на новом экране маркера нет.
    // Лупа на нижней панели ленты — второй значок.
    await act(async () => {document.querySelectorAll('.tabbar span')[1].click();});
    expect(here()).toBe('toc');
    expect(document.querySelector('mark.hit')).toBeNull();
  });

  it('одна буква — подсказка, чужое слово — «ничего не нашлось»', async () => {
    await boot({id: 'toc', arg: 'search'});
    expect(document.querySelector('#toc .hint').textContent).toBe(DICT.ru['toc.search_hint']);
    await ask('ё');
    expect(document.querySelector('#toc .hint').textContent).toBe(DICT.ru['toc.search_hint']);
    await ask('бармаглот');
    await waitFor(() =>
      expect(document.querySelector('#toc .hint').textContent).toBe(DICT.ru['toc.search_none']));
  });

  it('крестик стирает запрос и возвращает фокус в поле', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('зайчик');
    await waitFor(() => expect(document.querySelector('.qx')).not.toBeNull());
    input().blur();
    await act(async () => {document.querySelector('.qx').click();});
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
    expect(document.querySelector('.qx')).toBeNull();
  });

  it('частое слово: показывает первые находки и честно говорит, что их больше', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('зайчик');
    await waitFor(() => expect(document.querySelectorAll('.snip').length).toBeGreaterThan(0));
    expect(document.querySelector('.scount').textContent).toBe('Нашлось: 120');
    expect(document.querySelectorAll('.snip')).toHaveLength(120);
  });
});
