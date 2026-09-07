import {useLayoutEffect, useRef} from 'react';
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
import {dur, grad, likes, videoTitle, views} from '../ui/visual.js';

// «Видео» — список роликов и страница ролика.
//
// Главная правка Этапа 5. Раньше кусок книги на 600 знаков лежал ВНУТРИ
// плеера — в коробке 16:9, которая на телефоне высотой чуть больше двухсот
// пикселей, со своей прокруткой. Читать там было нельзя, и владелец сказал
// прямо: «пусть текст будет просто в описаниях видео, а не внутри их».
//
// Теперь так и есть: над экраном стоит плеер (пустой, как ему и положено), а
// текст лежит в описании под ним и прокручивается вместе со всей страницей.
// Заодно это честнее по смыслу: описание — единственное место в таком
// приложении, где длинный текст вообще уместен.
//
// Скролл здесь курсор НЕ двигает: листать список ≠ читать. Курсор двигает
// только открытие ролика.

// Нижняя панель. Значки декоративны, как чипсы фильтров.
const TABS = [
  ['⌂', 'video.tab_home'],
  ['⊳', 'video.tab_shorts'],
  ['＋', null],
  ['⊞', 'video.tab_subs'],
  ['☺', 'video.tab_you']
];

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
 * Карточка ролика. Одна и та же в списке и в блоке «Следующее» — там она
 * тоже должна быть карточкой, а не кнопкой: кнопка «Следующее ▶» была
 * последним местом, где экран переставал притворяться видеосервисом.
 */
function Card({i, text, here, onPlay, small}) {
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
          <div className="ti">{videoTitle(text)}</div>
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
  const {chunks, pos, setPos} = useChunks(SIZE.video);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({
    count, pos, setPos, ahead: 1, cardSelector: '.vid', trackPos: false
  });

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
          <Card key={i} i={i} text={chunks[i].text} here={i === pos} onPlay={() => play(i)} />
        ))}
      </div>
      <Tabbar items={TABS} active={0} />
    </Screen>
  );
}

/**
 * Страница ролика. Показывает кусок, на котором стоит курсор: открытие ролика
 * курсор и выставило.
 *
 * Читают здесь ОПИСАНИЕ. Плеер над ним пустой намеренно — в него ничего не
 * помещается, и попытка засунуть туда текст и была тем, что не работало.
 */
export function Player({go}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.video);
  const count = chunks.length;
  const boxRef = useRef(null);
  const cur = chunks[pos];
  const next = pos + 1 < count ? pos + 1 : -1;

  // Переключились на следующий ролик — смотрим его сверху.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [pos]);

  return (
    <Screen id="player">
      <StatusBar />
      <div className="stage" style={{background: grad(pos)}}>
        <span className="back" onClick={() => go('video')} role="button" aria-label={t('back')}>‹</span>
        <span className="ic" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}>☰</span>
        <span className="pl">▶</span>
        <div className="ctrl">
          <span className="tm">{elapsed(pos)} / {dur(pos)}</span>
          <i className="bar"><b style={{width: seen(pos) + '%'}} /></i>
          <span className="full">⛶</span>
        </div>
      </div>
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="vinfo">
          <h3>{cur ? videoTitle(cur.text, 90) : ''}</h3>
          <div className="m">{t('video.views', {views: views(pos)})}</div>
          <div className="vacts">
            <span>👍 {likes(pos)}</span>
            <span>👎</span>
            <span>↪ {t('video.share')}</span>
            <span>⤓ {t('video.save')}</span>
          </div>
          <div className="chan">
            <div className="ava" style={{background: grad(pos + 3)}}>📖</div>
            <div className="ci">
              <b>{t('video.channel')}</b>
              <span>{t('video.subs')}</span>
            </div>
            <button className="sub">{t('video.subscribe')}</button>
          </div>
          {/* Вот здесь и лежит книга. Блок раскрыт всегда: сворачивать
              единственное, ради чего экран существует, было бы издевательством. */}
          <div className="desc">
            <div className="dh">{t('video.desc')} · {t('video.fragment', {i: pos + 1, n: count})}</div>
            <div className="dtxt">{cur ? cur.text : ''}</div>
          </div>
          {next >= 0 ? (
            <>
              <div className="upnext">{t('video.upnext')}</div>
              <Card i={next} text={chunks[next].text} small onPlay={() => setPos(next)} />
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
