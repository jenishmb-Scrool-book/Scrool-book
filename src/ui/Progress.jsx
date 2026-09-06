// Полоса прогресса чтения. `float` — вариант для «Клипов», где она лежит поверх карточки.
export function percent(pos, count) {
  return count ? ((pos + 1) / count) * 100 : 0;
}

export default function Progress({pos, count, float}) {
  const p = percent(pos, count);
  return (
    <div className={float ? 'prog float' : 'prog'}>
      <i style={{width: p.toFixed(1) + '%'}} />
      {/* Маленький индикатор «где я сейчас»: без него полоса показывает долю,
          но не отвечает на вопрос «сколько ещё листать». */}
      {count ? (
        <span className="counter">{pos + 1} / {count} · {Math.round(p)}%</span>
      ) : null}
    </div>
  );
}
