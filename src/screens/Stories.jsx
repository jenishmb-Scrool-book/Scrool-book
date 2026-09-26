import {useEffect, useRef, useState} from 'react';
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
import BookPics from '../ui/BookPic.jsx';
import Hit from '../ui/Hit.jsx';
import Resume from '../ui/Resume.jsx';

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
  const {chunks, pos, setPos, picsOf} = useChunks(SIZE.stories);
  const count = chunks.length;

  // Что показано — отдельно от места чтения. Тап слева листает показ назад,
  // а место остаётся: правило то же, что у прокрутки в остальных экранах
  // («листать назад можно, место сохраняется»). Раньше тап слева двигал
  // общий курсор назад — случайное касание левой половины, и клипы потом
  // начинались раньше, а пройденное заново засчитывалось в «Сегодня».
  // Тап справа сперва догоняет показ до места и только потом двигает место.
  const [view, setView] = useState(pos);
  // Место могли передвинуть не отсюда (оглавление, «Вернуться к месту») —
  // тогда показ встаёт на него.
  const seen = useRef(pos);
  useEffect(() => {
    if (pos !== seen.current) {
      seen.current = pos;
      setView(pos);
    }
  }, [pos]);
  const i = Math.min(Math.max(view, 0), Math.max(0, count - 1));
  const cur = chunks[i];
  const base = Math.floor(i / SEGS) * SEGS;
  const bars = Math.max(0, Math.min(SEGS, count - base));
  const last = i + 1 >= count;
  const away = i < pos;

  const prev = () => setView(v => Math.max(0, Math.min(v, pos) - 1));
  const next = () => {
    if (i < pos) setView(i + 1);
    else setPos(pos + 1);      // за последней — «дочитано», см. useChunks
  };

  return (
    <Screen id="stories" bar="#000000">
      <div className="stage" style={{background: shot('tall', i, grad(i))}}>
        <div className="bars">
          {Array.from({length: bars}, (unused, k) => (
            <span key={k} className={base + k <= i ? 'on' : ''} />
          ))}
        </div>
        <div className="shead">
          <div className="av sm" style={{background: shot('face', FACE, grad(i + 5))}} />
          <b>{current ? current.title : t('stories.title')}</b>
          <i>{msgTime(i)}</i>
          <span className="ic" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}><Glyph name="menu" /></span>
          <span className="back" onClick={back} role="button" aria-label={t('back')}><Glyph name="close" /></span>
        </div>
        <BookPics list={picsOf(i)} />
        <div className="stxt">{cur ? <Hit text={cur.text} at={cur.at} end={cur.end} /> : ''}</div>
        <div className="sfoot">
          {last ? t('reader.end') : t('stories.of', {i: i + 1, n: count})}
          <em>{t('stories.hint')}</em>
        </div>
        {/* Зоны тапа кладутся поверх текста: текст не интерактивен, а попадать
            по половине экрана надёжнее, чем по кнопке. */}
        <div className="zone left" onClick={prev} />
        <div className="zone right" onClick={next} />
      </div>
      <Resume away={away} onClick={() => setView(pos)} />
      <Progress offset={offset} len={text.length} go={go} float />
    </Screen>
  );
}
