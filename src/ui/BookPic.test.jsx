import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {render, renderHook, waitFor, act} from '@testing-library/react';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, savePic, savePix, saveText} from '../lib/storage.js';
import useChunks from './useChunks.js';
import {SIZE} from './sizes.js';
import Feed from '../screens/Feed.jsx';
import Tweets from '../screens/Tweets.jsx';
import Reels from '../screens/Reels.jsx';
import Stories from '../screens/Stories.jsx';
import Video, {Player} from '../screens/Video.jsx';
import Chats, {Chat} from '../screens/Chats.jsx';

// Картинка из книги на экране: от записи в хранилище до <img>.
//
// Проверяется на живых экранах, а не на одном компоненте, ровно по той
// причине, по которой это вообще понадобилось: место картинки знает нарезка, а
// нарезка у каждого экрана своя. Компонент, показанный в вакууме, сказал бы
// только, что умеет рисовать рамку.

const PARA = ['Первый абзац книги.', 'Второй абзац книги.', 'Третий абзац книги.',
  'Четвёртый абзац книги.', 'Пятый абзац книги.', 'Шестой абзац книги.'];
const TEXT = PARA.join('\n\n') + '\n\n' + 'Ещё абзац для длины. '.repeat(60);
const AT = TEXT.indexOf(PARA[2]);
const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

/**
 * Книга с одной картинкой на третьем абзаце. Курсор ставим туда же: тогда
 * карточка с картинкой на любом экране оказывается текущей, а значит и
 * смонтированной, какого бы размера ни были фрагменты.
 */
async function seed({file = true} = {}) {
  await saveText('b1', TEXT);
  if (file) await savePic('b1', 0, SRC);
  await savePix('b1', [{at: AT, k: 0}]);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1, pics: 1}],
    cur: 'b1',
    at: {b1: AT},
    last: 'feed',
    place: null
  });
}

/** Экран показываем только после гидрации — так же, как это делает App. */
function Gate({children}) {
  const {ready} = useStore();
  return ready ? children : null;
}

const show = C => render(
  <StoreProvider>
    <Gate><C go={() => {}} back={() => {}} arg={null} /></Gate>
  </StoreProvider>
);

beforeEach(() => localStorage.clear());

describe('картинка книги на экранах', () => {
  const SCREENS = [
    ['лента', Feed],
    ['короткие посты', Tweets],
    ['клипы', Reels],
    ['истории', Stories],
    ['видео', Video],
    ['ролик', Player],
    ['список переписок', Chats],
    ['переписка', Chat]
  ];

  for (const [name, Screen] of SCREENS) {
    it('видна: ' + name, async () => {
      await seed();
      show(Screen);
      const img = await waitFor(() => {
        const el = document.querySelector('.bpic img');
        expect(el).not.toBeNull();
        return el;
      });
      expect(img.getAttribute('src')).toBe(SRC);
      // Подпись обязательна: с экрана читают вслух, и «изображение» без
      // пояснения посреди книги читается как обрыв.
      expect(img.getAttribute('alt')).toBeTruthy();
    });
  }

  it('карточкам без картинки рамку не рисует', async () => {
    await seed();
    show(Feed);
    await waitFor(() => expect(document.querySelector('.bpic img')).not.toBeNull());
    // Карточек на экране два десятка, картинка одна — рамка тоже одна.
    expect(document.querySelectorAll('.bpic')).toHaveLength(1);
  });

  // Пустая рамка навсегда хуже, чем её отсутствие: она читается как дыра в
  // вёрстке, а не как «файла нет».
  it('файл картинки пропал — рамки не остаётся', async () => {
    await seed({file: false});
    show(Feed);
    await waitFor(() => expect(document.querySelector('.post')).not.toBeNull());
    await act(async () => {});
    expect(document.querySelector('.bpic')).toBeNull();
  });

  it('книга без картинок — ни одной рамки', async () => {
    await saveText('b1', TEXT);
    await saveMeta({books: [{id: 'b1', title: 'К', len: TEXT.length, toc: 1}], cur: 'b1',
      at: {b1: 0}, last: 'feed', place: null});
    show(Feed);
    await waitFor(() => expect(document.querySelector('.post')).not.toBeNull());
    await act(async () => {});
    expect(document.querySelector('.bpic')).toBeNull();
  });
});

describe('picsOf() — какой карточке досталась картинка', () => {
  const chunksFor = async size => {
    await seed();
    const h = renderHook(() => useChunks(size), {wrapper: ({children}) =>
      <StoreProvider>{children}</StoreProvider>});
    await waitFor(() => expect(h.result.current.chunks.length).toBeGreaterThan(0));
    return h;
  };

  it('картинка достаётся карточке, в которую попало её смещение', async () => {
    for (const size of [SIZE.roster, SIZE.tweets, SIZE.reels, SIZE.video]) {
      localStorage.clear();
      const h = await chunksFor(size);
      const {chunks, picsOf} = h.result.current;
      const i = chunks.findIndex(c => c.at <= AT && AT < c.end);
      expect(i, 'размер ' + size).toBeGreaterThanOrEqual(0);
      expect(picsOf(i), 'размер ' + size).toEqual([{at: AT, k: 0}]);
      h.unmount();
    }
  });

  it('соседние карточки картинку не наследуют', async () => {
    const h = await chunksFor(SIZE.feed);
    const {chunks, picsOf} = h.result.current;
    const i = chunks.findIndex(c => c.at <= AT && AT < c.end);
    expect(picsOf(i - 1)).toEqual([]);
    expect(picsOf(i + 1)).toEqual([]);
  });

  // Ссылка должна быть одна и та же: новый пустой массив на каждый вызов —
  // это новые props у каждой карточки на каждом кадре прокрутки.
  it('у карточек без картинок список — одна и та же пустая ссылка', async () => {
    const h = await chunksFor(SIZE.feed);
    const {picsOf} = h.result.current;
    expect(picsOf(0)).toBe(picsOf(1));
  });
});
