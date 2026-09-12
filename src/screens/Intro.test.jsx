import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import App from '../App.jsx';
import {StoreProvider} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {WALLS, clearWallpaper, getWallpaper} from '../wallpaper.js';
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

  // Три карточки, потом обои, и только тогда дом. Точек внизу ровно столько
  // же, сколько шагов: короткий разговор обещан ими, и обещание это должно
  // быть правдой.
  it('три карточки, обои, потом дом', async () => {
    await boot();
    await lang('Русский');
    expect(document.querySelectorAll('.idots i')).toHaveLength(4);

    await go();
    expect(shown()).toContain(DICT.ru['intro.t2']);
    await go();
    expect(shown()).toContain(DICT.ru['intro.t3']);
    await go();
    expect(shown()).toContain(DICT.ru['intro.t4']);
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

  // На шаге обоев пропускать нечего: не нажать ни по одному снимку — это и
  // есть отказ, а вторая кнопка с тем же исходом заставляла бы выбирать между
  // «ничего» и «ничего».
  it('на шаге обоев «Пропустить» не показывается', async () => {
    await boot();
    await lang('Русский');
    await go();
    await go();
    expect(document.querySelector('.iskip')).not.toBeNull();
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

// Шаг обоев.
//
// Проверяется отсюда же, через App, и по той же причине: ломается здесь не
// разметка, а то, доезжает ли выбор до экрана, ради которого он делался.
// Обои лежат под своим ключом мимо меты, и между «записали» и «видно на доме»
// стоят ещё и кеш модуля, и эффект домашнего экрана.
describe('обои на первом запуске', () => {
  const tiles = () => [...document.querySelectorAll('.walls button')];
  const wallOf = () => {
    const el = document.querySelector('#home .wall');
    return el ? el.style.backgroundImage : '';
  };

  /** Пройти язык и три карточки — оказаться на шаге обоев. */
  async function toWalls() {
    await boot();
    await lang('Русский');
    await go();
    await go();
    await go();
  }

  // Кеш обоев живёт в модуле и localStorage.clear() его не трогает: без этого
  // снимок, выбранный одним тестом, оставался бы выбранным в следующем.
  beforeEach(async () => {await clearWallpaper();});

  it('двадцать готовых, и одни отмечены с самого начала', async () => {
    await toWalls();
    expect(shown()).toContain(DICT.ru['intro.t4']);
    expect(tiles()).toHaveLength(20);
    // Отмечено ровно одно: пустая решётка читалась бы как «выбери, иначе
    // обоев не будет», а обои по умолчанию стоят всегда.
    expect(document.querySelectorAll('.walls button.on')).toHaveLength(1);
  });

  it('выбранные обои доезжают до домашнего экрана', async () => {
    await toWalls();
    await act(async () => {tiles()[3].click();});
    expect(await getWallpaper()).toBe(WALLS[3]);

    await go();
    expect(here()).toBe('home');
    await waitFor(() => expect(wallOf()).toContain(WALLS[3]));
  });

  it('выбор сразу видно на самом шаге', async () => {
    await toWalls();
    await act(async () => {tiles()[7].click();});
    expect(tiles()[7].className).toContain('on');
    expect(document.querySelectorAll('.walls button.on')).toHaveLength(1);
  });

  it('никто ничего не выбрал — обои всё равно стоят', async () => {
    await toWalls();
    await go();
    expect(here()).toBe('home');
    await waitFor(() => expect(wallOf()).toContain('pics/tall/'));
  });
});
