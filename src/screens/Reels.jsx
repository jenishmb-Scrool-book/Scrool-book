import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {run} from '../ui/actions.js';
import {TABS} from '../ui/tabs.js';
import {grad, likes, comments, shares} from '../ui/visual.js';
import {shot} from '../ui/pics.js';

// «Клипы»: вертикальная лента на весь экран со snap'ом.
// Карточка ровно height:100% — иначе snap ловит середину и текст режется.
export default function Reels({go, back}) {
  const {text, offset} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.reels);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 2, cardSelector: '.reel'});
  const act = action => run(action, {go, boxRef, pos});

  return (
    <Screen id="reels" bar="#000000">
      <Progress offset={offset} len={text.length} float />
      <span className="back float" onClick={back} role="button" aria-label={t('back')}>‹</span>
      {/* Оглавление есть на всех шести движках, включая полноэкранные: прыжок
          через сорок страниц нужен ровно там, где книгу читают не подряд, и
          зависеть это не должно от того, какую обёртку человек выбрал. */}
      <span className="toc float" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}>☰</span>
      {/* Вкладки сверху: «Подписки» — выбрать, что смотреть, то есть
          оглавление; «Рекомендации» — вернуться туда, где читаешь. */}
      <div className="rtabs">
        <span role="button" onClick={() => go('toc')}>{t('reels.tab_subs')}</span>
        <span className="on" role="button" onClick={() => act('here')}>{t('reels.tab_feed')}</span>
      </div>
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="reel" key={i} data-i={i} style={{background: shot('tall', i, grad(i))}}>
            <div className="txt">{chunks[i].text}</div>
            <div className="cnt">{t('reels.handle')} · {t('reels.of', {i: i + 1, n: count})}</div>
            <div className="tag">{t('reels.tag')}</div>
            <div className="rail">
              ♥<small>{likes(i)}</small>
              ↩<small>{comments(i)}</small>
              ↗<small>{shares(i)}</small>
            </div>
          </div>
        ))}
      </div>
      <Tabbar items={TABS.reels} active={0} onPick={act} />
    </Screen>
  );
}
