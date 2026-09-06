import {pageAt, pageCount} from '../lib/pages.js';

// Полоса прогресса чтения. `float` — вариант для «Клипов», где она лежит поверх карточки.
export function percent(offset, len) {
  if (!len) return 0;
  const at = Math.min(Math.max(Number(offset) || 0, 0), len - 1);
  return ((at + 1) / len) * 100;
}

export default function Progress({offset, len, float}) {
  const p = percent(offset, len);
  const total = pageCount(len);
  return (
    <div className={float ? 'prog float' : 'prog'}>
      <i style={{width: p.toFixed(1) + '%'}} />
      {/* Считаем условными страницами, а не фрагментами: у каждого экрана своя
          нарезка, и номер фрагмента прыгал бы при переключении приложений. */}
      {total ? (
        <span className="counter">{pageAt(offset, len)} / {total} · {Math.round(p)}%</span>
      ) : null}
    </div>
  );
}
