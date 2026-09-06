import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, likes, comments, shares, views} from '../ui/visual.js';
import {msgTime} from '../lib/fake.js';

// «Короткие посты»: самый мелкий фрагмент из всех движков.
// Здесь книга выглядит как лента реплик — по паре предложений на пост, и
// пролистывается заметно быстрее, чем та же книга в «видео» с кусками по 600.
export default function Tweets({go}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.tweets);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 1, cardSelector: '.tw'});

  return (
    <Screen id="tweets">
      <StatusBar />
      <div className="thdr">
        <span className="back" onClick={() => go('home')} role="button" aria-label={t('back')}>‹</span>
        <h2>{t('tw.title')}</h2>
        <span className="ic" onClick={() => go('toc')} role="button">☰</span>
      </div>
      <div className="tabs">
        <span className="on">{t('tw.tab_feed')}</span>
        <span>{t('tw.tab_subs')}</span>
      </div>
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="tw" key={i} data-i={i}>
            <div className="av" style={{background: grad(i)}}>📖</div>
            <div className="tb">
              <div className="tu">
                <b>{t('tw.name')}</b>
                <span>{t('tw.handle')} · {msgTime(i)}</span>
              </div>
              <div className="tt">{chunks[i].text}</div>
              <div className="ta">
                <span>💬 {comments(i)}</span>
                <span>🔁 {shares(i)}</span>
                <span>♡ {likes(i)}</span>
                <span>📊 {t('tw.views', {n: views(i)})}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
