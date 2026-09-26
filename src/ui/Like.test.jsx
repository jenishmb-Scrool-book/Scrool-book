import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import Feed from '../screens/Feed.jsx';
import Reels from '../screens/Reels.jsx';
import Tweets from '../screens/Tweets.jsx';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {DICT} from '../i18n.js';

// Сердечко и «комментарии» под постами были нарисованными: не нажимались,
// хотя правило проекта — мёртвых кнопок нет. Теперь сердечко переключается и
// прибавляет к счётчику, а «комментарии» ведут в переписку.

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(30);

function Gate({children}) {
  const {ready} = useStore();
  return ready ? children : null;
}

async function show(Screen) {
  await saveText('b1', TEXT);
  await saveMeta({
    books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
    cur: 'b1', at: {b1: 0}, last: 'feed', intro: 1
  });
  const go = vi.fn();
  render(<StoreProvider><Gate><Screen go={go} back={() => {}} /></Gate></StoreProvider>);
  await waitFor(() => expect(document.querySelector('.like')).not.toBeNull());
  return go;
}

const number = el => Number((el.textContent.match(/\d+/) || ['0'])[0]);

beforeEach(() => localStorage.clear());

describe('сердечко под постом', () => {
  for (const [name, Screen] of [['клипы', Reels], ['лента', Feed], ['короткие посты', Tweets]]) {
    it(name + ': нажимается и прибавляет к счётчику, второе нажатие снимает', async () => {
      await show(Screen);
      const like = document.querySelector('.like');
      // У ленты счётчик — строкой под кнопками, у остальных — рядом с сердечком.
      const counter = () => (Screen === Feed ? document.querySelector('.cap.likes') : document.querySelector('.like'));
      const before = number(counter());
      await act(async () => {like.click();});
      expect(document.querySelector('.like').classList.contains('on')).toBe(true);
      expect(number(counter())).toBe(before + 1);
      await act(async () => {document.querySelector('.like').click();});
      expect(number(counter())).toBe(before);
    });

    it(name + ': «комментарии» ведут в переписку', async () => {
      const go = await show(Screen);
      const btn = [...document.querySelectorAll('[role=button]')]
        .find(el => el.getAttribute('aria-label') === DICT.ru['a11y.comment']);
      await act(async () => {btn.click();});
      expect(go).toHaveBeenCalledWith('chat', {arg: expect.any(Number)});
    });
  }
});
