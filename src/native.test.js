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
  exits: 0,      // сколько раз приложение попросили закрыться
  // Уведомления: что отвечает система и что ей сказали.
  allow: 'granted',   // ответ обоих методов про разрешение
  asked: 0,           // сколько раз показали СИСТЕМНЫЙ диалог
  checked: 0,         // сколько раз тихо проверили
  planned: [],        // поставленные будильники
  dropped: [],        // снятые
  boom: ''            // какой вызов должен упасть
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

// Плагин уведомлений приезжает динамическим import — vi.mock ловит и такой.
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: async () => {
      H.asked += 1;
      if (H.boom === 'ask') throw new Error('плагин упал');
      return {display: H.allow};
    },
    checkPermissions: async () => {
      H.checked += 1;
      if (H.boom === 'check') throw new Error('плагин упал');
      return {display: H.allow};
    },
    schedule: async o => {
      if (H.boom === 'schedule') throw new Error('будильник не встал');
      H.planned.push(...o.notifications);
    },
    cancel: async o => {H.dropped.push(...o.notifications);}
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
  delete globalThis[Symbol.for('scrollbook.native.state')];
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
  H.allow = 'granted';
  H.asked = 0;
  H.checked = 0;
  H.planned.length = 0;
  H.dropped.length = 0;
  H.boom = '';
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

// Ежедневное напоминание.
//
// Своих тестов у него не было вовсе, и именно здесь владелец увидел, что
// «включить напоминание не работает»: в браузере плагина нет, включение
// возвращало то же «нет», что и отказ Android, а переключатель показывал
// сообщение про настройки телефона, которых в браузере не существует.
describe('напоминание', () => {
  it('включение спрашивает разрешение и ставит будильник на 12:00', async () => {
    const {ensureNotifications, NOTIFY} = await load();
    await expect(ensureNotifications({title: 'Стр. 7', body: 'Книга ждёт'}))
      .resolves.toBe(NOTIFY.on);

    expect(H.asked).toBe(1);
    expect(H.planned).toHaveLength(1);
    const [n] = H.planned;
    expect(n.title).toBe('Стр. 7');
    expect(n.body).toBe('Книга ждёт');
    // Секунды обязательны: незаданные поля плагин берёт из текущего времени,
    // и без них напоминание приходило бы в 12:00:37.
    expect(n.schedule.on).toEqual({hour: 12, minute: 0, second: 0});
  });

  it('перед новым будильником снимает прошлый', async () => {
    const {ensureNotifications} = await load();
    await ensureNotifications();
    expect(H.dropped).toHaveLength(1);
    // Один и тот же id: повторное включение заменяет напоминание, а не
    // заводит второе.
    expect(H.dropped[0].id).toBe(H.planned[0].id);
  });

  it('отказ Android — будильника нет и вранья тоже', async () => {
    const {ensureNotifications, NOTIFY} = await load();
    H.allow = 'denied';
    await expect(ensureNotifications()).resolves.toBe(NOTIFY.denied);
    expect(H.planned).toHaveLength(0);
  });

  it('в браузере отвечает «негде», а не «отказано»', async () => {
    const {ensureNotifications, NOTIFY} = await load();
    H.native = false;
    await expect(ensureNotifications()).resolves.toBe(NOTIFY.nowhere);
    expect(H.asked).toBe(0);
  });

  it('упавший плагин — это «не вышло», а не отказ', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {ensureNotifications, NOTIFY} = await load();
    H.boom = 'schedule';
    await expect(ensureNotifications()).resolves.toBe(NOTIFY.failed);
    warn.mockRestore();
  });

  // Перестановка при запуске. Будильник снимается обновлением приложения из
  // Play, и без неё напоминание, включённое месяц назад, молча перестаёт
  // приходить — при переключателе, который стоит на «Вкл».
  it('перестановка ставит будильник заново', async () => {
    const {refreshNotifications, NOTIFY} = await load();
    await expect(refreshNotifications({title: 'Стр. 240'})).resolves.toBe(NOTIFY.on);
    expect(H.planned).toHaveLength(1);
    expect(H.planned[0].title).toBe('Стр. 240');
  });

  // Системный диалог Android показывается ОДИН раз за всю жизнь установки.
  // Потратить его на старте приложения — значит отобрать у того места, где
  // человек сам нажал «Вкл», и больше его туда не вернуть.
  it('перестановка не показывает системный диалог', async () => {
    const {refreshNotifications} = await load();
    await refreshNotifications();
    expect(H.asked).toBe(0);
    expect(H.checked).toBe(1);
  });

  it('отозванное разрешение перестановка замечает', async () => {
    const {refreshNotifications, NOTIFY} = await load();
    H.allow = 'denied';
    await expect(refreshNotifications()).resolves.toBe(NOTIFY.denied);
    expect(H.planned).toHaveLength(0);
  });

  it('в браузере перестановка молчит', async () => {
    const {refreshNotifications, NOTIFY} = await load();
    H.native = false;
    await expect(refreshNotifications()).resolves.toBe(NOTIFY.nowhere);
    expect(H.checked).toBe(0);
  });

  it('выключение снимает будильник', async () => {
    const {cancelNotifications} = await load();
    await cancelNotifications();
    expect(H.dropped).toHaveLength(1);
  });

  it('в браузере выключение не бросает', async () => {
    const {cancelNotifications} = await load();
    H.native = false;
    await expect(cancelNotifications()).resolves.toBeUndefined();
  });

  // «Не удалось» без причины владелец уже получил на телефоне — и разобрать
  // по нему было нечего. Причина от плагина обязана доехать до экрана.
  it('причина неудачи доступна экрану и сбрасывается успехом', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {ensureNotifications, notifyError, NOTIFY} = await load();
    H.boom = 'schedule';
    await expect(ensureNotifications()).resolves.toBe(NOTIFY.failed);
    expect(notifyError()).toBe('будильник не встал');
    H.boom = '';
    await ensureNotifications();
    expect(notifyError()).toBe('');
    warn.mockRestore();
  });
});

// Пробное напоминание. Без него полуденное проверяется только ожиданием до
// завтра, а переключатель на «Вкл» без уведомления читается как поломка.
describe('пробное напоминание', () => {
  it('приходит через пять секунд и не трогает ежедневное', async () => {
    const {ensureNotifications, testNotification, NOTIFY} = await load();
    await ensureNotifications({title: 'Стр. 7'});
    const before = Date.now();
    await expect(testNotification({title: 'Проверка'})).resolves.toBe(NOTIFY.on);

    expect(H.asked).toBe(1);             // системный диалог — только от включения
    expect(H.dropped).toHaveLength(1);   // и снятие было только его
    const [daily, test] = H.planned;
    expect(test.id).not.toBe(daily.id);
    expect(test.title).toBe('Проверка');
    // Через будильник, а не мимо него: иначе проверка прошла бы и там, где
    // полуденное не ставится.
    const wait = test.schedule.at.getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(5000);
    expect(wait).toBeLessThan(6000);
  });

  it('без разрешения не ставится и говорит об отказе', async () => {
    const {testNotification, NOTIFY} = await load();
    H.allow = 'denied';
    await expect(testNotification()).resolves.toBe(NOTIFY.denied);
    expect(H.planned).toHaveLength(0);
    expect(H.asked).toBe(0);
  });

  it('упавший плагин — «не вышло» с причиной', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {testNotification, notifyError, NOTIFY} = await load();
    H.boom = 'schedule';
    await expect(testNotification()).resolves.toBe(NOTIFY.failed);
    expect(notifyError()).toBe('будильник не встал');
    warn.mockRestore();
  });

  it('в браузере отвечает «негде»', async () => {
    const {testNotification, NOTIFY} = await load();
    H.native = false;
    await expect(testNotification()).resolves.toBe(NOTIFY.nowhere);
  });
});
