import React from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import {StoreProvider, useStore} from './store.jsx';
import {saveMeta, saveText} from './lib/storage.js';

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Поднять стор и дождаться конца гидрации.
async function mount() {
  const h = renderHook(() => useStore(), {wrapper});
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}
const add = async (h, title, text) => {
  let id;
  await act(async () => {id = await h.result.current.addBook(title, text);});
  return id;
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('гидрация', () => {
  it('на пустом хранилище выставляет ready и пустое состояние', async () => {
    const {result} = await mount();
    expect(result.current.ready).toBe(true);
    expect(result.current.books).toEqual([]);
    expect(result.current.current).toBeNull();
    expect(result.current.text).toBe('');
    expect(result.current.offset).toBe(0);
    expect(result.current.lastApp).toBe('reels');
    expect(result.current.error).toBeNull();
  });

  it('восстанавливает книгу, её текст и смещение', async () => {
    const text = 'Раз. Два.\n\nТри абзац.';
    await saveText('b1', text);
    await saveMeta({books: [{id: 'b1', title: 'Книга', len: text.length}], cur: 'b1', at: {b1: 7}, last: 'feed'});

    const {result} = await mount();
    expect(result.current.text).toBe(text);
    expect(result.current.offset).toBe(7);
    expect(result.current.current).toMatchObject({id: 'b1', title: 'Книга'});
    expect(result.current.lastApp).toBe('feed');
  });

  it('смещение за концом текста подрезается по длине', async () => {
    const text = 'Короткий.';
    await saveText('b1', text);
    await saveMeta({books: [{id: 'b1', title: 'К', len: 999}], cur: 'b1', at: {b1: 900}, last: 'reels'});

    const {result} = await mount();
    expect(result.current.offset).toBe(text.length - 1);
    expect(result.current.current.len).toBe(text.length);   // длина пересчитана по факту
  });
});

describe('addBook', () => {
  it('кладёт книгу, запоминает её длину и делает текущей', async () => {
    const h = await mount();
    const text = 'Первый абзац.\n\nВторой абзац.';
    const id = await add(h, 'Тест', text);

    expect(typeof id).toBe('string');
    expect(h.result.current.books).toHaveLength(1);
    expect(h.result.current.current).toMatchObject({id, title: 'Тест', len: text.length});
    expect(h.result.current.text).toBe(text);
    expect(h.result.current.offset).toBe(0);
  });

  it('берёт заголовок из начала текста, если он не задан', async () => {
    const h = await mount();
    await add(h, '', 'Заголовка не дали.');
    expect(h.result.current.current.title).toBe('Заголовка не дали.');
  });

  it('текст кладёт отдельно от меты', async () => {
    const h = await mount();
    await add(h, 'Тест', 'ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ.');
    expect(localStorage.getItem('scroll.meta')).not.toContain('ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ');
  });

  it('двум книгам подряд выдаёт разные id', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'Текст А.');
    const b = await add(h, 'Б', 'Текст Б.');
    expect(a).not.toBe(b);
    expect(h.result.current.books).toHaveLength(2);
  });

  it('на пустом тексте выставляет error и не заводит книгу', async () => {
    const h = await mount();
    const id = await add(h, 'Пусто', '   \n  ');
    expect(id).toBeNull();
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.error).toBeTruthy();
  });

  // Хранилище кончилось — это сообщение пользователю, а не падение приложения.
  it('при переполнении хранилища выставляет error и не роняет приложение', async () => {
    const h = await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const id = await add(h, 'Толстая', 'Очень большой текст.');

    expect(id).toBeNull();
    expect(h.result.current.error).toMatch(/хранилищ/i);
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.ready).toBe(true);
    expect(h.result.current.text).toBe('');
  });
});

describe('setOffset', () => {
  const TEXT = 'Раз.\n\nДва.\n\nТри.';

  it('клампится в [0, длина - 1]', async () => {
    const h = await mount();
    await add(h, 'Тест', TEXT);

    act(() => h.result.current.setOffset(-5));
    expect(h.result.current.offset).toBe(0);
    act(() => h.result.current.setOffset(999));
    expect(h.result.current.offset).toBe(TEXT.length - 1);
    act(() => h.result.current.setOffset(6));
    expect(h.result.current.offset).toBe(6);
  });

  it('на пустой книге не ломается', async () => {
    const {result} = await mount();
    act(() => result.current.setOffset(5));
    expect(result.current.offset).toBe(0);
  });

  // Лента дёргает курсор десятки раз в секунду — писать хранилище на каждый кадр нельзя.
  it('пишется в хранилище с дебаунсом 400 мс, одной записью на серию', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', TEXT);

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {h.result.current.setOffset(6); h.result.current.setOffset(12);});
    expect(rawMeta().at[id]).toBe(0);            // сразу — в хранилище ещё старое
    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(rawMeta().at[id]).toBe(12));
    expect(spy.mock.calls.filter(c => c[0] === 'scroll.meta')).toHaveLength(1);
  });
});

describe('openBook / deleteBook', () => {
  it('openBook подменяет текст и восстанавливает смещение своей книги', async () => {
    const h = await mount();
    const textA = 'А-раз.\n\nА-два.\n\nА-три.';
    const a = await add(h, 'А', textA);
    act(() => h.result.current.setOffset(16));
    const b = await add(h, 'Б', 'Б-раз.\n\nБ-два.');

    expect(h.result.current.text).toBe('Б-раз.\n\nБ-два.');
    expect(h.result.current.offset).toBe(0);

    await act(async () => {await h.result.current.openBook(a);});
    expect(h.result.current.text).toBe(textA);
    expect(h.result.current.offset).toBe(16);
    expect(h.result.current.current.id).toBe(a);

    await act(async () => {await h.result.current.openBook(b);});
    expect(h.result.current.offset).toBe(0);
  });

  it('deleteBook переключает current на первую оставшуюся книгу', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'А-раз.\n\nА-два.');
    const b = await add(h, 'Б', 'Б-раз.');
    expect(h.result.current.current.id).toBe(b);

    await act(async () => {await h.result.current.deleteBook(b);});
    expect(h.result.current.books).toHaveLength(1);
    expect(h.result.current.current.id).toBe(a);
    expect(h.result.current.text).toBe('А-раз.\n\nА-два.');
    expect(localStorage.getItem('scroll.book.' + b)).toBeNull();
  });

  it('удаление последней книги обнуляет current и текст', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'А-раз.');
    await act(async () => {await h.result.current.deleteBook(a);});
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.current).toBeNull();
    expect(h.result.current.text).toBe('');
    expect(h.result.current.offset).toBe(0);
  });
});

describe('lastApp', () => {
  it('запоминается и переживает перезапуск', async () => {
    const h = await mount();
    act(() => h.result.current.setLastApp('chats'));
    expect(h.result.current.lastApp).toBe('chats');
    h.unmount();

    const again = await mount();
    expect(again.result.current.lastApp).toBe('chats');
  });

  // «Продолжить» уводит в читалку. Запомнить тут home или library — значит
  // отправить кнопку в никуда.
  it('не запоминает экраны, которые не читалки', async () => {
    const h = await mount();
    act(() => h.result.current.setLastApp('feed'));
    act(() => h.result.current.setLastApp('library'));
    act(() => h.result.current.setLastApp('home'));
    expect(h.result.current.lastApp).toBe('feed');
  });
});

describe('размонтирование', () => {
  it('дописывает несохранённое смещение и не оставляет висящий таймер', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setOffset(12));
    expect(rawMeta().at[id]).toBe(0);            // дебаунс ещё не сработал

    h.unmount();
    expect(rawMeta().at[id]).toBe(12);           // сброшено при размонтировании

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    await sleep(600);                            // дебаунс успел бы сработать
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useStore', () => {
  it('вне провайдера бросает понятную ошибку', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useStore())).toThrow(/StoreProvider/);
  });
});
