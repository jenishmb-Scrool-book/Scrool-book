import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import {Player} from './Video.jsx';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';

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

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(80);
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  render(<StoreProvider><Gate><Player go={() => {}} back={() => {}} /></Gate></StoreProvider>);
  await waitFor(() => expect(document.querySelectorAll('.cmt').length).toBeGreaterThan(4));
  return document.querySelector('#player .body');
}

const scroll = (box, top) => act(async () => {
  box.scrollTop = top;
  box.dispatchEvent(new Event('scroll'));
  await sleep(200);
});

beforeEach(() => localStorage.clear());

describe('плеер', () => {
  it('прокрутка вниз по комментариям двигает курсор, вверх — нет', async () => {
    const box = await boot();
    const at = [...document.querySelectorAll('.cmt')].map(el => Number(el.dataset.at));
    await scroll(box, 1000 + 4 * 200);                   // пятый комментарий у кромки
    await waitFor(() => expect(rawMeta().at.b1).toBe(at[4]));
    await scroll(box, 1000 + 1 * 200);                   // вернулись ко второму
    await sleep(600);
    expect(rawMeta().at.b1).toBe(at[4]);                 // место осталось на пятом
  });
});
