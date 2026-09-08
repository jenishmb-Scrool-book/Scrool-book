import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress, {percent} from '../ui/Progress.jsx';
import {PAGE, pageAt, pageCount} from '../lib/pages.js';
import Glyph from '../ui/Glyph.jsx';

// Оглавление — единственный экран, который не притворяется чужим приложением.
// И правильно: перепрыгнуть на сорок страниц вперёд в мессенджере нечем, а
// нужно это ровно тогда, когда книгу читают не подряд.
//
// Вкладок две, и вторая появилась не для симметрии. Главы есть не у всякого
// текста: вставленный из буфера кусок их обычно не размечает, и до этого
// экран для такого текста был мёртвым — одна подсказка «глав не нашлось» и
// ничего больше. Страницы есть ВСЕГДА: они считаются по знакам, а знаки есть у
// любого текста. Поэтому список страниц — не запасной вариант, а основной, и
// когда глав нет, вкладок просто не рисуется: одна вкладка это не выбор.
//
// Переход ставит курсор, и дальше он общий, как везде: прыгнул отсюда — и
// продолжаешь в клипах ровно оттуда.

/** Сколько знаков превью показываем у страницы. Одна строка на телефоне. */
const PEEK = 64;

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

  // Открываемся на текущей странице. В книге на триста страниц список,
  // открытый с первой, — это тот же поиск вручную, от которого экран избавляет.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = box && box.querySelector('.ch.on');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 3);
  }, []);

  const rows = [];
  for (let n = 1; n <= total; n++) {
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

  return <div className="body" ref={boxRef}>{rows}{foot}</div>;
}

export default function Chapters({go, back, arg}) {
  const {chapters, text, offset, setOffset, lastApp} = useStore();
  const t = useT();
  const len = text.length;
  const backTo = lastApp || 'reels';

  // Плашка «страница / осталось» приводит сразу на страницы: с неё нажимают
  // именно потому, что хотят сменить страницу, а не найти главу.
  const [tab, setTab] = useState(() => (arg === 'pages' || !chapters.length ? 'pages' : 'ch'));

  // Текущая глава — последняя, чьё начало не позже курсора.
  const here = useMemo(() => {
    let k = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].at <= offset) k = i;
      else break;
    }
    return k;
  }, [chapters, offset]);

  const jump = at => {
    setOffset(at);
    go(backTo);
  };

  return (
    <Screen id="toc">
      <StatusBar />
      <Header
        onBack={back}
        title={t('toc.title')}
        right={chapters.length ? <span className="ic">{t('toc.count', {n: chapters.length})}</span> : null}
      />
      {/* Вкладки только когда есть из чего выбирать. Одинокая вкладка «Страницы»
          над списком страниц — это подпись, притворяющаяся кнопкой. */}
      {chapters.length ? (
        <div className="tabs">
          <span className={tab === 'ch' ? 'on' : ''} role="button" onClick={() => setTab('ch')}>
            {t('toc.tab_chapters')}
          </span>
          <span className={tab === 'pages' ? 'on' : ''} role="button" onClick={() => setTab('pages')}>
            {t('toc.tab_pages')}
          </span>
        </div>
      ) : null}
      <Progress offset={offset} len={len} />
      {tab === 'pages' ? (
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
