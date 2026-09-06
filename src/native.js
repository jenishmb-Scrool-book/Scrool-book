// Нативная обвязка Capacitor: статус-бар и аппаратная кнопка «назад».
// Контракт (docs/plans/2026-09-06-android-react-port.md):
//   export async function initNative({onBack}): Promise<void>
// onBack() вызывается на аппаратную «назад»; если вернул false — App.exitApp().
// В браузере (не нативная платформа) функция молча ничего не делает и не бросает.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

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

// Все операции идут через очередь: React StrictMode в dev монтирует эффект
// дважды, initNative может быть вызван повторно до того, как первый вызов
// дождался своего PluginListenerHandle. Очередь гарантирует, что снятие старой
// подписки всегда завершится раньше, чем начнётся установка новой.
function enqueue(job) {
  const next = state.queue.then(job);
  state.queue = next.then(noop, noop);
  return next;
}

async function removeBack() {
  const pending = state.back;
  state.back = null;
  if (!pending) return;
  try {
    // addListener в Capacitor 7 отдаёт Promise<PluginListenerHandle>,
    // поэтому сначала дожидаемся хендла и только потом снимаем.
    const handle = await pending;
    await handle?.remove?.();
  } catch {
    // Подписка так и не поднялась — снимать нечего.
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
