import {useEffect, useLayoutEffect, useRef, useState} from 'react';

const WINDOW = 25;    // сколько карточек монтируем на входе
const STEP = 20;      // на сколько доращиваем окно при подлёте к концу
const DEBOUNCE = 120; // мс, столько ждём тишины после скролла

/**
 * Окно рендера + перенос курсора по скроллу. Один хук на «Клипы», «Ленту» и «Видео».
 *
 * Не виртуализация: окно начинается на `pos - ahead` и сбрасывается при входе
 * на экран. Книгу на 3000 кусков целиком не рендерим никогда.
 *
 * Растёт окно в ОБЕ стороны. Вниз — чтобы читать дальше; вверх — чтобы
 * вернуться к прочитанному. Второе не роскошь: переключив «приложение», человек
 * попадает на то же место книги, но нарезанное иначе, и первое, что он делает,
 * — листает вверх, чтобы узнать, где он. Пока окно начиналось на `pos - 2`,
 * листать было некуда: над курсором стояли две карточки и пустота.
 *
 * При росте вверх содержимое над видимой областью прибавляется, и без поправки
 * `scrollTop` экран прыгнул бы на двадцать карточек назад. Поправка считается в
 * `useLayoutEffect` — до того, как браузер нарисует кадр.
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
 * @param {'top'|'bottom'} anchor где стоит «текущая» карточка
 * @param {number} gap           на сколько не доводить прокрутку до верха
 *
 * Про `gap`. Полоса прогресса несёт плашку «страница / осталось», и висит она
 * поверх содержимого. В списке чатов текущая строка встаёт вплотную под неё, и
 * плашка накрывает время сообщения — читается это как поломка вёрстки. Запас
 * в двадцать шесть пикселей решает ровно это и ничего больше.
 *
 * Про `anchor`. В клипах и ленте карточка занимает экран, и текущая — верхняя.
 * В чатах на экран помещается пять-шесть пузырей, и всё, что выше нижнего
 * видимого, уже прочитано. С якорем `top` курсор отставал бы на целый экран, и
 * переход в клипы отбрасывал бы человека на пять фрагментов назад.
 */
export default function useCardWindow({count, pos, setPos, ahead = 1, cardSelector, trackPos = true, anchor = 'top', gap = 0}) {
  const boxRef = useRef(null);

  // Начало окна ставится один раз — на входе на экран, — и дальше двигается
  // только прокруткой вверх. От движения курсора оно не зависит: иначе окно
  // перескакивало бы под пальцем.
  const [start, setStart] = useState(() => {
    const at = Math.max(0, Math.min(pos, count - 1));
    return Math.max(0, at - ahead);
  });

  const [end, setEnd] = useState(() => Math.min(count, start + WINDOW));

  // Что было на экране до того, как сверху добавились карточки.
  const keep = useRef(null);

  // Всё изменчивое кладём в реф: обработчик скролла вешается ровно один раз за
  // монтирование. Если бы он пересоздавался на каждый рендер, чужая перерисовка
  // в середине дебаунса гасила бы ещё не сработавший таймер.
  const live = useRef(null);
  live.current = {count, setPos, trackPos, cardSelector, pos, anchor, start};

  // Стартовая прокрутка к текущему куску.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // В начале книги восстанавливать нечего, а прокрутка к нулевой карточке
    // прячет всё, что стоит НАД списком: полосу историй в ленте, чипсы в
    // видео. Открыть ленту и ни разу не увидеть полосу историй — это ровно та
    // мелочь, из-за которой экран перестаёт быть похожим на оригинал.
    if (anchor === 'top' && live.current.pos === 0) return;
    const cur = box.querySelector('[data-i="' + live.current.pos + '"]');
    if (!cur) return;
    box.scrollTop = anchor === 'bottom'
      ? cur.offsetTop + cur.offsetHeight - box.clientHeight   // как в мессенджере: свежее внизу
      : Math.max(0, cur.offsetTop - gap);
  }, []);

  // Поправка прокрутки после того, как сверху прибавились карточки. Именно
  // layout-эффект: в обычном `useEffect` браузер успевает нарисовать кадр со
  // скачком, и это видно.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const k = keep.current;
    if (!box || !k) return;
    keep.current = null;
    box.scrollTop = k.top + (box.scrollHeight - k.height);
  }, [start]);

  // Курсор может уехать вперёд не скроллом, а действием — кнопкой «отправить»
  // в чате. Окно обязано его догнать, иначе рендерить будет нечего.
  useEffect(() => {
    setEnd(e => Math.max(e, Math.min(count, pos + 2)));
  }, [pos, count]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = live.current;
        if (s.trackPos && s.anchor === 'bottom') {
          // Последняя карточка, начавшаяся выше нижней кромки, — та, которую
          // человек читает сейчас; всё, что над ней, уже позади.
          let last = null;
          for (const el of box.querySelectorAll(s.cardSelector)) {
            if (el.offsetTop < box.scrollTop + box.clientHeight - 40) last = el;
            else break;
          }
          if (last) s.setPos(Number(last.dataset.i));
        } else if (s.trackPos) {
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
        // Подошли к началу окна, а книга выше ещё есть — доращиваем вверх.
        // Замеры снимаем здесь, до перерисовки: после неё старой высоты уже нет.
        if (box.scrollTop < box.clientHeight && s.start > 0 && !keep.current) {
          keep.current = {height: box.scrollHeight, top: box.scrollTop};
          setStart(v => Math.max(0, v - STEP));
        }
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
