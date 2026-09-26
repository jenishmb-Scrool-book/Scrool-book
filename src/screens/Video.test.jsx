import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import {Player} from './Video.jsx';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {chunk, indexAt} from '../lib/chunk.js';
import {SIZE} from '../ui/sizes.js';

// Плеер: курсор едет за комментариями — они и есть продолжение книги. Но
// только вперёд, как везде: вернулся ко второму комментарию перечитать — место
// остаётся там, докуда дочитал. Назад его переносит только оглавление.
//
// jsdom ничего не размещает, поэтому раскладку комментариев задаём сами:
// комментарий номер k стоит на 1000 + 200·k пикселей от верха.
Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
  configurable: true,
  get() {
    if (!this.classList.contains('cmt')) return 0;
    const all = [...this.parentElement.querySelectorAll('.cmt')];
    return 1000 + all.indexOf(this) * 200;
  }
});

// Абзацы разные: на одинаковых «описание не повторяет название» не проверить.
const TEXT = Array.from({length: 80}, (_, i) =>
  'Абзац ' + i + '. Вышел зайчик погулять в ' + i + '-й раз, и было это давно.').join('\n\n');
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Место чтения прямо из стора, а не из хранилища: запись в хранилище идёт с
// дебаунсом 400 мс, и под параллельным прогоном тест ждал бы таймеры, а не
// проверял плеер.
let now = 0;
function Probe() {
  now = useStore().offset;
  return null;
}

function Gate({children}) {
  const {ready} = useStore();
  return ready ? children : null;
}

async function boot() {
  await saveText('b1', TEXT);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
    cur: 'b1', at: {b1: 0}, last: 'video', intro: 1, place: {id: 'player', arg: null}
  });
  render(<StoreProvider><Gate><Player go={() => {}} back={() => {}} /><Probe /></Gate></StoreProvider>);
  await waitFor(() => expect(document.querySelectorAll('.cmt').length).toBeGreaterThan(4));
  // Комментарии нарисованы — но обработчик прокрутки плеер вешает эффектом,
  // после отрисовки, и под нагрузкой тест успевал прокрутить раньше него.
  await act(async () => {});
  return document.querySelector('#player .body');
}

const scroll = (box, top) => act(async () => {
  box.scrollTop = top;
  box.dispatchEvent(new Event('scroll'));
  await sleep(200);
});

beforeEach(() => localStorage.clear());

describe('плеер', () => {
  it('прокрутка вниз по комментариям двигает курсор, вверх — нет', {timeout: 20000}, async () => {
    const box = await boot();
    const at = [...document.querySelectorAll('.cmt')].map(el => Number(el.dataset.at));
    await scroll(box, 1000 + 4 * 200);                   // пятый комментарий у кромки
    // Запас по времени: под параллельным прогоном таймеры дебаунсов опаздывают.
    await waitFor(() => expect(now).toBe(at[4]), {timeout: 10000});
    await scroll(box, 1000 + 1 * 200);                   // вернулись ко второму
    await sleep(600);
    expect(now).toBe(at[4]);                             // место осталось на пятом
  });
});

describe('ролик', () => {
  // Одна фраза читалась трижды: названием в списке, заголовком плеера и
  // началом описания. Теперь заголовок — то самое название, а описание — с
  // конца названия.
  it('заголовок — название из списка, описание его не повторяет', async () => {
    await boot();
    const titles = chunk(TEXT, SIZE.vlist);
    const first = titles[indexAt(titles, 0)];
    expect(document.querySelector('.vinfo h3').textContent).toBe(first.text);
    const desc = document.querySelector('.dtxt').textContent;
    expect(desc.length).toBeGreaterThan(100);
    expect(desc.startsWith(first.text)).toBe(false);
    expect(TEXT.replace(/\s+/g, ' ')).toContain(first.text + ' ' + desc.slice(0, 40));
  });

  // Большая ▶ сперва ведёт к непрочитанным комментариям, а не листает мимо.
  it('▶ сначала прокручивает к непрочитанному комментарию', async () => {
    const box = await boot();
    const asked = [];
    box.scrollTo = o => asked.push(o);
    const desc = document.querySelector('.dtxt').textContent;
    await act(async () => {document.querySelector('#player .pl').click();});
    expect(asked).toHaveLength(1);
    expect(document.querySelector('.dtxt').textContent).toBe(desc);   // страница та же
    expect(now).toBe(0);                                               // курсор на месте
  });

  it('▶, когда все комментарии прочитаны, — следующая страница', {timeout: 20000}, async () => {
    const box = await boot();
    box.scrollTo = () => {};
    const at = [...document.querySelectorAll('.cmt')].map(el => Number(el.dataset.at));
    await scroll(box, 1000 + (at.length - 1) * 200);
    await waitFor(() => expect(now).toBe(at[at.length - 1]), {timeout: 10000});
    const desc = document.querySelector('.dtxt').textContent;
    await act(async () => {document.querySelector('#player .pl').click();});
    expect(document.querySelector('.dtxt').textContent).not.toBe(desc);
  });
});

