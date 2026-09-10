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
import {grad, likes, comments, shares, views} from '../ui/visual.js';
import {FACE, shot} from '../ui/pics.js';
import {APP_NAMES} from '../ui/skins.js';
import {msgTime} from '../lib/fake.js';
import Glyph from '../ui/Glyph.jsx';
import BookPics from '../ui/BookPic.jsx';
import Resume from '../ui/Resume.jsx';

// «Короткие посты»: самый мелкий фрагмент из всех движков.
// Здесь книга выглядит как лента реплик — по паре предложений на пост, и
// пролистывается заметно быстрее, чем та же книга в «видео» с кусками по 600.
export default function Tweets({go, back}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos, eye, picsOf} = useChunks(SIZE.tweets);
  const count = chunks.length;
  const {boxRef, items, away, toPos} = useCardWindow({count, pos, setPos, eye, ahead: 1, cardSelector: '.tw'});
  const act = action => run(action, {go, boxRef, pos});

  return (
    <Screen id="tweets">
      <StatusBar />
      <div className="thdr">
        <span className="back" onClick={back} role="button" aria-label={t('back')}><Glyph name="back" /></span>
        <h2>{APP_NAMES.tweets}</h2>
        <span className="ic" onClick={() => go('toc')} role="button"
              aria-label={t('toc.title')}><Glyph name="menu" /></span>
      </div>
      {/* «Для вас» — к тому месту, где читаешь; «Подписки» — оглавление. */}
      <div className="tabs">
        <span className="on" role="button" onClick={() => act('here')}>{t('tw.tab_feed')}</span>
        <span role="button" onClick={() => go('toc')}>{t('tw.tab_subs')}</span>
      </div>
      <Progress offset={offset} len={text.length} go={go} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="tw" key={i} data-i={i}>
            <div className="av" style={{background: shot('face', FACE, grad(i))}} />
            <div className="tb">
              <div className="tu">
                <b>{t('tw.name')}</b>
                <span>{t('tw.handle')} · {msgTime(i)}</span>
              </div>
              {/* Над текстом, а не под ним, как принято в этой ленте: в книге
                  картинка стояла перед абзацем, и порядок чтения важнее привычки. */}
              <BookPics list={picsOf(i)} />
              <div className="tt">{chunks[i].text}</div>
              <div className="ta">
                <span><Glyph name="comment" /> {comments(i)}</span>
                <span><Glyph name="repost" /> {shares(i)}</span>
                <span><Glyph name="heart" /> {likes(i)}</span>
                <span><Glyph name="views" /> {t('tw.views', {n: views(i)})}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Resume away={away} onClick={toPos} />
      <Tabbar items={TABS.tweets} active={0} onPick={act} />
    </Screen>
  );
}
