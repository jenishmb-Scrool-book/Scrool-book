import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import Stories from './Stories.jsx';
import {StoreProvider, useStore} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {chunk} from '../lib/chunk.js';
import {SIZE} from '../ui/sizes.js';

// «Истории»: тап слева листает показ назад, а место чтения не трогает — то
// же правило, что у прокрутки в остальных экранах. Раньше тап слева двигал
// общий курсор назад, и случайное касание левой половины отматывало книгу.

const TEXT = Array.from({length: 30}, (_, i) => 'История номер ' + i + '. Всё было хорошо.').join('\n\n');
const CH = chunk(TEXT, SIZE.stories);

let now = 0;
function Probe() {
  now = useStore().offset;
  return null;
}
function Gate({children}) {
  const {ready} = useStore();
  return ready ? children : null;
}

async function boot(at) {
  await saveText('b1', TEXT);
  await saveMeta({books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}], cur: 'b1', at: {b1: at}, last: 'stories', intro: 1});
  render(<StoreProvider><Gate><Stories go={() => {}} back={() => {}} /><Probe /></Gate></StoreProvider>);
  await waitFor(() => expect(document.querySelector('.stxt')).not.toBeNull());
  await act(async () => {});
}

const shown = () => document.querySelector('.stxt').textContent;
const tap = side => act(async () => {document.querySelector('.zone.' + side).click();});

beforeEach(() => localStorage.clear());

describe('истории', () => {
  it('тап слева показывает прошлую историю, а место остаётся', async () => {
    await boot(CH[5].at);
    expect(shown()).toBe(CH[5].text);
    await tap('left');
    expect(shown()).toBe(CH[4].text);
    expect(now).toBe(CH[5].at);
    expect(document.querySelector('.resume')).not.toBeNull();
  });

  it('тап справа сперва догоняет показ до места, потом двигает место', async () => {
    await boot(CH[5].at);
    await tap('left');
    await tap('left');
    await tap('right');
    expect(shown()).toBe(CH[4].text);
    expect(now).toBe(CH[5].at);
    await tap('right');
    expect(shown()).toBe(CH[5].text);
    expect(now).toBe(CH[5].at);
    await tap('right');
    expect(shown()).toBe(CH[6].text);
    expect(now).toBe(CH[6].at);
  });

  it('«Вернуться к месту» возвращает показ на место', async () => {
    await boot(CH[5].at);
    await tap('left');
    await tap('left');
    await act(async () => {document.querySelector('.resume').click();});
    expect(shown()).toBe(CH[5].text);
    expect(document.querySelector('.resume')).toBeNull();
  });
});
