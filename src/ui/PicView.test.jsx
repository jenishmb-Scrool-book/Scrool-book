import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import App from '../App.jsx';
import {StoreProvider} from '../store.jsx';
import {saveMeta, savePic, savePix, saveText} from '../lib/storage.js';

// Картинка во весь экран: от нажатия по иллюстрации до её закрытия.
//
// Проверяется на живом App, а не на одном компоненте, потому что ломается это
// не внутри него. Просмотр лежит поверх экрана, открывает его карточка внутри
// ленты, а закрывает в том числе аппаратная «назад» — и ровно эта связка
// расходится молча: компонент останется рабочим, а кнопка «назад» будет
// выбрасывать из приложения прямо поверх открытой картинки.

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(40);
const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const PIC = {w: 800, h: 1200};

// Аппаратная «назад» приходит из нативного слоя, которого в браузере нет.
// Подменяем его и запоминаем обработчик — чтобы дёрнуть его самим.
const NAT = vi.hoisted(() => ({onBack: null}));
vi.mock('../native.js', async orig => ({
  ...(await orig()),
  initNative: async ({onBack} = {}) => {NAT.onBack = onBack;}
}));

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;

/** Книга с одной картинкой, открытая сразу на ленте. */
async function seed() {
  await saveText('b1', TEXT);
  await savePic('b1', 0, SRC);
  await savePix('b1', [{at: 0, k: 0, ...PIC}]);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1, pics: 1}],
    cur: 'b1', at: {b1: 0}, last: 'feed', place: {id: 'feed', arg: null}, intro: 1
  });
}

const frame = () => document.querySelector('.bpic');
const shot = () => document.querySelector('.shot');
const click = el => act(async () => {el.click();});

// Ждём именно `<img>`, а не рамку: рамка появляется сразу, а картинка к ней
// приезжает из хранилища, и до этого нажимать не на что — открывать нечего.
async function boot() {
  const r = render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.bpic img')).not.toBeNull());
  return r;
}

beforeEach(() => {
  localStorage.clear();
  NAT.onBack = null;
});

describe('рамка картинки', () => {
  // Пропорции — то, ради чего размер вообще читается из файла: без них у рамки
  // была бы высота из стилей, и разворот показывался бы полоской.
  it('берёт пропорции из размера картинки', async () => {
    await seed();
    await boot();
    expect(frame().style.getPropertyValue('--arw')).toBe('800');
    expect(frame().style.getPropertyValue('--arh')).toBe('1200');
  });

  it('у книги без размеров пропорций не объявляет — останутся запасные', async () => {
    await saveText('b1', TEXT);
    await savePic('b1', 0, SRC);
    await savePix('b1', [{at: 0, k: 0}]);                 // запись старого образца
    await saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1, pics: 1}],
      cur: 'b1', at: {b1: 0}, last: 'feed', place: {id: 'feed', arg: null}, intro: 1
    });
    await boot();
    expect(frame().style.getPropertyValue('--arw')).toBe('');
  });
});

describe('открытие и закрытие', () => {
  it('нажатие по картинке показывает её во весь экран', async () => {
    await seed();
    await boot();
    expect(shot()).toBeNull();

    await click(frame());
    expect(shot()).not.toBeNull();
    expect(shot().querySelector('img').getAttribute('src')).toBe(SRC);
  });

  it('крестик закрывает', async () => {
    await seed();
    await boot();
    await click(frame());
    await click(shot().querySelector('.sx'));
    expect(shot()).toBeNull();
  });

  it('нажатие мимо картинки закрывает', async () => {
    await seed();
    await boot();
    await click(frame());
    await click(shot());
    expect(shot()).toBeNull();
  });

  // Ровно то, из-за чего просмотр живёт в App, а не в карточке: пока картинка
  // открыта, «назад» закрывает её, а не выходит из приложения.
  it('аппаратная «назад» закрывает картинку, а из приложения не выходит', async () => {
    await seed();
    await boot();
    await click(frame());

    let out;
    await act(async () => {out = NAT.onBack();});
    expect(out).toBe(true);
    expect(shot()).toBeNull();
    // И экран под ней остался тем же — «назад» потратилась на картинку.
    expect(document.querySelector('.screen').id).toBe('feed');
  });
});

// Превью в строке списка и кадр под роликом живут в ЧУЖОЙ рамке: там нажатие
// открывает сам разговор и сам ролик. Перехвати его просмотр — и до текста
// стало бы не добраться.
describe('чужие рамки', () => {
  it('превью в списке переписок открывает разговор, а не картинку', async () => {
    await saveText('b1', TEXT);
    await savePic('b1', 0, SRC);
    await savePix('b1', [{at: 0, k: 0, ...PIC}]);
    await saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1, pics: 1}],
      cur: 'b1', at: {b1: 0}, last: 'chats', place: {id: 'chats', arg: null}, intro: 1
    });
    const r = render(<App />, {wrapper});
    const thumb = await waitFor(() => {
      const el = document.querySelector('.bpic.thumb img');
      expect(el).not.toBeNull();
      return el;
    });

    await click(thumb);
    expect(shot()).toBeNull();
    expect(document.querySelector('.screen').id).toBe('chat');
    r.unmount();
  });
});

describe('увеличение', () => {
  it('нажатие по самой картинке увеличивает, а не закрывает', async () => {
    await seed();
    await boot();
    await click(frame());

    await click(shot().querySelector('img'));
    expect(shot()).not.toBeNull();
    expect(document.querySelector('.sbox').className).toContain('zoom');

    await click(shot().querySelector('img'));
    expect(document.querySelector('.sbox').className).not.toContain('zoom');
  });
});
