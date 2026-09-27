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
import {run} from '../ui/actions.js';
import {TABS} from '../ui/tabs.js';
import {APP_NAMES} from '../ui/skins.js';
import {commentEmo, dur, grad, likes, videoTitle, views} from '../ui/visual.js';
import {FACE, shot} from '../ui/pics.js';
import {contactAt} from '../lib/fake.js';
import {indexAt} from '../lib/chunk.js';
import {minutesLeft} from '../lib/pace.js';
import Glyph from '../ui/Glyph.jsx';
import BookPics from '../ui/BookPic.jsx';
import Resume from '../ui/Resume.jsx';
import Hit from '../ui/Hit.jsx';

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

// Столько комментариев под роликом. Шесть по 200 знаков плюс описание на 600 —
// это ровно 1800, то есть условная страница из `lib/pages.js`. Один «ролик»
// получается одной страницей книги, а «Следующее видео» ведёт на следующую.
const COMMENTS = 6;

// Сколько ролика «просмотрено» — красная полоска на превью. От индекса, не от
// часов: число, меняющееся при перерисовке, читается как баг, а не как жизнь.
const seen = i => (i * 17) % 55 + 20;

/**
 * Название ролика, начинающегося с места `h`: [название, номер куска списка].
 *
 * Со списка в ролик приходят на начало куска — тогда название и есть этот
 * кусок. Но следующий ролик начинается с конца комментариев, то есть обычно
 * посреди куска списка, — тогда название — остаток этого куска. Раньше брался
 * весь кусок, и название повторяло последний, уже прочитанный комментарий, а
 * карточка «Следующее» обещала одно, открывалось другое.
 */
function titleFrom(ts, text, h) {
  let k = indexAt(ts, h);
  if (ts[k] && ts[k].end <= h) k += 1;
  const c = ts[k];
  if (!c) return [null, k];
  if (c.at >= h) return [c, k];
  let end = c.end;
  if (end - h < 40 && ts[k + 1]) end = ts[k + 1].end;
  return [{at: h, end, text: text.slice(h, end).replace(/\s+/g, ' ').trim()}, k];
}

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
function Card({i, title, here, pics, onPlay, onMenu, small}) {
  const t = useT();
  return (
    <div className={small ? 'vid small' : 'vid'} data-i={i} onClick={onPlay}>
      {/* Картинка из книги встаёт прямо в превью: рамка 16:9 здесь уже есть,
          а текста поверх неё нет — единственное место, где своя рамка была бы
          лишней. */}
      <div className="th" style={{background: shot('wide', i, grad(i))}}>
        <BookPics list={pics} cls="fill" one />
        <em>{dur(i)}</em>
        {here ? <b className="seen" style={{width: seen(i) + '%'}} /> : null}
      </div>
      <div className="vrow">
        <div className="ava" style={{background: shot('face', FACE, grad(i + 3))}} />
        <div className="vmeta">
          <div className="ti">{title}</div>
          <div className="meta">
            {t('video.meta', {views: views(i)})}{here ? t('video.here') : ''}
          </div>
        </div>
        {/* Меню карточки. Останавливаем всплытие: клик по самой карточке
            открывает ролик, и без этого «⋮» открывал бы его тоже. */}
        <span className="kebab" role="button" aria-label={t('toc.title')}
              onClick={e => { e.stopPropagation(); if (onMenu) onMenu(); }}><Glyph name="more" /></span>
      </div>
    </div>
  );
}

export default function Video({go, back}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos, eye, picsOf} = useChunks(SIZE.vlist);
  const count = chunks.length;
  // Дочитано — «тут остановился» на последнем ролике не нужен.
  const done = !!text.length && minutesLeft(offset, text.length) === 0;
  // Прокрутка списка двигает курсор: список названий сам стал способом читать.
  // До этого здесь стояло `trackPos: false` с доводом «листать список ≠ читать» —
  // он был верен ровно до того дня, когда в названиях появился текст книги.
  const {boxRef, items, away, toPos} = useCardWindow({count, pos, setPos, eye, ahead: 1, cardSelector: '.vid'});

  // Ролик впереди места — это чтение дальше: место едет к нему. Ролик
  // позади — перечитать: открываем его по параметру, а место не трогаем
  // (правило «назад место переносит только оглавление»). Раньше нажатие по
  // последнему ролику дочитанной книги возвращало «осталось 1 мин».
  const play = i => {
    if (i >= pos) {
      setPos(i);
      go('player');
    } else go('player', {arg: chunks[i].at});
  };
  const act = action => run(action, {go, boxRef, pos});
  // Какой чипс горит. Раньше «Все» горел всегда, что бы ни нажали.
  const [chip, setChip] = useState(0);

  return (
    <Screen id="video">
      <StatusBar />
      <div className="yhdr">
        <span className="back" onClick={back} role="button" aria-label={t('back')}><Glyph name="back" /></span>
        <b className="ylogo"><i><Glyph name="play" /></i>{APP_NAMES.video}</b>
        <span className="ic" onClick={() => act('find')} role="button"
              aria-label={t('video.search')}><Glyph name="search" /></span>
        <span className="ic" onClick={() => go('toc')} role="button"
              aria-label={t('toc.title')}><Glyph name="menu" /></span>
      </div>
      {/* Чипсы фильтров. Фильтровать в книге нечего, но у каждого нашлось
          своё честное дело: «Все» — к месту чтения, «Новое» — к первому
          непрочитанному ролику сразу за ним, название книги — в оглавление. */}
      <div className="chips">
        <span className={chip === 0 ? 'on' : undefined} role="button"
              onClick={() => {setChip(0); act('top');}}>{t('video.chip_all')}</span>
        <span className={chip === 1 ? 'on' : undefined} role="button"
              onClick={() => {setChip(1); run('here', {go, boxRef, pos: Math.min(pos + 1, count - 1)});}}>
          {t('video.chip_new')}
        </span>
        <span onClick={() => go('toc')} role="button">{t('video.channel')}</span>
      </div>
      <Progress offset={offset} len={text.length} go={go} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <Card key={i} i={i} here={i === pos && !done} pics={picsOf(i)}
                title={<Hit text={chunks[i].text} at={chunks[i].at} end={chunks[i].end} />}
                onPlay={() => play(i)} onMenu={() => go('toc')} />
        ))}
        {/* Конец книги — отметкой, как в переписке: без неё лента просто
            обрывалась, и было непонятно, дочитано или не догрузилось. */}
        {items.length && items[items.length - 1] === count - 1
          ? <div className="done">{t('reader.end')}</div> : null}
      </div>
      <Resume away={away} onClick={toPos} />
      <Tabbar items={TABS.video} active={0} onPick={act} />
    </Screen>
  );
}

/**
 * Один комментарий: тот же кусок книги, подписанный очередным человеком.
 *
 * Сердечко нажимается и держит своё состояние, пока экран открыт. Дальше не
 * хранится намеренно: это отметка на выдуманном комментарии, и переживать
 * перезапуск ей незачем — а вот не отзываться на нажатие она не имеет права.
 * «Ответить» открывает переписку с этим человеком: он же контакт из списка,
 * и ответить ему в этом приложении можно ровно там.
 */
function Comment({i, at, text, pics, onReply}) {
  const t = useT();
  const {ui} = useStore();
  const c = contactAt(i, ui.lang);
  const emo = commentEmo(i);
  const [liked, setLiked] = useState(false);
  return (
    <div className="cmt" data-at={at}>
      <div className="cav" style={{background: shot('face', i + 5, grad(i + 5))}} />
      <div className="cb">
        <div className="cu">{c.name}<span>{t('video.ago', {n: i % 8 + 1})}</span></div>
        <BookPics list={pics} />
        <div className="ct">{text}</div>
        <div className="ca">
          <span className={liked ? 'lk on' : 'lk'} role="button"
                onClick={() => setLiked(v => !v)}><Glyph name={liked ? 'heartFill' : 'heart'} /> {likes(i) + (liked ? 1 : 0)}</span>
          <span className="rep" role="button" onClick={onReply}>{t('video.reply')}</span>
          {/* Сердечко от автора канала — деталь, которую узнаёт каждый, кто
              вообще заглядывал в комментарии под роликами. */}
          {i % 5 === 2 ? <span className="heart"><Glyph name="heartFill" /></span> : null}
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
export function Player({go, back, arg}) {
  const {text, offset, setOffset} = useStore();
  const t = useT();
  const {chunks: ts, picsOf: tpics} = useChunks(SIZE.vlist);      // название — как в списке
  const {chunks: ds, picsOf: dpics} = useChunks(SIZE.video);      // описание — длинный кусок
  const {chunks: cs, picsOf: cpics} = useChunks(SIZE.comment);    // комментарии — короткие
  const boxRef = useRef(null);
  // С какого места ролик: из списка позади места — по параметру, иначе — место.
  const [head, setHead] = useState(() => (Number.isFinite(arg) && arg >= 0 ? arg : offset));
  // Курсор для обработчика прокрутки: он вешается один раз, а сравнивать
  // надо со свежим значением.
  const offRef = useRef(offset);
  offRef.current = offset;
  // Отметки под роликом. Живут, пока открыт экран: они ни на что не влияют,
  // но обязаны отзываться на нажатие — кнопка, которая не нажимается, ломает
  // обман вернее, чем кривой цвет.
  const [mark, setMark] = useState(0);        // 0 — нет, 1 — палец вверх, -1 — вниз
  const [subbed, setSubbed] = useState(false);

  // Название ролика — тот же кусок, что стоял названием в списке, по которому
  // нажали. Описание начинается СРАЗУ ПОСЛЕ него. Раньше заголовком было
  // первое предложение описания, а описание — кусок, в котором стоит курсор,
  // то есть начатый раньше него: одна фраза читалась трижды подряд — в
  // списке, в заголовке и в начале описания.
  const [title, ti] = titleFrom(ts, text, head);
  const from = title ? title.end : head;
  let at = indexAt(ds, from);
  if (ds[at] && ds[at].end <= from) at += 1;
  // Описание — от конца названия до конца куска описания. Куски не
  // переходят через абзац, и у книги с короткими абзацами описание вышло бы в
  // пару строк: добираем следующие, пока не наберётся хотя бы 400 знаков.
  let till = ds[at] ? ds[at].end : from;
  for (let k = at + 1; ds[k] && till - from < 400; k++) till = ds[k].end;
  // Конец описания — на границе комментария. Иначе кусок комментариев,
  // перекрывающий конец описания, пропускался целиком, и его хвост — одно-два
  // предложения — не показывался нигде: ни в описании, ни в комментариях.
  const j = indexAt(cs, till);
  if (cs[j] && cs[j].at < till && cs[j].end > till) till = cs[j].end;
  const desc = ds.length && till > from
    ? {at: from, end: till, text: text.slice(from, till).replace(/\s+/g, ' ').trim()}
    : null;
  at = Math.min(at, Math.max(0, ds.length - 1));

  // Первый комментарий берётся строго ПОСЛЕ описания (а без описания — после
  // названия): `indexAt` отдаёт кусок, которому смещение принадлежит, а он
  // начинается раньше, — и первый комментарий повторял бы уже прочитанное.
  // Без описания раньше бралось начало книги: на последнем ролике под
  // концом книги стояли её первые страницы.
  const after = desc ? desc.end : from;
  let first = indexAt(cs, after);
  if (cs[first] && cs[first].at < after) first += 1;

  const list = [];
  for (let k = 0; k < COMMENTS && first + k < cs.length; k++) list.push(first + k);
  const endAt = list.length ? cs[list[list.length - 1]].end : after;
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
        const all = box.querySelectorAll('.cmt');
        for (const el of all) {
          // `<=`, а не `<`: ▶ прокручивает ровно на эту отметку, и строгое
          // сравнение не засчитывало комментарий, к которому она привела, —
          // ▶ застревала на месте.
          // Запас в пару пикселей: на телефоне с дробной плотностью экрана
          // плавная прокрутка останавливается на долю пикселя раньше.
          if (el.offsetTop <= box.scrollTop + 62) last = el;
          else break;
        }
        // Докрутили до самого низа — на экране всё, что осталось: последние
        // комментарии до верха не доезжают никогда, и курсор до них не доходил.
        if (all.length && box.scrollTop + box.clientHeight >= box.scrollHeight - 2) last = all[all.length - 1];
        // Только вперёд — как везде (см. useCardWindow). Вернулся ко второму
        // комментарию перечитать — место остаётся на шестом: назад его
        // переносит только оглавление, то есть прямая просьба.
        const at = last ? Number(last.dataset.at) : -1;
        if (at > offRef.current) setOffset(at);
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
  //
  // Дальше книги нет — ▶ ставит «дочитано», а не листает: раньше следующей
  // «страницей» становилось начало книги, и место чтения уезжало туда.
  // Перечитывали прочитанное (ролик позади места) — страница листается, а
  // место стоит: назад его переносит только оглавление.
  const nextPage = () => {
    if (!more) {
      if (text.length - 1 > offRef.current) setOffset(text.length);
      return;
    }
    setHead(endAt);
    if (endAt > offRef.current) setOffset(endAt);
  };

  // Большая ▶ — первое, что нажимает любой человек. Раньше она сразу листала
  // страницу и пропускала непрочитанные комментарии (курсор ходит только
  // вперёд, так что они терялись насовсем). Теперь ▶ сперва ведёт к первому
  // непрочитанному комментарию, а когда их не осталось — к следующему ролику.
  const next = () => {
    const box = boxRef.current;
    // Страница докручена до низа — непрочитанного на ней нет, даже если
    // курсор ещё не успел доехать: дальше только следующий ролик.
    const bottom = box && box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    const unread = box && !bottom && [...box.querySelectorAll('.cmt')]
      .find(el => Number(el.dataset.at) > offRef.current);
    if (box && unread) {
      box.scrollTo({top: Math.max(0, unread.offsetTop - 60), behavior: 'smooth'});
      return;
    }
    nextPage();
  };

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [head]);

  return (
    <Screen id="player" bar="#000000">
      <StatusBar />
      {/* Картинка этой страницы книги лежит там же, где у ролика обложка, —
          в самом плеере. Второй раз в описании её показывать незачем. */}
      <div className="stage" style={{background: shot('wide', at, grad(at))}}>
        {/* Картинка названия, а если её нет — описания: название теперь
            отдельный кусок, и картинка, стоявшая в нём, иначе пропала бы. */}
        <BookPics list={title && tpics(ti).length ? tpics(ti) : dpics(at)} cls="fill" one />
        <span className="back" onClick={back} role="button" aria-label={t('back')}><Glyph name="back" /></span>
        <span className="ic" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}><Glyph name="menu" /></span>
        {/* Играть здесь нечему, но у обеих кнопок есть точный смысл в наших
            понятиях: «play» — читать дальше (следующая страница), «на весь
            экран» — та же книга в полноэкранной ленте клипов. Курсор общий,
            поэтому переход продолжает то же самое место. */}
        <span className="pl" role="button" aria-label={t('video.upnext')} onClick={next}><Glyph name="play" /></span>
        <div className="ctrl">
          <span className="tm">{elapsed(at)} / {dur(at)}</span>
          <i className="bar"><b style={{width: seen(at) + '%'}} /></i>
          <span className="full" role="button" aria-label={t('a11y.full')} onClick={() => go('reels')}>
            <Glyph name="full" />
          </span>
        </div>
      </div>
      <Progress offset={offset} len={text.length} go={go} />
      <div className="body" ref={boxRef}>
        <div className="vinfo">
          <h3>{title ? <Hit text={title.text} at={title.at} end={title.end} /> : ''}</h3>
          <div className="m">{t('video.views', {views: views(at)})}</div>
          {/* «Поделиться» и «Сохранить» отсюда убраны. Делиться в приложении
              без сети нечем, а «сохранить» ничего не сохраняло бы — это та же
              мёртвая кнопка, только с подписью. Осталось то, у чего есть
              честный ответ. */}
          <div className="vacts">
            <span className={mark === 1 ? 'on' : ''} role="button" aria-label={t('a11y.like')}
                  aria-pressed={mark === 1}
                  onClick={() => setMark(v => (v === 1 ? 0 : 1))}>
              <Glyph name="up" /> {likes(at) + (mark === 1 ? 1 : 0)}
            </span>
            <span className={mark === -1 ? 'on' : ''} role="button" aria-label={t('a11y.dislike')}
                  aria-pressed={mark === -1}
                  onClick={() => setMark(v => (v === -1 ? 0 : -1))}><Glyph name="down" /></span>
          </div>
          <div className="chan">
            <div className="ava" style={{background: shot('face', FACE, grad(at + 3))}} />
            <div className="ci">
              <b>{t('video.channel')}</b>
              <span>{t('video.subs')}</span>
            </div>
            <button className={subbed ? 'sub on' : 'sub'} onClick={() => setSubbed(v => !v)}>
              {t(subbed ? 'video.subscribed' : 'video.subscribe')}
            </button>
          </div>
          {/* Первая половина страницы. Блок раскрыт всегда: сворачивать то,
              ради чего экран существует, было бы издевательством. */}
          <div className="desc">
            <div className="dh">{t('video.desc')}</div>
            <div className="dtxt">{desc ? <Hit text={desc.text} at={desc.at} end={desc.end} /> : ''}</div>
          </div>

          {/* Вторая половина — в комментариях. Читается тем же движением, что и
              всё остальное: просто прокруткой вниз. */}
          {list.length ? (
            <>
              <div className="chead">{t('video.comments')}<i>{list.length}</i></div>
              {/* Написать комментарий здесь нечем и некому — строка ведёт
                  туда, где в этом приложении «пишут»: в переписку. */}
              <div className="cadd" role="button" onClick={() => go('chat')}>
                <div className="cav me"><Glyph name="smile" /></div>
                <span>{t('video.add_comment')}</span>
              </div>
              {list.map(k => (
                <Comment key={k} i={k} at={cs[k].at}
                         text={<Hit text={cs[k].text} at={cs[k].at} end={cs[k].end} />} pics={cpics(k)}
                         onReply={() => go('chat', {arg: k})} />
              ))}
            </>
          ) : null}

          {more ? (
            <>
              <div className="upnext">{t('video.upnext')}</div>
              <Card
                i={at + 1}
                title={(titleFrom(ts, text, endAt)[0] || {text: ''}).text}
                small
                onPlay={nextPage}
                onMenu={() => go('toc')}
              />
            </>
          ) : (
            <div className="done">{t('reader.end')}</div>
          )}
        </div>
      </div>
      <Tabbar items={TABS.video} active={0} onPick={action => run(action, {go, boxRef, pos: at})} />
    </Screen>
  );
}
