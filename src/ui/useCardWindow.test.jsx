import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import Feed from '../screens/Feed.jsx';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {chunk} from '../lib/chunk.js';
import {SIZE} from './sizes.js';

// Место прокрутки: с какой карточки открывается экран и что он про неё пишет.
//
// Проверяется на живом экране, а не на хуке в вакууме, потому что вся механика
// держится на измерениях DOM. jsdom при этом ничего не размещает: offsetTop и
// clientHeight у любого узла — ноль, и замер, на котором стоит и курсор, и
// прокрутка, молча не сработал бы ни разу. Поэтому раскладку задаём сами:
// карточка ростом CARD, экран — VIEW. Дальше арифметика настоящая, включая
// поправку прокрутки при росте окна вверх.
const CARD = 100;
const VIEW = 500;
const iOf = el => (el.dataset && el.dataset.i != null ? Number(el.dataset.i) : null);

Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
  configurable: true,
  get() {
    const i = iOf(this);
    if (i == null || !this.parentElement) return 0;
    // Отсчёт от первой смонтированной карточки, а не от начала книги: окно
    // рендера начинается не с нуля, и в браузере верхняя карточка стоит в нуле.
    const first = this.parentElement.querySelector('[data-i]');
    return (i - Number(first.dataset.i)) * CARD;
  }
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {return iOf(this) == null ? 0 : CARD;}
});
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {return this.classList.contains('body') ? VIEW : CARD;}
});
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get() {return this.querySelectorAll('[data-i]').length * CARD;}
});

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(200);
const CH = chunk(TEXT, SIZE.feed);
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Экран показываем только после гидрации — так же, как это делает App. */
function Gate({children}) {
  const {ready} = useStore();
  return ready ? children : null;
}

/** Поднять «Ленту» на книге, где курсор стоит на карточке `cur`. */
async function boot(place, cur = 10) {
  await saveText('b1', TEXT);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
    cur: 'b1',
    at: {b1: CH[cur].at},
    last: 'feed',
    place: place || {id: 'feed', arg: null, at: null, y: 0}
  });
  render(
    <StoreProvider>
      <Gate><Feed go={() => {}} back={() => {}} /></Gate>
    </StoreProvider>
  );
  await waitFor(() => expect(document.querySelector('.post')).not.toBeNull());
  return document.querySelector('.body');
}

const first = () => Number(document.querySelector('.post').dataset.i);

/** Прокрутить и дождаться обоих дебаунсов: замера (120 мс) и записи (400 мс). */
const scroll = (box, top) => act(async () => {
  box.scrollTop = top;
  box.dispatchEvent(new Event('scroll'));
  await sleep(600);
});

/** Свернуть приложение, ничего не дожидаясь. */
const hide = () => act(async () => {
  Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
  document.dispatchEvent(new Event('visibilitychange'));
});

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
});

describe('место прокрутки', () => {
  it('без записи экран открывается на курсоре', async () => {
    const box = await boot(null);
    expect(first()).toBe(9);              // окно начинается на ahead=1 раньше
    expect(box.scrollTop).toBe(CARD);     // и стоит ровно на карточке курсора
  });

  // Главное различие: курсор показывает, докуда прочитано, а запись — что было
  // на экране. Совпадают они всегда, кроме одного случая: человек листал назад
  // и там же и вышел. Тогда вернуть его надо туда, где он стоял.
  it('открывается там, куда смотрели, а не там, где курсор', async () => {
    const box = await boot({id: 'feed', arg: null, at: CH[3].at, y: 37});
    expect(first()).toBe(2);
    expect(box.scrollTop).toBe(CARD + 37);
    // И кнопка возврата на месте: без неё восстановлена только половина места.
    expect(document.querySelector('.resume')).not.toBeNull();
  });

  // Запись могла быть снята с другого кегля или другого экрана.
  it('сдвиг больше карточки подрезается по ней', async () => {
    const box = await boot({id: 'feed', arg: null, at: CH[3].at, y: 5000});
    expect(box.scrollTop).toBe(CARD + CARD);
  });

  it('прокрутка записывает карточку и сдвиг внутри неё', async () => {
    const box = await boot(null);
    await scroll(box, 740);
    // Верхняя видимая — та, чей низ ушёл за кромку: 700..800 при прокрутке 740.
    expect(rawMeta().place).toEqual({id: 'feed', arg: null, at: CH[16].at, y: 40});
  });

  // Ради этого замер и вынесен из обработчика. Дебаунс здесь всегда отложен:
  // пока лента едет по инерции, он перезапускается на каждом событии, и на
  // телефоне «последние сто миллисекунд» — это последний экран книги.
  it('сворачивание пишет место, не дожидаясь дебаунса', async () => {
    const box = await boot(null);
    await act(async () => {
      box.scrollTop = 1140;
      box.dispatchEvent(new Event('scroll'));
    });
    expect(rawMeta().place.at).toBe(null);          // замер ещё не сработал

    await hide();
    expect(rawMeta().place).toEqual({id: 'feed', arg: null, at: CH[20].at, y: 40});
    expect(rawMeta().at.b1).toBe(CH[20].at);        // и курсор доехал вместе с ним
  });

  it('листание назад курсор не двигает, а место прокрутки — двигает', async () => {
    const box = await boot(null);
    await scroll(box, 740);
    await scroll(box, 540);
    expect(rawMeta().at.b1).toBe(CH[16].at);        // курсор остался впереди
    expect(rawMeta().place.at).toBe(CH[14].at);     // а взгляд ушёл назад
    expect(document.querySelector('.resume')).not.toBeNull();
  });
});
