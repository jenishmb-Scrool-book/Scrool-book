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
// Экран высотой 500, а вся страница — до последнего комментария и ещё 300
// под ним (карточка «Следующее»): иначе jsdom отдаёт нули, и страница всегда
// «докручена до низа».
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {return this.classList.contains('body') ? 500 : 0;}
});
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get() {
    if (!this.classList.contains('body')) return 0;
    return 1000 + this.querySelectorAll('.cmt').length * 200 + 300;
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

async function boot(at = 0, arg = null) {
  await saveText('b1', TEXT);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
    cur: 'b1', at: {b1: at}, last: 'video', intro: 1, place: {id: 'player', arg: null}
  });
  render(<StoreProvider><Gate><Player go={() => {}} back={() => {}} arg={arg} /><Probe /></Gate></StoreProvider>);
  // Заголовок есть у любого ролика, комментариев на последнем может не быть.
  await waitFor(() => expect(document.querySelector('.vinfo h3')).not.toBeNull());
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

describe('▶ внизу страницы', () => {
  // ▶ целилась в комментарий, который до верха экрана не доезжает никогда, и
  // застревала. Докрученная до низа страница прочитана вся — ▶ ведёт дальше.
  it('с самого низа ▶ открывает следующий ролик', async () => {
    const box = await boot();
    box.scrollTo = () => {};
    const desc = document.querySelector('.dtxt').textContent;
    box.scrollTop = box.scrollHeight - box.clientHeight;
    await act(async () => {document.querySelector('#player .pl').click();});
    expect(document.querySelector('.dtxt').textContent).not.toBe(desc);
  });

  it('▶ прокручивает ровно туда, где комментарий уже засчитан', async () => {
    const box = await boot();
    const asked = [];
    box.scrollTo = o => {asked.push(o); box.scrollTop = o.top; box.dispatchEvent(new Event('scroll'));};
    const at = [...document.querySelectorAll('.cmt')].map(el => Number(el.dataset.at));
    await act(async () => {document.querySelector('#player .pl').click();});
    await waitFor(() => expect(now).toBe(at[0]), {timeout: 10000});
    await act(async () => {document.querySelector('#player .pl').click();});
    await waitFor(() => expect(now).toBe(at[1]), {timeout: 10000});
    expect(asked).toHaveLength(2);
  });
});

describe('«Следующее»', () => {
  // Карточка «Следующее» обещала одно название, а открывался ролик с другим —
  // с последним, уже прочитанным комментарием в заголовке.
  it('название карточки — заголовок того ролика, что откроется', async () => {
    await boot();
    const promised = document.querySelector('.upnext + .vid .ti').textContent;
    await act(async () => {document.querySelector('.upnext + .vid').click();});
    expect(document.querySelector('.vinfo h3').textContent).toBe(promised);
    expect(promised.length).toBeGreaterThan(0);
  });
});

describe('конец книги в плеере', () => {
  // На последнем ролике описания нет — и комментариями раньше становилось
  // НАЧАЛО книги, а ▶ уносила туда место чтения, стирая «дочитано».
  const lastTitle = () => {
    const ts = chunk(TEXT, SIZE.vlist);
    return ts[ts.length - 1];
  };

  it('последний ролик: ни комментариев из начала книги, ни «Следующего»', async () => {
    await boot(lastTitle().at);
    expect(document.querySelector('.vinfo h3').textContent).toBe(lastTitle().text);
    const firstAt = chunk(TEXT, SIZE.comment)[0].at;
    for (const el of document.querySelectorAll('.cmt')) expect(Number(el.dataset.at)).toBeGreaterThan(firstAt);
    expect(document.querySelector('.upnext')).toBeNull();
  });

  it('▶ на последнем ролике — «дочитано», а не начало книги', async () => {
    const box = await boot(lastTitle().at);
    box.scrollTo = () => {};
    await act(async () => {document.querySelector('#player .pl').click();});
    expect(now).toBe(TEXT.length - 1);
    expect(document.querySelector('.vinfo h3').textContent).toBe(lastTitle().text);
  });
});

describe('страница ролика без пропусков', () => {
  // Кусок комментариев, перекрывавший конец описания, пропускался целиком:
  // одно-два предложения не показывались нигде.
  it('название, описание и комментарии идут подряд, как в книге', async () => {
    // Длинные абзацы из предложений разной длины: куски описания и
    // комментариев режутся по разным местам.
    const words = ['Первое предложение.', 'Второе чуть длиннее, с запятой.', 'Третье.',
      'Четвёртое предложение выходит заметно длиннее остальных, почти строка.'];
    const long = Array.from({length: 12}, (_, p) =>
      Array.from({length: 40}, (_, k) => words[(p + k) % 4].replace('.', ' ' + p + '-' + k + '.')).join(' ')
    ).join('\n\n');
    await saveText('b1', long);
    await saveMeta({books: [{id: 'b1', title: 'Книга', len: long.length, toc: 1}], cur: 'b1', at: {b1: 0},
      last: 'video', intro: 1});
    render(<StoreProvider><Gate><Player go={() => {}} back={() => {}} /><Probe /></Gate></StoreProvider>);
    await waitFor(() => expect(document.querySelectorAll('.cmt').length).toBeGreaterThan(0));
    const flat = s => s.replace(/\s+/g, ' ').trim();
    const shown = [document.querySelector('.vinfo h3').textContent, document.querySelector('.dtxt').textContent,
      ...[...document.querySelectorAll('.cmt .ct')].map(el => el.textContent)].join(' ');
    expect(flat(long).startsWith(flat(shown))).toBe(true);
  });
});

describe('ролик позади места', () => {
  // Перечитать прошлый ролик — не повод отматывать место чтения назад.
  it('открывается по параметру, а место и ▶ его не трогают', async () => {
    const at = chunk(TEXT, SIZE.vlist)[1].at;
    const box = await boot(TEXT.length - 1, at);
    box.scrollTo = () => {};
    expect(document.querySelector('.vinfo h3').textContent).toBe(chunk(TEXT, SIZE.vlist)[1].text);
    expect(now).toBe(TEXT.length - 1);
    box.scrollTop = box.scrollHeight - box.clientHeight;
    await act(async () => {document.querySelector('#player .pl').click();});
    expect(now).toBe(TEXT.length - 1);
  });
});

