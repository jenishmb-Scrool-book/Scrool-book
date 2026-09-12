import {useT} from '../i18n.js';
import {WALLS} from '../wallpaper.js';

// Решётка готовых обоев. Одна на два места: шаг первого запуска и настройки.
//
// Кнопки, а не картинки: это выбор, и он должен доставаться с клавиатуры и
// называться вслух. Сам снимок уезжает в фон кнопки — картинке тут нечего
// сказать словами, `alt` у неё был бы пустым, а пустой `alt` внутри кнопки
// оставляет кнопку безымянной.
//
// Отметка выбранного — рамка, а не галочка поверх кадра: галочка на светлом
// снимке пропадает, и её пришлось бы подкладывать плашкой, то есть закрывать
// собой то, что человек как раз и разглядывает.

/**
 * @param {{value?: string, onPick: (src: string) => void}} props
 *   value — путь выбранных обоев; onPick — что делать с нажатием.
 */
export default function Walls({value, onPick}) {
  const t = useT();
  return (
    <div className="walls">
      {WALLS.map((src, i) => (
        <button
          key={src}
          type="button"
          className={src === value ? 'on' : undefined}
          style={{backgroundImage: `url(${src})`}}
          aria-label={t('wall.n', {n: i + 1})}
          aria-pressed={src === value}
          onClick={() => onPick(src)}
        />
      ))}
    </div>
  );
}
