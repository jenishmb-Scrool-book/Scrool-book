import {useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress, {percent} from '../ui/Progress.jsx';
import {PAGE, pageAt, pageCount} from '../lib/pages.js';
import {CAP, around, find, pattern} from '../lib/find.js';
import Glyph from '../ui/Glyph.jsx';

// Оглавление — единственный экран, который не притворяется чужим приложением.
// И правильно: перепрыгнуть на сорок страниц вперёд в мессенджере нечем, а
// нужно это ровно тогда, когда книгу читают не подряд.
//
// Вкладок три, и ни одна не для симметрии. Главы есть не у всякого текста:
// вставленный из буфера кусок их обычно не размечает, и до этого экран для
// такого текста был мёртвым — одна подсказка «глав не нашлось» и ничего
// больше. Страницы есть ВСЕГДА: они считаются по знакам, а знаки есть у любого
// текста. Поэтому список страниц — не запасной вариант, а основной. Поиск
// отвечает на третий вопрос — «где там было это слово» — и тоже есть у любого
// текста. Когда глав нет, пропадает только их вкладка.
//
// Переход ставит курсор, и дальше он общий, как везде: прыгнул отсюда — и
// продолжаешь в клипах ровно оттуда.

/** Сколько знаков превью показываем у страницы. Одна строка на телефоне. */
const PEEK = 64;

// Список страниц рисуется окном, а не целиком. У романа в три миллиона знаков
// страниц под две тысячи, и все разом — это секунда на компьютере и несколько
// на телефоне, причём на каждом входе в оглавление. Строки одной высоты (номер
// и превью в одну строку каждый), поэтому окно считается от прокрутки
// делением, а место остальных строк держат две распорки.
const ROW = 62;       // высота строки до первого замера
const SPARE = 30;     // строк сверх видимых — с каждой стороны
const SPAN = SPARE * 3;

/**
 * Список условных страниц.
 *
 * Здесь превью ОБРЕЗАЕТСЯ многоточием — и это не противоречит правилу «текст
 * книги не режем». В лентах строка и есть кусок книги, ради которого пришли; тут
 * строка — подпись к месту, а сама книга лежит за переходом. Обрезка теряет не
 * чтение, а половину заголовка.
 */
function Pages({text, offset, onJump, foot}) {
  const t = useT();
  const len = text.length;
  const total = pageCount(len);
  const here = pageAt(offset, len);
  const boxRef = useRef(null);
  const [rowH, setRowH] = useState(ROW);
  // Первая нарисованная строка (с нуля). Начинаем вокруг текущей страницы.
  const [win, setWin] = useState(() => Math.max(0, here - 1 - SPARE));
  const first = Math.max(0, Math.min(win, total - SPAN));
  const last = Math.min(total, first + SPAN);

  // Открываемся на текущей странице. В книге на триста страниц список,
  // открытый с первой, — это тот же поиск вручную, от которого экран избавляет.
  // Высоту строки меряем по нарисованной: она зависит от кегля. Прокрутку
  // ставим после замера — иначе распорка сверху была бы посчитана по запасной
  // высоте, и текущая страница оказалась бы не там.
  const aimed = useRef(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const row = box.querySelector('.ch');
    const h = (row && row.offsetHeight) || ROW;
    if (h !== rowH) {
      setRowH(h);
      return;
    }
    if (aimed.current) return;
    aimed.current = true;
    box.scrollTop = Math.max(0, (here - 1) * h - box.clientHeight / 3);
  }, [rowH, here]);

  // Окно едет за прокруткой, но не на каждый пиксель: перерисовываем, когда
  // видимое ушло от середины окна больше чем на треть запаса.
  const onScroll = () => {
    const box = boxRef.current;
    if (!box) return;
    const f = Math.max(0, Math.floor(box.scrollTop / rowH) - SPARE);
    if (Math.abs(f - first) > SPARE / 3) setWin(f);
  };

  const rows = [];
  for (let n = first + 1; n <= last; n++) {
    const at = (n - 1) * PAGE;
    // Страница режется по знакам, поэтому начинается она обычно посреди слова.
    // Прыгаем всё равно на сам разрез — иначе номер страницы разъедется с
    // плашкой, — а вот в превью обрубок первого слова убираем: строка вида
    // «авишь свою.» читается как поломка, а не как начало страницы.
    const raw = text.slice(at, at + PEEK + 24).replace(/\s+/g, ' ');
    const cut = at > 0 && !/\s/.test(text[at - 1] || ' ') ? raw.replace(/^\S+\s*/, '') : raw;
    const peek = cut.trim().slice(0, PEEK);
    rows.push(
      <div className={n === here ? 'ch on' : 'ch'} key={n} onClick={() => onJump(at)}>
        <div className="ct">
          <b>{t('toc.page_n', {n})}<i>{Math.round(percent(at, len))}%</i></b>
          <span>{peek}</span>
        </div>
        <i><Glyph name="next" /></i>
      </div>
    );
  }

  return (
    <div className="body" ref={boxRef} onScroll={onScroll}>
      <div style={{height: first * rowH}} />
      {rows}
      <div style={{height: (total - last) * rowH}} />
      {foot}
    </div>
  );
}

/**
 * Поиск по тексту книги.
 *
 * Третий способ найти место, и единственный, которому не нужно помнить ни
 * номер страницы, ни название главы: «где там впервые появилась Анна» — это
 * вопрос про слово, а не про страницу. Строка «Поиск» на домашнем экране ведёт
 * сюда же, и с этого экрана она перестала быть надписью.
 *
 * Находка ведёт туда же, куда глава или страница: ставит место чтения и
 * возвращает в «приложение», из которого пришли. Правило одно на весь экран —
 * иначе две строки, стоящие рядом, по нажатию делали бы разное.
 *
 * Считается на `useDeferredValue`, а не по таймеру: буква в поле появляется
 * сразу, а проход по книге догоняет её, когда у телефона есть на это время.
 */
function Search({text, onJump, bar}) {
  const t = useT();
  const [q, setQ] = useState('');
  const asked = useDeferredValue(q);
  const res = useMemo(() => find(text, asked), [text, asked]);
  const inRef = useRef(null);
  const len = text.length;

  // Клавиатура поднимается сама: на эту вкладку приходят ровно затем, чтобы
  // набрать слово, — со строки поиска на домашнем экране или нажатием по самой
  // вкладке. Лишнее нажатие в поле было бы тем же самым вопросом второй раз.
  useEffect(() => {
    if (inRef.current) inRef.current.focus();
  }, []);

  const clear = () => {
    setQ('');
    if (inRef.current) inRef.current.focus();
  };

  let body;
  if (!pattern(asked)) body = <div className="hint">{t('toc.search_hint')}</div>;
  else if (!res.total) body = <div className="hint">{t('toc.search_none')}</div>;
  else {
    body = (
      <>
        <div className="scount">
          {res.more ? t('toc.search_more', {n: CAP}) : t('toc.search_count', {n: res.total})}
        </div>
        {res.hits.map(h => {
          const s = around(text, h.at, h.len);
          const n = pageAt(h.at, len);
          // Текущую страницу здесь не закрашиваем, как в списке страниц: на
          // частом слове находок на ней десяток, и закрашенным оказывается
          // полсписка. Процент рядом с номером и так говорит, где это.
          return (
            <div className="ch" key={h.at} onClick={() => onJump(h.at, asked)}>
              <div className="ct">
                <b>{t('toc.page_n', {n})}<i>{Math.round(percent(h.at, len))}%</i></b>
                <span className="snip">{s.head}<mark>{s.hit}</mark>{s.tail}</span>
              </div>
              <i><Glyph name="next" /></i>
            </div>
          );
        })}
        {res.hits.length < res.total
          ? <div className="hint">{t('toc.search_shown', {n: res.hits.length})}</div>
          : null}
      </>
    );
  }

  return (
    <>
      <div className="qbox">
        <Glyph name="search" />
        <input
          ref={inRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          // «Найти» на клавиатуре прячет её: список уже собран, а клавиатура
          // закрывает его нижнюю половину.
          onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur();}}
          placeholder={t('toc.search_ph')}
          aria-label={t('toc.tab_search')}
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {q ? (
          <span className="qx" role="button" aria-label={t('toc.search_clear')} onClick={clear}>
            <Glyph name="close" />
          </span>
        ) : null}
      </div>
      {/* Полоса чтения — под полем, а не над ним: её плашка «страница /
          осталось» висит поверх того, что ниже, и над полем закрыла бы крестик. */}
      {bar}
      {/* Прокрутка списка прячет клавиатуру: читать находки под ней нельзя. */}
      <div className="body" onTouchStart={() => inRef.current && inRef.current.blur()}>
        {body}
      </div>
    </>
  );
}

// Вкладки экрана. Поиск есть всегда: искать можно в любом тексте, и потому
// вкладки теперь видны всегда — «Страницы» больше не остаются одни.
const TABS = [
  ['ch', 'toc.tab_chapters'],
  ['pages', 'toc.tab_pages'],
  ['find', 'toc.tab_search']
];

export default function Chapters({go, back, arg}) {
  const {chapters, text, offset, setOffset, lastApp, jumpedFrom} = useStore();
  const t = useT();
  const len = text.length;
  const backTo = lastApp || 'reels';

  // Плашка «страница / осталось» приводит сразу на страницы: с неё нажимают
  // именно потому, что хотят сменить страницу, а не найти главу. Строка поиска
  // с домашнего экрана — сразу на поиск.
  const [tab, setTab] = useState(() =>
    arg === 'search' ? 'find' : arg === 'pages' || !chapters.length ? 'pages' : 'ch');

  // Текущая глава — последняя, чьё начало не позже курсора.
  const here = useMemo(() => {
    let k = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].at <= offset) k = i;
      else break;
    }
    return k;
  }, [chapters, offset]);

  // Переход, а не чтение: перепрыгнутые страницы в счёт дня не идут.
  // `q` — запрос, если пришли из поиска: экран чтения подсветит найденное.
  const jump = (at, q) => {
    setOffset(at, {jump: true});
    go(backTo, q ? {hit: {q, at}} : undefined);
  };

  return (
    <Screen id="toc">
      <StatusBar />
      <Header
        onBack={back}
        title={t('toc.title')}
        right={chapters.length ? <span className="ic">{t('toc.count', {n: chapters.length})}</span> : null}
      />
      {/* Вкладка «Главы» — только когда главы есть: вкладка, ведущая к
          пустому списку, — это подпись, притворяющаяся кнопкой. */}
      <div className="tabs">
        {TABS.filter(([id]) => id !== 'ch' || chapters.length).map(([id, key]) => (
          <span key={id} className={tab === id ? 'on' : ''} role="button" onClick={() => setTab(id)}>
            {t(key)}
          </span>
        ))}
      </div>
      {/* Страховка на «нажал не туда». Переход из оглавления или поиска
          переносит место чтения, и без этой строки вернуться можно было
          только по памяти — помня номер страницы, на которой был. Строка
          видна, пока место до перехода отличается от нынешнего хотя бы на
          полстраницы: иначе возвращаться некуда. Над полосой чтения, а не
          под ней: плашка «страница / осталось» висит поверх того, что ниже. */}
      {jumpedFrom != null && Math.abs(jumpedFrom - offset) >= PAGE / 2 ? (
        <div className="ch undo" role="button" onClick={() => jump(jumpedFrom)}>
          <div className="ct">
            <b>{t('toc.undo', {n: pageAt(jumpedFrom, len)})}</b>
            <span>{t('toc.undo_hint')}</span>
          </div>
          <i><Glyph name="back" /></i>
        </div>
      ) : null}
      {tab === 'find' ? (
        <Search text={text} onJump={jump} bar={<Progress offset={offset} len={len} />} />
      ) : <Progress offset={offset} len={len} />}
      {tab === 'find' ? null : tab === 'pages' ? (
        // Подсказка про главы стоит в конце списка, а не отдельной полосой
        // внизу экрана: полоса отъедала бы треть экрана всё время, а ответ на
        // «почему нет глав» нужен один раз.
        <Pages text={text} offset={offset} onJump={jump}
               foot={chapters.length ? null : <div className="hint">{t('toc.empty')}</div>} />
      ) : (
        <div className="body">
          {chapters.map((c, i) => (
            <div className={i === here ? 'ch on' : 'ch'} key={c.at} onClick={() => jump(c.at)}>
              <div className="ct">
                <b>{c.title}</b>
                <span>
                  {t('toc.page', {n: pageAt(c.at, len)})}
                  {i === here ? ' · ' + t('toc.here') : ''}
                </span>
              </div>
              <i><Glyph name="next" /></i>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
