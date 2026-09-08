import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import Progress from '../ui/Progress.jsx';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad} from '../ui/visual.js';
import {FACE, shot} from '../ui/pics.js';
import {msgTime} from '../lib/fake.js';
import Glyph from '../ui/Glyph.jsx';

// «Истории»: карточка на весь экран, вперёд — тап по правой половине, назад — по левой.
//
// Это шестой движок, и он отличается от «Клипов» не палитрой, а способом
// листания: скролла здесь нет вообще. Разница ощущается сразу — в клипах текст
// уезжает под пальцем, здесь сменяется щелчком. Для короткого фрагмента это
// быстрее, и рука не занята.
const SEGS = 6;   // столько полосок сверху, как в одной «серии» историй

export default function Stories({go, back}) {
  const {current, text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.stories);
  const count = chunks.length;
  const cur = chunks[pos];
  const base = Math.floor(pos / SEGS) * SEGS;
  const bars = Math.max(0, Math.min(SEGS, count - base));
  const last = pos + 1 >= count;

  return (
    <Screen id="stories" bar="#000000">
      <div className="stage" style={{background: shot('tall', pos, grad(pos))}}>
        <div className="bars">
          {Array.from({length: bars}, (unused, k) => (
            <span key={k} className={base + k <= pos ? 'on' : ''} />
          ))}
        </div>
        <div className="shead">
          <div className="av sm" style={{background: shot('face', FACE, grad(pos + 5))}} />
          <b>{current ? current.title : t('stories.title')}</b>
          <i>{msgTime(pos)}</i>
          <span className="ic" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}><Glyph name="menu" /></span>
          <span className="back" onClick={back} role="button" aria-label={t('back')}>✕</span>
        </div>
        <div className="stxt">{cur ? cur.text : ''}</div>
        <div className="sfoot">
          {last ? t('reader.end') : t('stories.of', {i: pos + 1, n: count})}
          <em>{t('stories.hint')}</em>
        </div>
        {/* Зоны тапа кладутся поверх текста: текст не интерактивен, а попадать
            по половине экрана надёжнее, чем по кнопке. */}
        <div className="zone left" onClick={() => setPos(pos - 1)} />
        <div className="zone right" onClick={() => setPos(pos + 1)} />
      </div>
      <Progress offset={offset} len={text.length} go={go} float />
    </Screen>
  );
}
