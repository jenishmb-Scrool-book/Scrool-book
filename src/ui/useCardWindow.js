import {useEffect, useLayoutEffect, useRef, useState} from 'react';

const WINDOW = 25;    // сколько карточек монтируем на входе
const STEP = 20;      // на сколько доращиваем окно при подлёте к концу
const DEBOUNCE = 120; // мс, столько ждём тишины после скролла

/**
 * Окно рендера + перенос курсора по скроллу. Один хук на «Клипы», «Ленту» и «Видео».
 *
 * Не виртуализация: окно начинается на `pos - ahead`, растёт вниз и сбрасывается
 * при входе на экран. Книгу на 3000 кусков целиком не рендерим никогда.
 *
 * Два свойства, на которых прототип уже спотыкался:
 *  1) Контейнер (`.body`) обязан быть `position:relative` — иначе offsetParent карточки
 *     это весь экран, offsetTop приезжает с высотой шапки (~81px) и скролл промахивается.
 *  2) Курсор двигает карточка, которая сейчас вверху контейнера. Обычный обработчик
 *     `scroll` с дебаунсом. IntersectionObserver не использовать — в прототипе он
 *     не срабатывал, а этот вариант проще и детерминированнее.
 *
 * @param {number} count         сколько всего кусков в книге
 * @param {number} pos           курсор на момент входа на экран
 * @param {(i:number)=>void} setPos
 * @param {number} ahead         сколько карточек показать «до» курсора
 * @param {string} cardSelector  селектор карточки внутри контейнера, например '.reel'
 * @param {boolean} trackPos     двигает ли скролл курсор (в «Видео» — нет)
 */
export default function useCardWindow({count, pos, setPos, ahead = 1, cardSelector, trackPos = true}) {
  const boxRef = useRef(null);

  // Начало окна фиксируется один раз — на входе на экран. Дальше pos может ехать
  // от скролла, но окно от этого не должно перескакивать под пальцем.
  const startRef = useRef(null);
  if (startRef.current === null) {
    const at = Math.max(0, Math.min(pos, count - 1));
    startRef.current = Math.max(0, at - ahead);
  }
  const start = startRef.current;

  const [end, setEnd] = useState(() => Math.min(count, start + WINDOW));

  // Всё изменчивое кладём в реф: обработчик скролла вешается ровно один раз за
  // монтирование. Если бы он пересоздавался на каждый рендер, чужая перерисовка
  // в середине дебаунса гасила бы ещё не сработавший таймер.
  const live = useRef(null);
  live.current = {count, setPos, trackPos, cardSelector, pos};

  // Стартовая прокрутка к текущему куску.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const cur = box.querySelector('[data-i="' + live.current.pos + '"]');
    if (cur) box.scrollTop = cur.offsetTop;
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = live.current;
        if (s.trackPos) {
          // Первая карточка, чей низ ещё ниже верхней кромки контейнера, — та,
          // которую человек сейчас видит сверху.
          for (const el of box.querySelectorAll(s.cardSelector)) {
            if (el.offsetTop + el.offsetHeight > box.scrollTop + 40) {
              s.setPos(Number(el.dataset.i));
              break;
            }
          }
        }
        if (box.scrollTop + box.clientHeight * 2 > box.scrollHeight)
          setEnd(e => Math.min(s.count, e + STEP));
      }, DEBOUNCE);
    };
    box.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      clearTimeout(timer);
      box.removeEventListener('scroll', onScroll);
    };
  }, []);

  const items = [];
  for (let i = start; i < end; i++) items.push(i);
  return {boxRef, items};
}
