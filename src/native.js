// Нативная обвязка Capacitor: статус-бар, аппаратная кнопка «назад»
// и ежедневное напоминание.
// Контракт (docs/plans/2026-09-06-android-react-port.md):
//   export async function initNative({onBack}): Promise<void>
// onBack() вызывается на аппаратную «назад»; если вернул false — App.exitApp().
// В браузере (не нативная платформа) функция молча ничего не делает и не бросает.
// То же правило действует и для уведомлений внизу файла: dev-сервер поднимается
// в обычном браузере на каждый npm run dev, падать там нельзя.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { hexOf, isLight, rgbOf } from './ui/color.js';

// Тот же цвет, что android.backgroundColor в capacitor.config.json
// и @color/app_background в android/app/src/main/res/values/colors.xml.
const BG = '#0b0b12';

// Состояние держим на globalThis, а не в обычной переменной модуля.
// При Vite-HMR модуль подменяется целиком: переменная обнулилась бы, а живая
// подписка на backButton осталась бы висеть в нативном слое — и на каждый
// hot-reload их копилось бы всё больше. Ключ через Symbol.for переживает
// подмену модуля, поэтому старую подписку всегда есть чем снять.
const SLOT = Symbol.for('sdvg.native.state');
let state = globalThis[SLOT];
if (!state) {
  state = { back: null, queue: Promise.resolve() };
  globalThis[SLOT] = state;
}

const noop = () => {};

/** Мы на телефоне или в браузере. Нужно интерфейсу: на телефоне статус-бар
 *  рисует система, и второй, нарисованный нами, там лишний. */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Перекрасить СИСТЕМНЫЙ статус-бар под текущий экран.
 *
 * Ради этого всё и затевалось. На настоящем Android полоска наверху принимает
 * цвет открытого приложения — и когда наша не принимает, переход из системы в
 * «читалку» видно ровно по ней.
 *
 * @param {string} css цвет в форме `rgb(...)` из getComputedStyle
 */
export async function setBarColor(css) {
  if (!Capacitor.isNativePlatform()) return;
  const rgb = rgbOf(css);
  if (!rgb) return;
  try {
    await StatusBar.setBackgroundColor({ color: hexOf(rgb) });
    // Style.Dark — «светлый текст», Style.Light — «тёмный». Названия про тему
    // подложки, а не про цвет значков, и перепутать их очень легко.
    await StatusBar.setStyle({ style: isLight(rgb) ? Style.Light : Style.Dark });
  } catch {
    // Статус-бар — не критичная функция: не перекрасился, и ладно.
  }
}

/**
 * Снять подписку на аппаратную «назад».
 * Отдельная функция, потому что контракт требует от initNative ровно
 * Promise<void> — вернуть из неё cleanup-колбэк нельзя. Вызывать вручную
 * не обязательно: повторный initNative сам снимает предыдущую подписку.
 * @returns {Promise<void>}
 */
export async function destroyNative() {
  return enqueue(removeBack);
}

/**
 * Инициализация нативного слоя. Идемпотентна: повторный вызов снимает
 * предыдущую подписку на backButton, дублей не остаётся.
 * @param {{onBack?: () => boolean | Promise<boolean>}} [options]
 * @returns {Promise<void>}
 */
export async function initNative({ onBack } = {}) {
  if (!Capacitor.isNativePlatform()) return;

  return enqueue(async () => {
    await removeBack();

    try {
      // Тёмная тема: Style.Dark — это «светлый текст на тёмном фоне».
      // На Android 15+ (targetSdk 35) система принудительно включает
      // edge-to-edge и overlay здесь уже не отключается — за отступы там
      // отвечает android.adjustMarginsForEdgeToEdge: "auto" в capacitor.config.json.
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: BG });
    } catch (err) {
      // Статус-бар — не критичная функция, приложение должно подняться и без неё.
      console.warn('[native] статус-бар не настроен:', err);
    }

    const sub = App.addListener('backButton', async () => {
      let keep;
      try {
        // Нет обработчика — ведём себя как Android по умолчанию: выходим.
        keep = typeof onBack === 'function' ? await onBack() : false;
      } catch (err) {
        // Упавший обработчик не должен выкидывать пользователя из приложения.
        console.warn('[native] onBack бросил исключение:', err);
        keep = true;
      }
      if (keep === false) App.exitApp();
    });

    state.back = sub;
    try {
      await sub;
    } catch (err) {
      if (state.back === sub) state.back = null;
      console.warn('[native] не удалось подписаться на backButton:', err);
    }
  });
}

/* ===== ежедневное напоминание ===== */

// Решение владельца: одно уведомление в сутки в 12:00 по местному времени.
// Ни выбора времени, ни «не слать, если сегодня уже читал» — оба варианта
// добавляют настройку туда, где её никто не будет крутить, а второй ещё и
// требует держать историю чтения.

// Напоминание всегда одно, поэтому id фиксированный: повторное включение
// перезаписывает тот же будильник, а не заводит второй. Android хранит id
// как int, отсюда маленькое число, а не Date.now().
const NOTIFY_ID = 1;

// Плагин тянем динамическим import, а не статическим сверху файла.
// Причина не в размере бандла, а в том, что уведомления — единственная нативная
// вещь, у которой на вебе нет даже имитации: статический импорт попал бы в
// стартовый чанк dev-сервера ради кода, который в браузере никогда не выполнится.
// Побочная выгода: если плагин ещё не установлен (свежий clone без npm install),
// приложение всё равно поднимется — здесь будет null, а не падение на импорте.
async function notifications() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch (err) {
    console.warn('[native] плагин уведомлений недоступен:', err);
    return null;
  }
}

/**
 * Спросить разрешение и включить ежедневное напоминание на 12:00.
 *
 * Разрешение спрашивается здесь, а не при старте приложения: системный диалог
 * Android показывает один раз за всю жизнь установки, и потратить его до того,
 * как человек что-то прочитал, — значит получить отказ не глядя.
 *
 * Текст приходит снаружи готовым: подставлять переводы должен вызывающий,
 * у которого есть t() — здесь нет ни React-контекста, ни языка.
 *
 * @param {{title?: string, body?: string}} [payload]
 * @returns {Promise<boolean>} true — разрешение получено и будильник поставлен.
 *   На вебе и при отказе — false, без исключения.
 */
export async function ensureNotifications(payload = {}) {
  const plugin = await notifications();
  if (!plugin) return false;

  try {
    const {display} = await plugin.requestPermissions();
    if (display !== 'granted') return false;

    // Снимаем прошлое перед перепланированием: повторное включение должно
    // заменять напоминание, а не накладываться на уже стоящий будильник.
    await plugin.cancel({notifications: [{id: NOTIFY_ID}]});

    await plugin.schedule({
      notifications: [{
        id: NOTIFY_ID,
        title: String(payload.title || ''),
        body: String(payload.body || ''),
        // `on` — это cron-режим плагина: он ставит ближайшие 12:00 и после
        // срабатывания сам переставляет будильник на следующие сутки.
        // `every: 'day'` тут не подходит принципиально — он отсчитывает сутки
        // от момента включения, и напоминание приходило бы в тот час, когда
        // человек нажал переключатель, а не в 12:00.
        // second: 0 обязателен: незаданные поля плагин берёт из текущего
        // времени, и без него напоминание приходило бы в 12:00:37.
        schedule: {on: {hour: 12, minute: 0, second: 0}, allowWhileIdle: true}
      }]
    });
    return true;
  } catch (err) {
    // Не смогли — значит не включили. Врать переключателю нельзя.
    console.warn('[native] не удалось запланировать напоминание:', err);
    return false;
  }
}

/**
 * Снять запланированное напоминание. Идемпотентна: снимать нечего — не ошибка.
 * @returns {Promise<void>}
 */
export async function cancelNotifications() {
  const plugin = await notifications();
  if (!plugin) return;
  try {
    await plugin.cancel({notifications: [{id: NOTIFY_ID}]});
  } catch (err) {
    console.warn('[native] не удалось снять напоминание:', err);
  }
}

/**
 * Сведения о сборке для сообщения об ошибке.
 *
 * Нативно берём их у самого Android (`App.getInfo`): там есть `build` —
 * versionCode, то есть ровно тот номер, которым сборка называется в Play.
 * Из JS его иначе не достать, а тестировщику без него нечего сказать, кроме
 * «у меня не работает».
 *
 * В браузере плагина нет, поэтому остаётся версия из package.json.
 *
 * @returns {Promise<{version: string, build: string, id: string}>}
 */
export async function appInfo() {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  if (!Capacitor.isNativePlatform()) return { version, build: '', id: '' };
  try {
    const i = await App.getInfo();
    return {
      version: i.version || version,
      build: i.build || '',
      id: i.id || ''
    };
  } catch {
    return { version, build: '', id: '' };
  }
}
