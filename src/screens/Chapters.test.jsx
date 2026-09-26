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

describe('дорога назад после перехода', () => {
  // Переход из оглавления переносит место чтения. Нажал не ту строку — и без
  // этой страховки вернуться можно было только по памяти.
  it('после перехода оглавление предлагает вернуться, и возврат её снимает', async () => {
    await boot({id: 'toc', arg: 'pages'});
    const pages = () => [...document.querySelectorAll('#toc .body .ch')];
    await act(async () => {pages()[3].click();});          // страница 4
    expect(here()).toBe('feed');
    await waitFor(() => expect(rawMeta().at.b1).toBe(3 * 1800));

    // С плашки «страница / осталось» — обратно в оглавление.
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    expect(here()).toBe('toc');
    const undo = document.querySelector('.ch.undo');
    expect(undo.querySelector('b').textContent).toBe('Вернуться на страницу 1');

    await act(async () => {undo.click();});
    expect(here()).toBe('feed');
    await waitFor(() => expect(rawMeta().at.b1).toBe(0));
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    // Вернулись — и возвращаться больше некуда.
    expect(document.querySelector('.ch.undo')).toBeNull();
  });

  it('два перехода подряд: «вернуться» ведёт туда, где читали, а не на первую находку', async () => {
    // Нажал не ту находку, вернулся в поиск, нажал другую. Место чтения —
    // то, что было до ПЕРВОГО прыжка: между прыжками не читали.
    await boot({id: 'toc', arg: 'pages'});
    const pages = () => [...document.querySelectorAll('#toc .body .ch')];
    await act(async () => {pages()[3].click();});                    // 1 → 4
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    await act(async () => {pages()[2].click();});                    // 4 → 3
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    expect(document.querySelector('.ch.undo b').textContent).toBe('Вернуться на страницу 1');
  });

  it('вернулся в поиск после перехода — запрос на месте, клавиатура не лезет', async () => {
    await boot({id: 'toc', arg: 'search'});
    await ask('колючкин');
    await waitFor(() => expect(document.querySelector('.snip')).not.toBeNull());
    await act(async () => {document.querySelector('.snip').closest('.ch').click();});
    expect(here()).toBe('feed');
    await act(async () => {document.querySelectorAll('.tabbar span')[1].click();});
    expect(here()).toBe('toc');
    expect(input().value).toBe('колючкин');
    expect(document.activeElement).not.toBe(input());
    await waitFor(() => expect(document.querySelectorAll('.snip')).toHaveLength(1));
  });

  it('до первого перехода строки нет', async () => {
    await boot({id: 'toc', arg: 'pages'});
    expect(document.querySelector('.ch.undo')).toBeNull();
  });
});

describe('список страниц большой книги', () => {
  // Раньше рисовались все страницы разом: у романа их под две тысячи, и вход
  // в оглавление стоил секунду на компьютере. Теперь — окно вокруг текущей.
  it('рисует окно вокруг текущей страницы, а не все страницы', async () => {
    const big = 'Слово за словом, строка за строкой. '.repeat(25000);   // ~500 страниц
    const at = 1800 * 300;                                            // страница 301
    await Promise.all([
      saveText('b1', big),
      saveMeta({
        books: [{id: 'b1', title: 'Книга', len: big.length, toc: 1}],
        cur: 'b1', at: {b1: at}, last: 'feed', intro: 1, place: {id: 'toc', arg: 'pages'}
      })
    ]);
    render(<App />, {wrapper});
    await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
    await act(async () => {});
    const rows = document.querySelectorAll('#toc .body .ch');
    expect(rows.length).toBeLessThanOrEqual(90);
    expect(document.querySelector('.ch.on b').firstChild.textContent).toBe('Страница 301');
    // Место остальных строк держат распорки: список прокручивается на всю книгу.
    const [top, bottom] = [...document.querySelectorAll('#toc .body > div:not(.ch)')];
    expect(parseInt(top.style.height, 10)).toBeGreaterThan(0);
    expect(parseInt(bottom.style.height, 10)).toBeGreaterThan(0);
  });
});

describe('начало книги в главах', () => {
  // До первой главы — название, эпиграф, предисловие — во вкладке «Главы»
  // раньше не было помечено ничего.
  it('пока читаешь до первой главы, помечено «Начало книги»', async () => {
    const book = 'Предисловие автора.\n\nГлава 1\n\n' + 'Текст первой главы. '.repeat(50)
      + '\n\nГлава 2\n\n' + 'Текст второй главы. '.repeat(50);
    await Promise.all([
      saveText('b1', book),
      saveMeta({
        books: [{id: 'b1', title: 'Книга', len: book.length, toc: 0}],
        cur: 'b1', at: {b1: 0}, last: 'feed', intro: 1, place: {id: 'toc', arg: null}
      })
    ]);
    render(<App />, {wrapper});
    await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
    await act(async () => {});
    const on = document.querySelector('#toc .body .ch.on b');
    expect(on.textContent).toBe(DICT.ru['toc.start']);
  });
});
