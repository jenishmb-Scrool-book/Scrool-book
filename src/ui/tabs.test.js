import {describe, expect, it} from 'vitest';
import {SCREENS} from '../App.jsx';
import {LOCAL, TAB} from './actions.js';
import {has as hasGlyph} from './Glyph.jsx';
import {SKINS} from './skins.js';
import {TABS} from './tabs.js';
import {DICT} from '../i18n.js';

// Главный тест этого набора — «мёртвых кнопок нет».
//
// Владелец пожаловался ровно на это: нижние панели и половина значков в шапках
// не нажимались. Починить их один раз мало: следующая панель, добавленная без
// назначения, выглядит точно так же, а заметить это можно только на телефоне.
// Поэтому проверка структурная — у каждой кнопки во всех панелях и шапках
// обязано быть действие, и это действие обязано куда-то вести.

/** Куда кнопке позволено вести: экран приложения, местное действие или вкладка. */
const known = action =>
  LOCAL.includes(action) || action.startsWith(TAB) || Object.hasOwn(SCREENS, action);

/** Все наборы кнопок приложения: нижние панели плюс шапки мессенджеров. */
function everyButton() {
  const out = [];
  for (const [name, items] of Object.entries(TABS)) out.push([name + ': панель', items]);
  for (const [id, skin] of Object.entries(SKINS)) {
    out.push([id + ': шапка списка', skin.head]);
    out.push([id + ': шапка переписки', skin.chat]);
    if (skin.tabs) out.push([id + ': панель', skin.tabs]);
  }
  return out;
}

describe('кнопки', () => {
  it('у каждой есть значок и назначение', () => {
    for (const [where, items] of everyButton()) {
      expect(items.length, where).toBeGreaterThan(0);
      for (const [glyph, , action] of items) {
        expect(typeof glyph === 'string' && glyph.length > 0, where + ' — значок').toBe(true);
        expect(typeof action === 'string' && action.length > 0, where + ' → ' + glyph).toBe(true);
      }
    }
  });

  it('каждый значок нарисован', () => {
    // Значок — имя из `ui/Glyph.jsx`, а не символ. Опечатка в имени не роняет
    // экран и не видна в разметке: Glyph просто отдаёт null, и на месте кнопки
    // остаётся пустое место с рабочим нажатием. Ловится только так.
    for (const [where, items] of everyButton()) {
      for (const [glyph] of items) {
        expect(hasGlyph(glyph), where + ' → ' + glyph).toBe(true);
      }
    }
  });

  it('каждое назначение существует', () => {
    for (const [where, items] of everyButton()) {
      for (const [glyph, , action] of items) {
        expect(known(action), where + ' → ' + glyph + ' → ' + action).toBe(true);
      }
    }
  });

  it('внутри одного набора назначения не повторяются', () => {
    // Две кнопки в одну сторону — не поломка, но всегда недосмотр: значит,
    // одной из них не нашли смысла и поставили ближайший.
    for (const [where, items] of everyButton()) {
      const actions = items.map(x => x[2]);
      expect(new Set(actions).size, where + ': ' + actions.join(', ')).toBe(actions.length);
    }
  });

  it('подписи вкладок переведены на оба языка', () => {
    for (const [where, items] of everyButton()) {
      for (const [, key] of items) {
        if (!key) continue;
        expect(DICT.ru[key], where + ' → ' + key).toBeTruthy();
        expect(DICT.en[key], where + ' → ' + key).toBeTruthy();
      }
    }
  });
});

describe('нижние панели', () => {
  it('у каждого движка своя, и все по пять кнопок', () => {
    // Пять — это форма, по которой панель узнаётся: четыре значка и «плюс»
    // посередине. Шесть уже не читаются как панель телефона.
    for (const [name, items] of Object.entries(TABS)) {
      expect(items.length, name).toBe(5);
      expect(items[2][0], name + ': середина').toBe('plus');
    }
  });

  it('первая кнопка везде ведёт к началу списка', () => {
    for (const [name, items] of Object.entries(TABS)) {
      expect(items[0][2], name).toBe('top');
    }
  });
});
