// Полоса прогресса чтения. `float` — вариант для «Клипов», где она лежит поверх карточки.
export function percent(pos, count) {
  return count ? ((pos + 1) / count) * 100 : 0;
}

export default function Progress({pos, count, float}) {
  return (
    <div className={float ? 'prog float' : 'prog'}>
      <i style={{width: percent(pos, count).toFixed(1) + '%'}} />
    </div>
  );
}
