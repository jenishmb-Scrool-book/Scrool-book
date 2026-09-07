import {useLayoutEffect, useEffect, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {APP_NAMES} from '../ui/skins.js';
import {commentEmo, dur, grad, likes, videoTitle, views} from '../ui/visual.js';
import {contactAt} from '../lib/fake.js';
import {indexAt} from '../lib/chunk.js';

// «Видео» — три места, где читается одна и та же книга.
//
//   список      — текст лежит в НАЗВАНИЯХ роликов. По списку можно просто идти
//                 сверху вниз и читать, ничего не открывая.
//   описание    — если ролик открыть, книга продолжается под плеером.
//   комментарии — и дальше в них, репликами разных людей, с реакциями.
//
// Так это устроено по прямой просьбе владельца — тем же движением, каким до
// этого разъехались список чатов и сама переписка: снаружи короткий шаг,
// внутри длинный. Курсор при этом общий, в символах, поэтому три поверхности
// продолжают друг друга, а не спорят.
//
// Плеер остаётся пустым. Внутри коробки 16:9 на телефоне двести пикселей
// высоты — читать там нельзя, и попытка засунуть туда текст была тем, что
// владелец назвал «плохо работает».

// Нижняя панель. Значки декоративны, как чипсы фильтров.
const TABS = [
  ['⌂', 'video.tab_home'],
  ['⊳', 'video.tab_shorts'],
  ['＋', null],
  ['⊞', 'video.tab_subs'],
  ['☺', 'video.tab_you']
];

// Столько комментариев под роликом. Шесть по 200 знаков плюс описание на 600 —
// это ровно 1800, то есть условная страница из `lib/pages.js`. Один «ролик»
// получается одной страницей книги, а «Следующее видео» ведёт на следующую.
const COMMENTS = 6;

// Сколько ролика «просмотрено» — красная полоска на превью. От индекса, не от
// часов: число, меняющееся при перерисовке, читается как баг, а не как жизнь.
const seen = i => (i * 17) % 55 + 20;

// «1:23 / 4:56» — из длительности и доли просмотра. Мелочь, но без неё плеер
// выглядит нарисованным.
function elapsed(i) {
  const [m, s] = dur(i).split(':').map(Number);
  const total = m * 60 + s;
  const at = Math.round(total * seen(i) / 100);
  return Math.floor(at / 60) + ':' + String(at % 60).padStart(2, '0');
}

/**
 * Карточка ролика.
 *
 * Название — это и есть кусок книги, целиком и без многоточия. Обрезка здесь
 * не оформление, а потеря текста: по списку читают, и срезанный хвост никто
 * не прочитает. Настоящие названия бывают в два ряда, наши иногда в три —
 * это цена, и она меньше, чем цена пропущенных слов.
 */
function Card({i, title, here, onPlay, small}) {
  const t = useT();
  return (
    <div className={small ? 'vid small' : 'vid'} data-i={i} onClick={onPlay}>
      <div className="th" style={{background: grad(i)}}>
        <span className="pl">▶</span>
        <em>{dur(i)}</em>
        {here ? <b className="seen" style={{width: seen(i) + '%'}} /> : null}
      </div>
      <div className="vrow">
        <div className="ava" style={{background: grad(i + 3)}}>📖</div>
        <div className="vmeta">
          <div className="ti">{title}</div>
          <div className="meta">
            {t('video.meta', {views: views(i)})}{here ? t('video.here') : ''}
          </div>
        </div>
        <span className="kebab">⋮</span>
      </div>
    </div>
  );
}

export default function Video({go}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.vlist);
  const count = chunks.length;
  // Прокрутка списка двигает курсор: список названий сам стал способом читать.
  // До этого здесь стояло `trackPos: false` с доводом «листать список ≠ читать» —
  // он был верен ровно до того дня, когда в названиях появился текст книги.
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 1, cardSelector: '.vid'});

  const play = i => {
    setPos(i);
    go('player');
  };

  return (
    <Screen id="video">
      <StatusBar />
      <div className="yhdr">
        <span className="back" onClick={() => go('home')} role="button" aria-label={t('back')}>‹</span>
        <b className="ylogo"><i>▶</i>{APP_NAMES.video}</b>
        <span className="ic">⌕</span>
        <span className="ic" onClick={() => go('toc')} role="button"
              aria-label={t('toc.title')}>☰</span>
      </div>
      {/* Чипсы фильтров декоративны: узнаваемость экрана держится на них
          не меньше, чем на списке превью. */}
      <div className="chips">
        <span className="on">{t('video.chip_all')}</span>
        <span>{t('video.chip_new')}</span>
        <span>{t('video.channel')}</span>
      </div>
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <Card key={i} i={i} title={chunks[i].text} here={i === pos} onPlay={() => play(i)} />
        ))}
      </div>
      <Tabbar items={TABS} active={0} />
    </Screen>
  );
}

/** Один комментарий: тот же кусок книги, подписанный очередным человеком. */
function Comment({i, at, text}) {
  const t = useT();
  const c = contactAt(i);
  const emo = commentEmo(i);
  return (
    <div className="cmt" data-at={at}>
      <div className="cav" style={{background: grad(i + 5)}}>{c.name.slice(0, 1)}</div>
      <div className="cb">
        <div className="cu">{c.name}<span>{t('video.ago', {n: i % 8 + 1})}</span></div>
        <div className="ct">{text}</div>
        <div className="ca">
          <span>♡ {likes(i)}</span>
          <span className="rep">{t('video.reply')}</span>
          {/* Сердечко от автора канала — деталь, которую узнаёт каждый, кто
              вообще заглядывал в комментарии под роликами. */}
          {i % 5 === 2 ? <span className="heart">♥</span> : null}
          {emo ? <span className="cre">{emo}</span> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Страница ролика. Читают здесь описание, а дальше — комментарии.
 *
 * Описание зафиксировано на входе (`head`) и под прокруткой не меняется:
 * иначе текст менялся бы под пальцем, пока курсор едет по комментариям.
 */
export function Player({go}) {
  const {text, offset, setOffset} = useStore();
  const t = useT();
  const {chunks: ds} = useChunks(SIZE.video);      // описание — длинный кусок
  const {chunks: cs} = useChunks(SIZE.comment);    // комментарии — короткие
  const boxRef = useRef(null);
  const [head, setHead] = useState(offset);

  const at = indexAt(ds, head);
  const desc = ds[at];

  // Первый комментарий берётся строго ПОСЛЕ описания: `indexAt` отдаёт кусок,
  // которому смещение принадлежит, а он начинается раньше конца описания —
  // и тогда первый комментарий повторял бы его хвост.
  let first = desc ? indexAt(cs, desc.end) : 0;
  if (cs.length && desc && cs[first].at < desc.end) first += 1;

  const list = [];
  for (let k = 0; k < COMMENTS && first + k < cs.length; k++) list.push(first + k);
  const endAt = list.length ? cs[list[list.length - 1]].end : (desc ? desc.end : 0);
  const more = endAt < text.length;

  // Курсор едет за комментариями: они и есть продолжение книги. Обработчик
  // свой, а не общий `useCardWindow`, ровно по одной причине: тот при входе
  // прокручивает экран к текущей карточке, а текущее здесь — описание, и
  // прокрутка к первому комментарию спрятала бы и плеер, и его.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        let last = null;
        for (const el of box.querySelectorAll('.cmt')) {
          if (el.offsetTop < box.scrollTop + 60) last = el;
          else break;
        }
        if (last) setOffset(Number(last.dataset.at));
      }, 120);
    };
    box.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      clearTimeout(timer);
      box.removeEventListener('scroll', onScroll);
    };
  }, [setOffset]);

  // Следующий ролик — следующая страница книги. Курсор переносим сами: он мог
  // остаться на середине комментариев, а «дальше» значит именно дальше.
  const next = () => {
    setHead(endAt);
    setOffset(endAt);
  };

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [head]);

  return (
    <Screen id="player" bar="#000000">
      <StatusBar />
      <div className="stage" style={{background: grad(at)}}>
        <span className="back" onClick={() => go('video')} role="button" aria-label={t('back')}>‹</span>
        <span className="ic" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}>☰</span>
        <span className="pl">▶</span>
        <div className="ctrl">
          <span className="tm">{elapsed(at)} / {dur(at)}</span>
          <i className="bar"><b style={{width: seen(at) + '%'}} /></i>
          <span className="full">⛶</span>
        </div>
      </div>
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="vinfo">
          <h3>{desc ? videoTitle(desc.text, 90) : ''}</h3>
          <div className="m">{t('video.views', {views: views(at)})}</div>
          <div className="vacts">
            <span>👍 {likes(at)}</span>
            <span>👎</span>
            <span>↪ {t('video.share')}</span>
            <span>⤓ {t('video.save')}</span>
          </div>
          <div className="chan">
            <div className="ava" style={{background: grad(at + 3)}}>📖</div>
            <div className="ci">
              <b>{t('video.channel')}</b>
              <span>{t('video.subs')}</span>
            </div>
            <button className="sub">{t('video.subscribe')}</button>
          </div>
          {/* Первая половина страницы. Блок раскрыт всегда: сворачивать то,
              ради чего экран существует, было бы издевательством. */}
          <div className="desc">
            <div className="dh">{t('video.desc')}</div>
            <div className="dtxt">{desc ? desc.text : ''}</div>
          </div>

          {/* Вторая половина — в комментариях. Читается тем же движением, что и
              всё остальное: просто прокруткой вниз. */}
          {list.length ? (
            <>
              <div className="chead">{t('video.comments')}<i>{list.length}</i></div>
              <div className="cadd">
                <div className="cav me">☺</div>
                <span>{t('video.add_comment')}</span>
              </div>
              {list.map(k => <Comment key={k} i={k} at={cs[k].at} text={cs[k].text} />)}
            </>
          ) : null}

          {more ? (
            <>
              <div className="upnext">{t('video.upnext')}</div>
              <Card
                i={at + 1}
                title={videoTitle(text.slice(endAt, endAt + 220), 90)}
                small
                onPlay={next}
              />
            </>
          ) : (
            <div className="done">{t('reader.end')}</div>
          )}
        </div>
      </div>
      <Tabbar items={TABS} active={0} />
    </Screen>
  );
}
