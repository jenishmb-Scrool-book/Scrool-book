// Условная «страница»: чем меряем прогресс, когда у каждого экрана своя нарезка.
//
// Номер фрагмента для этого не годится — у «коротких» экранов фрагментов втрое
// больше, чем у «видео», и одна и та же книга показывала бы то 1200 страниц,
// то 300. Символы не зависят от нарезки вообще, поэтому страница считается по ним.
//
// 1800 знаков — примерно страница бумажной книги (~30 строк по ~60 знаков).
export const PAGE = 1800;

/** Сколько условных страниц в тексте длиной len. Пустой текст — 0 страниц. */
export function pageCount(len) {
  const n = Number(len) || 0;
  return n > 0 ? Math.max(1, Math.ceil(n / PAGE)) : 0;
}

/** Номер страницы (с единицы), на которой находится смещение offset. */
export function pageAt(offset, len) {
  const total = pageCount(len);
  if (!total) return 0;
  const at = Math.min(Math.max(Number(offset) || 0, 0), Math.max(0, (Number(len) || 0) - 1));
  return Math.min(total, Math.floor(at / PAGE) + 1);
}
