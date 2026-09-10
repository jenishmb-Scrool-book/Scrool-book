import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import App from './App.jsx';
import {StoreProvider} from './store.jsx';
import {saveMeta, saveText} from './lib/storage.js';
import {DICT} from './i18n.js';

// Возврат на то место, где закрыли приложение.
//
// Проверяется здесь, а не в сторе, потому что ломается это не в хранилище.
// Место хранится одним значением, а восстанавливают его два эффекта подряд:
// первый читает прошлое, второй запоминает настоящее. Перепутай их порядок — и
// первый же кадр с домашним экраном затрёт то, что мы собирались прочитать,
// причём молча: тесты стора останутся зелёными, а приложение всегда будет
// открываться на доме.

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(40);

// Аппаратная «назад» приходит из нативного слоя, а он в браузере не
// выполняется вовсе. Подменяем его целиком, кроме одного: запоминаем
// обработчик, который на телефоне дёргает система, — чтобы дёрнуть его самим.
const NAT = vi.hoisted(() => ({onBack: null}));
vi.mock('./native.js', async orig => ({
  ...(await orig()),
  initNative: async ({onBack} = {}) => {NAT.onBack = onBack;}
}));

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const here = () => {
  const el = document.querySelector('.screen');
  return el ? el.id : null;
};

/** Поднять приложение и дождаться конца гидрации (экран загрузки ушёл). */
async function boot() {
  const r = render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
  return r;
}

/**
 * Пройти вступление первого запуска: выбрать язык и пролистать карточки.
 * Само вступление проверяется в screens/Intro.test.jsx — здесь оно просто
 * стоит на дороге к дому, как и на настоящем первом запуске.
 */
async function pass(lang = 'ru') {
  const want = lang === 'en' ? 'English' : 'Русский';
  const btn = [...document.querySelectorAll('.ilang button')].find(b => b.textContent === want);
  await act(async () => {btn.click();});
  // Кнопка внизу справа ведёт по карточкам, последняя заканчивает вступление.
  for (let i = 0; i < 8 && document.querySelector('.igo'); i++) {
    await act(async () => {document.querySelector('.igo').click();});
  }
  // Первая книга кладётся после вступления и кладётся асинхронно. Дождаться её
  // здесь обязательно: незавершённая запись доживает до следующего теста и
  // приезжает в чужое хранилище посреди его гидрации.
  await waitFor(() => expect((rawMeta() || {books: []}).books).toHaveLength(1));
}

/** Положить в хранилище книгу и место, как после прошлого запуска. */
const seed = (place, ui) =>
  Promise.all([
    saveText('b1', TEXT),
    saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1',
      at: {b1: 0},
      last: 'reels',
      ui: ui || undefined,
      place
    })
  ]);

beforeEach(() => localStorage.clear());

describe('место при перезапуске', () => {
  // Пустое хранилище — это первый запуск, а он начинается со вступления.
  // Дом за ним: возвращаться после него некуда, места ещё нет.
  it('без записи открывается дом — после вступления', async () => {
    await boot();
    expect(here()).toBe('intro');
    await pass();
    expect(here()).toBe('home');
  });

  it('возвращает на тот экран, где закрыли', async () => {
    await seed({id: 'feed', arg: null});
    await boot();
    expect(here()).toBe('feed');
  });

  // Параметр — часть места, а не украшение: без него «переписка» открылась бы,
  // но с другим собеседником, а мессенджер — не на той вкладке.
  it('возвращает и параметр экрана', async () => {
    // Панель вкладок есть только у «зелёного» мессенджера — этим он и отличается.
    await seed({id: 'chats', arg: 'groups'}, {skin: 'wa'});
    await boot();
    expect(here()).toBe('chats');
    expect(document.querySelector('.tabbar span.on').getAttribute('aria-label'))
      .toBe(DICT.ru['chats.tab_groups']);
  });

  // Книгу могли удалить, пока приложения не было. Экран чтения без текста —
  // это пустой экран, и `go` для таких случаев уводит в библиотеку; на старте
  // это было бы хуже дома: человек не просил ничего открывать.
  it('без книги остаётся дома, а не уходит в чтение', async () => {
    // `intro: 1` — приложением уже пользовались: книгу удалили, а не не завели.
    await saveMeta({books: [], cur: null, at: {}, last: 'reels',
                    place: {id: 'reels', arg: null}, intro: 1});
    await boot();
    expect(here()).toBe('home');
  });

  // Запись могла остаться от версии, где такой экран был.
  it('неизвестный экран не открывается', async () => {
    await seed({id: 'кино', arg: null});
    await boot();
    expect(here()).toBe('home');
  });

  it('запоминает переход и не затирает его домом', async () => {
    await seed(null);
    const {container} = await boot();
    expect(here()).toBe('home');

    // «Продолжить» на домашнем экране уводит в последнюю читалку.
    await act(async () => {container.querySelector('.widget button').click();});
    expect(here()).toBe('reels');
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'reels', arg: null, at: null, y: 0}));
  });

  // Полный круг: закрыли в чтении — открылись в чтении.
  it('переживает перезапуск целиком', async () => {
    await seed(null);
    const first = await boot();
    await act(async () => {first.container.querySelector('.widget button').click();});
    await waitFor(() => expect(rawMeta().place.id).toBe('reels'));
    first.unmount();

    await boot();
    expect(here()).toBe('reels');
  });

  // Дом — такой же ответ на вопрос «где я был», как остальные. Вышел на дом —
  // вернулся на дом, а не в ту читалку, где был до него.
  it('дом тоже запоминается', async () => {
    await seed({id: 'chats', arg: null});
    const {container} = await boot();
    expect(here()).toBe('chats');

    // Восстановленный экран пришёл без истории, поэтому «‹» ведёт на дом.
    await act(async () => {container.querySelector('.mhdr .back').click();});
    expect(here()).toBe('home');
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'home', arg: null, at: null, y: 0}));
  });
});

// Аппаратная «назад» на телефоне.
//
// Сломать её можно в двух местах: в самом обработчике и в проводе до него.
// Провод здесь и проверяется — что App отдаёт нативному слою работающий
// обработчик и что тот ходит по истории переходов, а не по таблице «откуда
// куда». Сам нативный слой проверяет native.test.js.
describe('аппаратная «назад»', () => {
  it('возвращает на предыдущий экран', async () => {
    await seed(null);
    await boot();
    await act(async () => {document.querySelector('.grid .icon').click();});
    expect(here()).not.toBe('home');

    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(here()).toBe('home');
  });

  // Единственный случай, когда «назад» отдаёт false: дальше некуда, и Android
  // должен свернуть приложение сам.
  it('на доме сворачивает приложение', async () => {
    await seed(null);
    await boot();
    expect(here()).toBe('home');
    expect(await NAT.onBack()).toBe(false);
  });

  // Экран восстановлен после перезапуска — истории переходов нет вообще.
  // Выходить из приложения в этом месте нельзя: человек пришёл на него сам.
  it('с восстановленного экрана ведёт на дом', async () => {
    await seed({id: 'feed', arg: null});
    await boot();
    expect(here()).toBe('feed');

    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(here()).toBe('home');
  });
});
