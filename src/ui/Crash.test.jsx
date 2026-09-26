import React from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, waitFor, act} from '@testing-library/react';
import App from '../App.jsx';
import {StoreProvider} from '../store.jsx';
import {saveMeta, saveText} from '../lib/storage.js';
import {DICT} from '../i18n.js';
import {describe as details} from './Crash.jsx';

// Предохранитель проверяется на настоящем приложении и на экране, который
// падает при отрисовке. Главный случай — не сама ошибка, а перезапуск: место
// сохранено на упавшем экране, и без предохранителя приложение открывалось бы
// белым листом каждый раз.

vi.mock('../native.js', async orig => ({
  ...(await orig()),
  initNative: async () => {},
  refreshNotifications: async () => 'on'
}));

// «Короткие посты» падают, пока флаг поднят. Флаг — чтобы проверить и то,
// что после ухода на дом приложение живо.
const BOOM = vi.hoisted(() => ({on: true}));
vi.mock('../screens/Tweets.jsx', () => ({
  default: () => {
    if (BOOM.on) throw new Error('экран сломан');
    return <div className="screen on" id="tweets" />;
  }
}));

const TEXT = 'Раз, два, три. Вышел зайчик погулять.\n\n'.repeat(30);
const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const here = () => {
  const el = document.querySelector('.screen');
  return el ? el.id : null;
};

async function boot(place) {
  await Promise.all([
    saveText('b1', TEXT),
    saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1', at: {b1: 0}, last: 'feed', intro: 1, place
    })
  ]);
  render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
  // Экран загрузки ушёл — это коммит гидрации, но не её эффекты: возврат на
  // прошлый экран делает эффект, и под нагрузкой (файлы тестов идут
  // параллельно) он успевал не всегда. Тест тогда видел дом вместо места.
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
  BOOM.on = true;
  // React пишет пойманную ошибку в консоль дважды, предохранитель — ещё раз.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('упавший экран', () => {
  it('вместо белого листа — сообщение, что книга цела', async () => {
    await boot({id: 'tweets', arg: null});
    expect(here()).toBe('crash');
    expect(document.querySelector('.crash h1').textContent).toBe(DICT.ru['crash.title']);
    expect(document.querySelector('.crash .diag').textContent).toContain('экран сломан');
  });

  it('«На главный экран» уводит на дом и запоминает его — перезапуск уже не падает', async () => {
    await boot({id: 'tweets', arg: null});
    await act(async () => {document.querySelector('.crash .igo').click();});
    expect(here()).toBe('home');
    await waitFor(() => expect(rawMeta().place.id).toBe('home'));
  });

  it('возвращение на починившийся экран снимает упавшее состояние', async () => {
    await boot({id: 'home', arg: null});
    // С дома — в короткие посты: падают.
    const go = [...document.querySelectorAll('#home .grid .icon')]
      .find(el => el.textContent.includes('Tvitter'));
    await act(async () => {go.click();});
    expect(here()).toBe('crash');
    await act(async () => {document.querySelector('.crash .igo').click();});
    expect(here()).toBe('home');
    BOOM.on = false;
    const again = [...document.querySelectorAll('#home .grid .icon')]
      .find(el => el.textContent.includes('Tvitter'));
    await act(async () => {again.click();});
    expect(here()).toBe('tweets');
  });
});

describe('describe()', () => {
  it('версия, текст ошибки и верх стека — без текста книги', () => {
    const e = new Error('сломалось');
    const s = details(e);
    expect(s.split('\n')[0]).toMatch(/^Scroll Book /);
    expect(s).toContain('сломалось');
    expect(s.split('\n').length).toBeLessThanOrEqual(10);
  });

  it('не ошибка — тоже строка, без падения', () => {
    expect(details('просто строка')).toContain('просто строка');
    expect(details(null)).toContain('?');
  });
});
