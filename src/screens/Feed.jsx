import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, marks} from '../ui/visual.js';
import {FACE, shot} from '../ui/pics.js';
import {APP_NAMES} from '../ui/skins.js';
import {NAMES} from '../lib/fake.js';

// Нижняя панель. Подписей нет — их нет и в оригинале, а панель с лишними
// словами читается как чужая.
const TABS = [['⌂', null], ['⌕', null], ['＋', null], ['♡', null], ['☺', null]];

// «Лента»: те же куски постами. Текст лежит ровно на месте картинки —
// в этом весь фокус, картинки тут нет вообще.
export default function Feed({go}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.feed);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 1, cardSelector: '.post'});

  return (
    <Screen id="feed">
      <StatusBar />
      <div className="fhdr">
        <span className="back" onClick={() => go('home')} role="button" aria-label={t('back')}>‹</span>
        <b className="flogo">{APP_NAMES.feed}</b>
        <span className="ic">♡</span>
        <span className="ic" onClick={() => go('toc')} role="button"
              aria-label={t('toc.title')}>☰</span>
      </div>
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {/* Полоса «историй» над лентой. Она декоративна и не нажимается: её
            задача — чтобы экран узнавался с первого взгляда, а не открывался. */}
        <div className="srow">
          {NAMES.slice(0, 6).map((name, k) => (
            <div className="sitem" key={k}>
              <div className="ring" style={{background: grad(k * 7 + 2)}}>
                <i style={{background: shot('face', k * 11 + 3, grad(k))}} />
              </div>
              <span>{k === 0 ? t('feed.your_story') : name}</span>
            </div>
          ))}
        </div>
        {items.map(i => (
          <div className="post" key={i} data-i={i}>
            <div className="u">
              <div className="av" style={{background: shot('face', FACE, grad(i))}} />
              {t('feed.author')}
            </div>
            {/* Текст лежит поверх снимка, а не вместо него. Затемнение под ним
                обязательно: на светлом кадре белые буквы иначе пропадают. */}
            <div className="pic" style={{background: shot('post', i, grad(i + 3))}}>
              <span>{chunks[i].text}</span>
            </div>
            <div className="acts">♡ ⌯ ↗</div>
            <div className="cap likes">{t('feed.likes', {n: marks(i)})}</div>
            <div className="cap">{t('feed.caption', {marks: marks(i), i: i + 1, n: count})}</div>
          </div>
        ))}
      </div>
      <Tabbar items={TABS} active={0} />
    </Screen>
  );
}
