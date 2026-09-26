import {Component, useState} from 'react';
import {useT} from '../i18n.js';
import {APP_NAME} from '../name.js';
import Screen from './Screen.jsx';
import StatusBar from './StatusBar.jsx';

// Предохранитель: упавший экран вместо белого листа.
//
// Без него ошибка при отрисовке любого экрана гасит React целиком, и на
// телефоне остаётся пустой белый WebView. Хуже того — навсегда: приложение
// открывается там, где его закрыли (см. `place` в сторе), то есть на том же
// экране, и падает на нём при каждом запуске. Выйти оттуда можно было бы
// только очисткой данных — вместе с книгами.
//
// Здесь же человек видит, что книга цела, может уйти на домашний экран и
// скопировать описание ошибки: тестировщику без него нечего прислать, кроме
// «белый экран».

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?';

/**
 * Описание ошибки для письма разработчику. Ничего из книги и ничего о
 * человеке: версия, текст исключения и верх стека — по нему видно место.
 */
export function describe(err) {
  const msg = String((err && err.message) || err || '?').slice(0, 300);
  const stack = String((err && err.stack) || '').split('\n').slice(0, 8).join('\n');
  // Первая строка стека в V8 — это «Error: сообщение»; второй раз его не пишем.
  const head = stack.includes(msg) ? '' : msg;
  // Версии Android и WebView — из строки браузера: половина поломок WebView
  // зависит от его версии, а спросить её у тестировщика потом не у кого.
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const android = (ua.match(/Android [\d.]+/) || [''])[0];
  const chrome = (ua.match(/Chrome\/[\d.]+/) || [''])[0];
  const env = [android, chrome].filter(Boolean).join(', ');
  return [APP_NAME + ' ' + VERSION + (env ? ' · ' + env : ''), head, stack].filter(Boolean).join('\n');
}

function Fallen({err, onHome, homeLabel, onGo}) {
  const t = useT();
  const [note, setNote] = useState('');
  const info = describe(err);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info);
      setNote(t('crash.copied'));
    } catch {
      // Буфер недоступен — описание и так стоит на экране, его можно снять.
      setNote(t('crash.copy_failed'));
    }
  };
  return (
    <Screen id="crash">
      <StatusBar />
      <div className="crash">
        <h1>{t('crash.title')}</h1>
        <p>{t('crash.body')}</p>
        <button className="igo" onClick={onHome}>{t(homeLabel || 'crash.home')}</button>
        {/* Если упал сам дом — например, из-за книги, — одного «на главный»
            мало: он приведёт туда же. Из библиотеки такую книгу можно
            удалить, из настроек — сменить то, что могло всё сломать. */}
        {onGo ? (
          <div className="crash-row">
            <button className="crash-copy" onClick={() => onGo('library')}>{t('lib.title')}</button>
            <button className="crash-copy" onClick={() => onGo('settings')}>{t('set.title')}</button>
          </div>
        ) : null}
        <button className="crash-copy" onClick={copy}>{t('crash.copy')}</button>
        {note ? <p className="hint">{note}</p> : null}
        <div className="diag">{info}</div>
      </div>
    </Screen>
  );
}

/**
 * @param {() => void} onHome   куда уводит кнопка: на домашний экран или дальше
 * @param {string} [homeLabel] ключ подписи кнопки, если «на главный» не подходит
 * @param {(id: string) => void} [onGo] переход на экран — для выходов в
 *   библиотеку и настройки; без него этих кнопок нет
 *
 * Сбрасывается сменой `key` у родителя: App ставит ключом экран, и переход на
 * другой экран (в том числе аппаратной «назад») снимает упавшее состояние.
 */
export default class Crash extends Component {
  constructor(props) {
    super(props);
    this.state = {err: null};
  }

  static getDerivedStateFromError(err) {
    return {err};
  }

  componentDidCatch(err, info) {
    // В консоль — с деревом компонентов: при отладке по кабелю это первое,
    // что захочется увидеть, а на экран оно не нужно.
    console.error('[crash]', err, info && info.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <Fallen err={this.state.err} onHome={this.props.onHome} homeLabel={this.props.homeLabel}
              onGo={this.props.onGo} />
    );
  }
}
