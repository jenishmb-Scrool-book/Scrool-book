import React from 'react';
import {describe, it, expect, beforeEach} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import {StoreProvider, useStore} from './store.jsx';
import {DICT, LANGS, format, useT} from './i18n.js';

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;

beforeEach(() => localStorage.clear());

describe('format()', () => {
  it('подставляет параметры', () => {
    expect(format('{i} из {n}', {i: 3, n: 10})).toBe('3 из 10');
  });

  it('без параметров отдаёт строку как есть', () => {
    expect(format('Просто строка')).toBe('Просто строка');
  });

  // Пустая строка на экране незаметна и уедет в релиз; «{n}» видно сразу.
  it('пропущенный параметр оставляет плейсхолдер видимым', () => {
    expect(format('{i} из {n}', {i: 3})).toBe('3 из {n}');
  });
});

describe('словари', () => {
  it('английский покрывает все ключи русского', () => {
    const missing = Object.keys(DICT.ru).filter(k => !(k in DICT.en));
    expect(missing).toEqual([]);
  });

  it('в английском нет ключей, которых нет в русском', () => {
    const extra = Object.keys(DICT.en).filter(k => !(k in DICT.ru));
    expect(extra).toEqual([]);
  });

  it('ни одна строка не пустая', () => {
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(DICT[lang])) {
        expect(v, `${lang}.${k}`).toBeTruthy();
      }
    }
  });
});

describe('useT()', () => {
  async function mount() {
    const h = renderHook(() => ({store: useStore(), t: useT()}), {wrapper});
    await waitFor(() => expect(h.result.current.store.ready).toBe(true));
    return h;
  }

  it('по умолчанию отдаёт русский', async () => {
    const h = await mount();
    expect(h.result.current.t('home.continue')).toBe('Продолжить');
  });

  it('переключается вслед за настройкой языка', async () => {
    const h = await mount();
    act(() => h.result.current.store.setUi({lang: 'en'}));
    expect(h.result.current.t('home.continue')).toBe('Continue');
  });

  it('неизвестный ключ отдаётся как есть, а не пустой строкой', async () => {
    const h = await mount();
    expect(h.result.current.t('нет.такого.ключа')).toBe('нет.такого.ключа');
  });

  it('подставляет параметры в переведённую строку', async () => {
    const h = await mount();
    act(() => h.result.current.store.setUi({lang: 'en'}));
    expect(h.result.current.t('reels.of', {i: 2, n: 9})).toBe('2 of 9');
  });
});

describe('настройки интерфейса в сторе', () => {
  async function mount() {
    const h = renderHook(() => useStore(), {wrapper});
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    return h;
  }

  it('по умолчанию — системная тема, обычный кегль, русский', async () => {
    const h = await mount();
    expect(h.result.current.ui).toEqual({theme: 'system', lang: 'ru', font: 'md', wallTip: 'on', notify: 'off'});
  });

  it('setUi меняет только переданное поле', async () => {
    const h = await mount();
    act(() => h.result.current.setUi({theme: 'dark'}));
    expect(h.result.current.ui).toEqual({theme: 'dark', lang: 'ru', font: 'md', wallTip: 'on', notify: 'off'});
  });

  it('настройки переживают перезапуск', async () => {
    const h = await mount();
    act(() => h.result.current.setUi({theme: 'light', font: 'lg'}));
    h.unmount();

    const again = await mount();
    expect(again.result.current.ui).toMatchObject({theme: 'light', font: 'lg'});
  });

  // Значение из хранилища могло прийти из будущей или сломанной версии.
  it('мусор в хранилище заменяется значениями по умолчанию', async () => {
    localStorage.setItem('scroll.meta', JSON.stringify({
      books: [], cur: null, at: {}, last: 'reels',
      ui: {theme: 'неоновая', lang: 'kl', font: 42, wallTip: 'может быть', notify: 7}
    }));
    const h = await mount();
    expect(h.result.current.ui).toEqual({theme: 'system', lang: 'ru', font: 'md', wallTip: 'on', notify: 'off'});
  });
});
