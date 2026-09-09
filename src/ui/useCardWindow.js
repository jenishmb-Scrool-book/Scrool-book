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
 * Курсор при этом двигается ТОЛЬКО ВПЕРЁД. Иначе листание назад — а его затем и
 * добавляли — стирало бы место: вернулся на десять карточек посмотреть, ушёл в
 * другое «приложение», и продолжаешь оттуда, откуда уже читал. Назад место
 * переносится только руками — со страницы или главы в оглавлении, то есть
 * тогда, когда человек этого прямо попросил.
 *
 * Пока видимое место отстаёт от курсора, хук отдаёт `away: true` — по нему
 * экраны показывают кнопку «вернуться к месту». Без неё листание назад
 * оказывается ловушкой: обратно те же тридцать карточек пришлось бы листать
 * руками.
 *
 * Место прокрутки переживает выход из приложения. Одного курсора для этого
 * мало: он показывает на карточку, а стоял человек не на её верхнем краю, — и
 * при листании назад он вообще смотрел не туда, куда показывает курсор.
 * Поэтому рядом с курсором пишется «куда смотрели»: карточка у кромки и
 * сколько её ушло под кромку. На входе окно начинается оттуда же.
 * Записывается это тем же замером, что двигает курсор, и отдельно при
 * сворачивании: дебаунса в 120 мс уход из приложения не переживает, а уходят
 * обычно сразу после того, как долистали.
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
 * @param {{i:number|null, y:number, keep:Function}} eye  место прокрутки, из useChunks
 * @returns {{boxRef, items: number[], away: boolean, toPos: () => void}}
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
export default function useCardWindow({count, pos, setPos, eye, ahead = 1, cardSelector, trackPos = true, anchor = 'top', gap = 0}) {
  const boxRef = useRef(null);

  // Куда смотрели, когда закрыли приложение. Снимается один раз, на входе:
  // дальше это поле переписывает сам хук, и перечитывать его значило бы
  // гоняться за собственным хвостом.
  const seen = useRef(
    eye && eye.i != null ? {i: Math.max(0, Math.min(eye.i, count - 1)), y: eye.y} : null
  );

  // Начало окна ставится один раз — на входе на экран, — и дальше двигается
  // только прокруткой вверх. От движения курсора оно не зависит: иначе окно
  // перескакивало бы под пальцем.
  const [start, setStart] = useState(() => {
    // От места взгляда, а не от курсора: вернувшись, человек обязан застать
    // экран таким, каким его оставил. Совпадают они всегда, кроме одного
    // случая — листал назад и там же и вышел.
    const at = Math.max(0, Math.min(seen.current ? seen.current.i : pos, count - 1));
    return Math.max(0, at - ahead);
  });

  const [end, setEnd] = useState(() => Math.min(count, start + WINDOW));

  // Что было на экране до того, как сверху добавились карточки.
  const keep = useRef(null);

  // Видимое место отстало от курсора — человек листает назад. Начальное
  // значение неспроста: вернувшись туда, где вышли, человек обязан застать и
  // кнопку возврата — иначе восстановлено не место, а половина места.
  const [away, setAway] = useState(() => !!seen.current && seen.current.i < pos - 1);

  // Всё изменчивое кладём в реф: обработчик скролла вешается ровно один раз за
  // монтирование. Если бы он пересоздавался на каждый рендер, чужая перерисовка
  // в середине дебаунса гасила бы ещё не сработавший таймер.
  const live = useRef(null);
  live.current = {count, setPos, trackPos, cardSelector, pos, anchor, start, eye};

  // Стартовая прокрутка: к месту взгляда, если оно записано, иначе к курсору.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const s = seen.current;
    // В начале книги восстанавливать нечего, а прокрутка к нулевой карточке
    // прячет всё, что стоит НАД списком: полосу историй в ленте, чипсы в
    // видео. Открыть ленту и ни разу не увидеть полосу историй — это ровно та
    // мелочь, из-за которой экран перестаёт быть похожим на оригинал.
    // Записи прокрутки это не касается: в ней сказано, что полосу уже листали.
    if (!s && anchor === 'top' && live.current.pos === 0) return;
    const cur = box.querySelector('[data-i="' + (s ? s.i : live.current.pos) + '"]');
    if (!cur) return;
    box.scrollTop = Math.max(0, s
      // Запись снята с той же геометрии и уже несёт в себе и якорь, и зазор.
      // Сдвиг всё равно ограничиваем высотой карточки: она могла стать другой
      // (сменили кегль), и тогда старые пиксели увели бы мимо неё.
      ? cur.offsetTop + Math.max(-box.clientHeight, Math.min(s.y, cur.offsetHeight))
      : anchor === 'bottom'
        ? cur.offsetTop + cur.offsetHeight - box.clientHeight   // как в мессенджере: свежее внизу
        : cur.offsetTop - gap);
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

  /**
   * Замер: какая карточка стоит у кромки. Отсюда едут и курсор, и запись места
   * прокрутки. Вынесен из обработчика ровно потому, что при сворачивании его
   * надо сделать немедленно — ждать дебаунс уже некому.
   *
   * `leaving` — уходим из приложения: пишем без задержки, а окно не растим,
   * этот экран уже не покажут. Из внешнего мира функция читает только `live` и
   * `boxRef`, поэтому подписке хватает той версии, что была на первом рендере.
   */
  const measure = leaving => {
    const box = boxRef.current;
    const s = live.current;
    if (!box) return;
    let cur = null;
    if (s.trackPos && s.anchor === 'bottom') {
      // Последняя карточка, начавшаяся выше нижней кромки, — та, которую
      // человек читает сейчас; всё, что над ней, уже позади.
      for (const el of box.querySelectorAll(s.cardSelector)) {
        if (el.offsetTop < box.scrollTop + box.clientHeight - 40) cur = el;
        else break;
      }
    } else if (s.trackPos) {
      // Первая карточка, чей низ ещё ниже верхней кромки контейнера, — та,
      // которую человек сейчас видит сверху.
      for (const el of box.querySelectorAll(s.cardSelector)) {
        if (el.offsetTop + el.offsetHeight > box.scrollTop + 40) {cur = el; break;}
      }
    }
    if (cur) {
      const at = Number(cur.dataset.i);
      // Только вперёд. Назад курсор переносит оглавление, а не палец.
      if (at > s.pos) s.setPos(at);
      setAway(at < s.pos - 1);
      // А место взгляда — туда, куда смотрели на самом деле, вместе со сдвигом
      // внутри карточки: без него возврат подбрасывал бы к её верхнему краю, а
      // в ленте карточка бывает выше экрана.
      if (s.eye) s.eye.keep(at, box.scrollTop - cur.offsetTop, leaving);
    }
    if (leaving) return;
    if (box.scrollTop + box.clientHeight * 2 > box.scrollHeight)
      setEnd(e => Math.min(s.count, e + STEP));
    // Подошли к началу окна, а книга выше ещё есть — доращиваем вверх.
    // Замеры снимаем здесь, до перерисовки: после неё старой высоты уже нет.
    if (box.scrollTop < box.clientHeight && s.start > 0 && !keep.current) {
      keep.current = {height: box.scrollHeight, top: box.scrollTop};
      setStart(v => Math.max(0, v - STEP));
    }
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => measure(false), DEBOUNCE);
    };
    box.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      clearTimeout(timer);
      box.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Сворачивание. Android не размонтирует React, а убивает процесс, поэтому
  // отложенный замер до записи не доживёт — а отложен он всегда: пока лента
  // едет по инерции, дебаунс перезапускается на каждом событии, и «последние
  // сто миллисекунд» на деле оказываются последним экраном. Меряем прямо в
  // обработчике, пока экран ещё цел, и пишем сразу.
  useEffect(() => {
    const leave = () => measure(true);
    const hidden = () => {if (document.visibilityState === 'hidden') leave();};
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  /** Вернуться к месту, на котором остановились. */
  const toPos = () => {
    const box = boxRef.current;
    const el = box && box.querySelector('[data-i="' + live.current.pos + '"]');
    if (!box || !el) return;
    box.scrollTo({
      top: anchor === 'bottom'
        ? Math.max(0, el.offsetTop + el.offsetHeight - box.clientHeight)
        : Math.max(0, el.offsetTop - gap),
      behavior: 'smooth'
    });
    setAway(false);
  };

  const items = [];
  for (let i = start; i < end; i++) items.push(i);
  return {boxRef, items, away, toPos};
}
