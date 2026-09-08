import {useMemo} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress from '../ui/Progress.jsx';
import {pageAt} from '../lib/pages.js';
import Glyph from '../ui/Glyph.jsx';

// Оглавление — единственный экран, который не притворяется чужим приложением.
// И правильно: перепрыгнуть на сорок страниц вперёд в мессенджере нечем, а
// нужно это ровно тогда, когда книгу читают не подряд.
//
// Переход ставит курсор на начало главы, и дальше он общий, как везде: прыгнул
// из оглавления — и продолжаешь в клипах ровно оттуда.
export default function Chapters({go, back}) {
  const {chapters, text, offset, setOffset, lastApp} = useStore();
  const t = useT();
  const len = text.length;
  const backTo = lastApp || 'reels';

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
      <Progress offset={offset} len={len} />
      <div className="body">
        {chapters.length ? chapters.map((c, i) => (
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
        )) : (
          <div className="hint">{t('toc.empty')}</div>
        )}
      </div>
    </Screen>
  );
}
