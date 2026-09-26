import {useState} from 'react';
import {useT} from '../i18n.js';
import Glyph from './Glyph.jsx';

// Сердечко под постом, клипом, коротким постом — нажимается.
//
// Раньше оно было нарисованным, а в «Клипах» первое, что делает любой
// человек, — лайкает. Кнопка, которая не нажимается, выдаёт подделку вернее
// кривого цвета (правило «мёртвых кнопок нет», README). Отметка живёт, пока
// карточка на экране, и никуда не пишется — как сердечко под комментарием в
// плеере: это отметка на выдуманном посте, переживать перезапуск ей незачем.

/** Отметка «нравится» одной карточки: [стоит ли, переключить]. */
export function useLike() {
  const [on, setOn] = useState(false);
  return [on, () => setOn(v => !v)];
}

/**
 * @param {boolean} on       стоит ли отметка
 * @param {() => void} onToggle переключить
 * @param {string} [empty]   значок без отметки: контур, а в клипах — белая заливка
 */
export default function Like({on, onToggle, empty = 'heart', children}) {
  const t = useT();
  return (
    <span className={on ? 'like on' : 'like'} role="button" aria-pressed={on}
          aria-label={t('a11y.like')}
          onClick={e => {e.stopPropagation(); onToggle();}}>
      <Glyph name={on ? 'heartFill' : empty} />
      {children}
    </span>
  );
}
