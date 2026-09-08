import {useT} from '../i18n.js';

// Нижняя панель навигации. Ни одно настоящее приложение без неё не выглядит
// настоящим — и это самая дешёвая узнаваемость из всех: четыре значка внизу.
//
// Раньше панель была нарисованной: `aria-hidden`, ни одного обработчика.
// Довод был «вести ей некуда, раздел в приложении один», и он оказался
// неверен: разделов у нас шесть — по числу движков, — плюс библиотека,
// настройки и оглавление. Вести есть куда, просто никто не связал одно с
// другим. Куда именно — в `ui/actions.js`, там же и почему.
//
// Подпись под значком необязательна: в «ленте» её нет и в оригинале, а
// панель с лишними словами читается как чужая.
//
// @param {Array<[string, string?, string?]>} items тройки [значок, ключ подписи, действие]
// @param {number} active индекс активного значка
// @param {(action: string) => void} onPick что делать по нажатию
export default function Tabbar({items, active = 0, onPick}) {
  const t = useT();
  return (
    <div className="tabbar">
      {items.map(([glyph, key, action], k) => (
        <span
          key={k}
          className={k === active ? 'on' : ''}
          onClick={onPick && action ? () => onPick(action) : undefined}
          role={onPick && action ? 'button' : undefined}
          aria-label={key ? t(key) : undefined}
        >
          <b>{glyph}</b>
          {key ? <i>{t(key)}</i> : null}
        </span>
      ))}
    </div>
  );
}
