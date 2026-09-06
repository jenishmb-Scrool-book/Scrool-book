import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import {StoreProvider, useStore} from '../store.jsx';
import useChunks from './useChunks.js';

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;

// Книга с достаточным числом предложений, чтобы нарезки на 60 и на 400 знаков
// заметно расходились по числу фрагментов.
const BOOK = Array.from({length: 40}, (_, i) => `Предложение номер ${i} в этой книге.`).join(' ');

// Поднимаем сразу две нарезки одного текста — так и живёт приложение:
// пользователь ходит между экранами с разным размером фрагмента.
function useBoth() {
  return {store: useStore(), small: useChunks(60), big: useChunks(400)};
}

async function mounted() {
  const h = renderHook(useBoth, {wrapper});
  await waitFor(() => expect(h.result.current.store.ready).toBe(true));
  await act(async () => {await h.result.current.store.addBook('Книга', BOOK);});
  return h;
}

beforeEach(() => localStorage.clear());

describe('useChunks', () => {
  it('режет текст под заданный размер', async () => {
    const h = await mounted();
    const {small, big} = h.result.current;
    expect(small.chunks.length).toBeGreaterThan(big.chunks.length);
    for (const c of small.chunks) expect(c.text.length).toBeLessThanOrEqual(60 * 1.15);
  });

  it('на пустом сторе отдаёт пустую нарезку и нулевую позицию', async () => {
    const h = renderHook(useBoth, {wrapper});
    await waitFor(() => expect(h.result.current.store.ready).toBe(true));
    expect(h.result.current.small.chunks).toEqual([]);
    expect(h.result.current.small.pos).toBe(0);
  });

  it('setPos записывает в стор смещение, а не номер фрагмента', async () => {
    const h = await mounted();
    const target = h.result.current.small.chunks[9];
    act(() => h.result.current.small.setPos(9));
    expect(h.result.current.store.offset).toBe(target.at);
  });

  it('setPos клампится по границам нарезки', async () => {
    const h = await mounted();
    const last = h.result.current.small.chunks.length - 1;

    act(() => h.result.current.small.setPos(-10));
    expect(h.result.current.small.pos).toBe(0);
    act(() => h.result.current.small.setPos(99999));
    expect(h.result.current.small.pos).toBe(last);
  });

  // Ради этого свойства курсор и переехал в символы. Если оно сломается,
  // переход между «приложениями» начнёт терять место в книге — то есть
  // сломается ровно то, что делает продукт продуктом.
  it('позиция переживает переход между экранами с разной нарезкой', async () => {
    const h = await mounted();

    act(() => h.result.current.small.setPos(12));
    const from = h.result.current.small.chunks[12];
    const landed = h.result.current.big.chunks[h.result.current.big.pos];

    // Крупный фрагмент обязан накрывать то место, где стоял мелкий.
    expect(landed.at).toBeLessThanOrEqual(from.at);
    expect(landed.end).toBeGreaterThan(from.at);
    expect(landed.text).toContain(from.text.slice(0, 20));
  });

  it('переход туда и обратно не уводит позицию вперёд', async () => {
    const h = await mounted();

    act(() => h.result.current.small.setPos(20));
    const started = h.result.current.store.offset;

    // «Ушёл в видео» — там своя нарезка — «вернулся в клипы».
    act(() => h.result.current.big.setPos(h.result.current.big.pos));
    act(() => h.result.current.small.setPos(h.result.current.small.pos));

    // Смещение могло только отъехать назад, к началу накрывающего фрагмента.
    expect(h.result.current.store.offset).toBeLessThanOrEqual(started);
    expect(started - h.result.current.store.offset).toBeLessThan(400);
  });
});
