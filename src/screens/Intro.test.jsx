import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import App from '../App.jsx';
import {StoreProvider} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {DICT} from '../i18n.js';

// Вступление первого запуска.
//
// Проверяется через App целиком, а не отдельным компонентом, потому что
// ломается здесь не разметка. Ломается порядок: язык выбирается ДО объяснения,
// объяснение показывается ДО домашнего экрана, а первая книга кладётся ПОСЛЕ
// выбора языка — и любая пара, переставленная местами, выглядит как рабочее
// приложение ровно до того момента, когда его открывает англоязычный человек.

const NAT = vi.hoisted(() => ({onBack: null}));
vi.mock('../native.js', async orig => ({
  ...(await orig()),
  initNative: async ({onBack} = {}) => {NAT.onBack = onBack;}
}));

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const here = () => {
  const el = document.querySelector('.screen');
  return el ? el.id : null;
};
const shown = () => document.getElementById('phone').textContent;

async function boot() {
  const r = render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
  return r;
}

/** Нажать кнопку выбора языка. */
async function lang(want) {
  const btn = [...document.querySelectorAll('.ilang button')].find(b => b.textContent === want);
  expect(btn).toBeTruthy();
  await act(async () => {btn.click();});
}

/** Нажать кнопку внизу справа: «Далее» или «Начать читать». */
async function go() {
  await act(async () => {document.querySelector('.igo').click();});
}

/** Нажать «Пропустить». */
async function skip() {
  await act(async () => {document.querySelector('.iskip').click();});
}

/** Дождаться первой книги: она пишется асинхронно и уже после вступления. */
const firstBook = () =>
  waitFor(() => expect((rawMeta() || {books: []}).books).toHaveLength(1));

beforeEach(() => localStorage.clear());

describe('вступление', () => {
  it('первый запуск начинается с выбора языка', async () => {
    await boot();
    expect(here()).toBe('intro');
    expect([...document.querySelectorAll('.ilang button')].map(b => b.textContent))
      .toEqual(['Русский', 'English']);
  });

  // Шаг выбора языка — единственный экран приложения без словаря: показывается
  // он до того, как язык выбран, и написан поэтому на обоих сразу.
  it('на шаге языка приложение говорит на обоих языках', async () => {
    await boot();
    expect(document.querySelector('.ipick').textContent).toBe('Язык · Language');
    expect(shown()).toContain('Книга, которая листается как лента');
    expect(shown()).toContain('A book you scroll like a feed');
  });

  it('выбранный язык сразу переводит объяснение', async () => {
    await boot();
    await lang('English');
    expect(shown()).toContain(DICT.en['intro.t1']);
    expect(shown()).not.toContain(DICT.ru['intro.t1']);
  });

  it('по-русски объяснение остаётся русским', async () => {
    await boot();
    await lang('Русский');
    expect(shown()).toContain(DICT.ru['intro.t1']);
  });

  // Три карточки, и последняя заканчивается кнопкой «Начать читать», а не
  // четвёртой такой же: короткий разговор обещан точками внизу, и обещание
  // это должно быть правдой.
  it('три карточки, потом дом', async () => {
    await boot();
    await lang('Русский');
    expect(document.querySelectorAll('.idots i')).toHaveLength(3);

    await go();
    expect(shown()).toContain(DICT.ru['intro.t2']);
    await go();
    expect(shown()).toContain(DICT.ru['intro.t3']);
    expect(document.querySelector('.igo').textContent).toBe(DICT.ru['intro.start']);

    await go();
    expect(here()).toBe('home');
  });

  it('«Пропустить» заканчивает вступление сразу', async () => {
    await boot();
    await lang('Русский');
    await skip();
    expect(here()).toBe('home');
  });

  // На последней карточке пропускать уже нечего, и две кнопки «дальше» рядом
  // читались бы как выбор, которого нет.
  it('на последней карточке «Пропустить» не показывается', async () => {
    await boot();
    await lang('Русский');
    await go();
    await go();
    expect(document.querySelector('.iskip')).toBeNull();
  });

  it('второй запуск вступления не показывает', async () => {
    const first = await boot();
    await lang('Русский');
    await skip();
    await firstBook();
    expect(rawMeta().intro).toBe(1);
    first.unmount();

    await boot();
    expect(here()).toBe('home');
  });

  // Отметка пишется НЕ дебаунсом: между ней и записью первой книги приложение
  // вполне может умереть, и тогда человек увидел бы вступление второй раз.
  it('отметка ложится в хранилище сразу, не дожидаясь дебаунса', async () => {
    await boot();
    await lang('Русский');
    await skip();
    await waitFor(() => expect(rawMeta().intro).toBe(1));
    await firstBook();
  });

  // Обновление — не первый запуск. У того, кто уже читает, поля в мете нет,
  // и объяснять ему, что такое клипы, поздно и незачем.
  it('у того, у кого книги уже есть, вступления нет', async () => {
    await saveText('b1', 'Раз, два, три, четыре, пять. '.repeat(40));
    await saveMeta({
      books: [{id: 'b1', title: 'Книга', len: 1160, toc: 1}],
      cur: 'b1', at: {b1: 0}, last: 'reels', place: null
    });
    await boot();
    expect(here()).toBe('home');
  });
});

describe('первая книга', () => {
  it('заводится на выбранном языке', async () => {
    await boot();
    await lang('English');
    await skip();
    await firstBook();
    expect(rawMeta().books[0].title).toBe('How it works');
  });

  it('по-русски — русская', async () => {
    await boot();
    await lang('Русский');
    await skip();
    await firstBook();
    expect(rawMeta().books[0].title).toBe('Как это работает');
  });

  // Язык выбирают один раз и в самом начале — значит, он обязан пережить и
  // вступление, и перезапуск: спросить и не запомнить хуже, чем не спрашивать.
  it('выбранный язык остаётся языком приложения', async () => {
    await boot();
    await lang('English');
    await skip();
    await firstBook();
    expect(rawMeta().ui.lang).toBe('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });
});

// Аппаратная «назад» во вступлении. Экран Android, с которого нельзя уйти
// назад, — это сломанный экран, и видно это на первом же запуске.
describe('«назад» во вступлении', () => {
  it('возвращает на предыдущий шаг', async () => {
    await boot();
    await lang('Русский');
    await go();
    expect(shown()).toContain(DICT.ru['intro.t2']);

    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(shown()).toContain(DICT.ru['intro.t1']);

    // И до самого выбора языка: передумать в нём тоже можно.
    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(document.querySelector('.ilang')).toBeTruthy();
  });

  it('на выборе языка сворачивает приложение', async () => {
    await boot();
    expect(await NAT.onBack()).toBe(false);
  });
});
