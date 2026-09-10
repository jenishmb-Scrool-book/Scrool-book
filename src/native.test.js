import {describe, it, expect, beforeEach, vi} from 'vitest';

// Нативная обвязка — единственный файл, который в браузере не выполняется
// вовсе: все три её функции начинаются с проверки платформы и выходят первой
// же строкой. Поэтому обычный тест проверял бы в ней ровно ничего, и она
// однажды приехала на телефон с ReferenceError — очередь подписок вызывалась,
// но не была объявлена. Аппаратная «назад» молчала месяц, а тесты были
// зелёными. Здесь платформа — «телефон», и плагины Capacitor подменены
// заглушками, которые запоминают, что им сказали.

const H = vi.hoisted(() => ({
  native: true,
  subs: [],      // подписки, поднятые плагином App
  bar: [],       // вызовы статус-бара
  exits: 0       // сколько раз приложение попросили закрыться
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {isNativePlatform: () => H.native}
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name, fn) => {
      const sub = {name, fn, removed: false, remove: async () => {sub.removed = true;}};
      H.subs.push(sub);
      // Capacitor 7 отдаёт именно промис хендла, а не хендл.
      return Promise.resolve(sub);
    },
    exitApp: () => {H.exits += 1;}
  }
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setBackgroundColor: async o => {H.bar.push(o);},
    setStyle: async o => {H.bar.push(o);},
    setOverlaysWebView: async o => {H.bar.push(o);}
  },
  Style: {Dark: 'DARK', Light: 'LIGHT'}
}));

/** Свежий модуль: состояние подписки лежит на globalThis и переживает импорт. */
async function load() {
  vi.resetModules();
  delete globalThis[Symbol.for('sdvg.native.state')];
  return import('./native.js');
}

/** Нажать аппаратную «назад» так, как её нажимает система. */
async function press() {
  const sub = H.subs.filter(s => s.name === 'backButton' && !s.removed).pop();
  expect(sub, 'подписки на backButton нет').toBeTruthy();
  await sub.fn({canGoBack: false});
}

beforeEach(() => {
  H.native = true;
  H.subs.length = 0;
  H.bar.length = 0;
  H.exits = 0;
});

describe('нативный слой', () => {
  // Тот самый тест, которого не было. Он не про подписку — он про то, что
  // функция вообще доходит до конца: молча упавший initNative выглядит на
  // телефоне как «кнопка не работает», и больше никак.
  it('на телефоне поднимается целиком и не бросает', async () => {
    const {initNative} = await load();
    await expect(initNative({onBack: () => true})).resolves.toBeUndefined();
    expect(H.subs.filter(s => s.name === 'backButton')).toHaveLength(1);
    expect(H.bar.length).toBeGreaterThan(0);   // до статус-бара дело тоже дошло
  });

  it('в браузере не трогает ничего', async () => {
    H.native = false;
    const {initNative} = await load();
    await initNative({onBack: () => true});
    expect(H.subs).toHaveLength(0);
  });

  it('обработчик вернул true — из приложения не выходим', async () => {
    const {initNative} = await load();
    await initNative({onBack: () => true});
    await press();
    expect(H.exits).toBe(0);
  });

  it('обработчик вернул false — выходим', async () => {
    const {initNative} = await load();
    await initNative({onBack: () => false});
    await press();
    expect(H.exits).toBe(1);
  });

  it('обработчика нет — ведём себя как Android по умолчанию', async () => {
    const {initNative} = await load();
    await initNative();
    await press();
    expect(H.exits).toBe(1);
  });

  it('упавший обработчик не выкидывает из приложения', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {initNative} = await load();
    await initNative({onBack: () => {throw new Error('ой');}});
    await press();
    expect(H.exits).toBe(0);
    warn.mockRestore();
  });

  it('повторный вызов не оставляет двух подписок', async () => {
    const {initNative} = await load();
    await initNative({onBack: () => true});
    await initNative({onBack: () => true});
    const subs = H.subs.filter(s => s.name === 'backButton');
    expect(subs).toHaveLength(2);
    expect(subs[0].removed).toBe(true);
    expect(subs[1].removed).toBe(false);
  });

  it('destroyNative снимает подписку', async () => {
    const {initNative, destroyNative} = await load();
    await initNative({onBack: () => true});
    await destroyNative();
    expect(H.subs[0].removed).toBe(true);
  });
});
