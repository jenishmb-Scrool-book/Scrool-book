import {pageAt, pageCount} from '../lib/pages.js';
import {minutesLeft, split} from '../lib/pace.js';
import {useT} from '../i18n.js';

// Полоса прогресса чтения. `float` — вариант для «Клипов», где она лежит поверх карточки.
export function percent(offset, len) {
  if (!len) return 0;
  const at = Math.min(Math.max(Number(offset) || 0, 0), len - 1);
  return ((at + 1) / len) * 100;
}

/**
 * «Осталось» словами. До часа — минуты, дальше — часы, минуты добавляются
 * только когда они есть: «2 ч» короче и честнее, чем «2 ч 0 мин».
 */
export function useLeft(offset, len) {
  const t = useT();
  const total = minutesLeft(offset, len);
  if (!total) return t('pace.done');
  const {h, m} = split(total);
  if (!h) return t('pace.m', {m});
  return m ? t('pace.hm', {h, m}) : t('pace.h', {h});
}

export default function Progress({offset, len, float}) {
  const p = percent(offset, len);
  const total = pageCount(len);
  const left = useLeft(offset, len);
  return (
    <div className={float ? 'prog float' : 'prog'}>
      <i style={{width: p.toFixed(1) + '%'}} />
      {/* Считаем условными страницами, а не фрагментами: у каждого экрана своя
          нарезка, и номер фрагмента прыгал бы при переключении приложений.
          Рядом — оставшееся время: «далеко ли я» отвечает на другой вопрос,
          чем «успею ли я сейчас», а приложение сделано под второй. */}
      {total ? (
        <span className="counter">{pageAt(offset, len)} / {total} · {left}</span>
      ) : null}
    </div>
  );
}
