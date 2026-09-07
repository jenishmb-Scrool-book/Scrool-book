import {useEffect, useState} from 'react';

// Часы. Одни на всё приложение: их показывает и статус-бар, и блок «сегодня»
// на домашнем экране, и расходиться на минуту они не должны — это первое, за
// что цепляется глаз, когда переходишь из настоящей системы в нарисованную.

/** Текущее время, обновляется раз в `period` мс. */
export function useNow(period = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(id);
  }, [period]);
  return now;
}

/** «9:07» — как в статус-баре Android: часы без ведущего нуля, минуты с ним. */
export const hhmm = d => d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');

/**
 * «пн, 8 сент.» — строка под часами на домашнем экране.
 * Локаль неизвестного языка — не повод падать: тогда отдаём пусто, блок просто
 * покажет одни часы.
 */
export function dayLine(d, lang) {
  try {
    return d.toLocaleDateString(lang || 'ru', {weekday: 'short', day: 'numeric', month: 'short'});
  } catch {
    return '';
  }
}
