import {useLayoutEffect, useMemo} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {reelSize} from '../ui/sizes.js';
import {run} from '../ui/actions.js';
import {TABS} from '../ui/tabs.js';
import {grad, likes, comments, shares} from '../ui/visual.js';
import {shot} from '../ui/pics.js';
import Glyph from '../ui/Glyph.jsx';
import BookPics from '../ui/BookPic.jsx';
import Hit from '../ui/Hit.jsx';
import Resume from '../ui/Resume.jsx';
import Like, {useLike} from '../ui/Like.jsx';

/**
 * Правая колонка клипа. Сердечко нажимается, «комментарии» ведут в
 * переписку — туда, где в этом приложении «пишут», как «Написать
 * комментарий» под роликом. «Поделиться» ждёт решения: без сети честного
 * ответа у него нет.
 */
function Rail({i, go}) {
  const t = useT();
  const [on, toggle] = useLike();
  return (
    <div className="rail">
      <Like on={on} onToggle={toggle} empty="heartFill"><small>{likes(i) + (on ? 1 : 0)}</small></Like>
      <span role="button" aria-label={t('a11y.comment')} onClick={() => go('chat', {arg: i})}>
        <Glyph name="comment" /><small>{comments(i)}</small>
      </span>
      <span><Glyph name="share" /><small>{shares(i)}</small></span>
    </div>
  );
}

// «Клипы»: вертикальная лента на весь экран со snap'ом.
// Карточка ровно height:100% — иначе snap ловит середину и текст режется.
export default function Reels({go, back}) {
  const {text, offset, ui} = useStore();
  const t = useT();
  // Кусок — под экран и кегль: клип обязан поместиться целиком (см. reelSize).
  const size = useMemo(() => reelSize(ui.font, window.innerWidth, window.innerHeight), [ui.font]);
  const {chunks, pos, setPos, eye, picsOf} = useChunks(size);
  const count = chunks.length;
  const {boxRef, items, away, toPos} = useCardWindow({count, pos, setPos, eye, ahead: 2, cardSelector: '.reel'});

  // Одно предложение длиннее куска резать нельзя, и такое всё равно не
  // влезает в карточку. Ему — кегль на ступень меньше: мельче, зато целиком,
  // без невидимой прокрутки внутри клипа. Меряем до того, как кадр нарисован.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    for (const el of box.querySelectorAll('.reel .txt')) {
      el.classList.remove('fit');
      if (el.scrollHeight > el.clientHeight + 1) el.classList.add('fit');
    }
  }, [items, size, boxRef]);
  const act = action => run(action, {go, boxRef, pos});

  return (
    <Screen id="reels" bar="#000000">
      <Progress offset={offset} len={text.length} go={go} float />
      <span className="back float" onClick={back} role="button" aria-label={t('back')}><Glyph name="back" /></span>
      {/* Оглавление есть на всех шести движках, включая полноэкранные: прыжок
          через сорок страниц нужен ровно там, где книгу читают не подряд, и
          зависеть это не должно от того, какую обёртку человек выбрал. */}
      <span className="toc float" onClick={() => go('toc')} role="button" aria-label={t('toc.title')}><Glyph name="menu" /></span>
      {/* Вкладки сверху: «Подписки» — выбрать, что смотреть, то есть
          оглавление; «Рекомендации» — вернуться туда, где читаешь. */}
      <div className="rtabs">
        <span role="button" onClick={() => go('toc')}>{t('reels.tab_subs')}</span>
        <span className="on" role="button" onClick={() => act('here')}>{t('reels.tab_feed')}</span>
      </div>
      <div className="body" ref={boxRef}>
        {items.map(i => (
          /* Карточка с картинкой из книги отдаёт ей верх экрана, а тексту
             оставляет низ: `haspic` подрезает его высоту, иначе длинный
             фрагмент выдавил бы картинку за кромку. */
          <div className={picsOf(i).length ? 'reel haspic' : 'reel'} key={i} data-i={i}
               style={{background: shot('tall', i, grad(i))}}>
            <BookPics list={picsOf(i)} />
            <div className="txt"><Hit text={chunks[i].text} at={chunks[i].at} end={chunks[i].end} /></div>
            <div className="cnt">
              {t('reels.handle')} · {i === count - 1 ? t('reader.end') : t('reels.of', {i: i + 1, n: count})}
            </div>
            <div className="tag">{t('reels.tag')}</div>
            <Rail i={i} go={go} />
          </div>
        ))}
      </div>
      <Resume away={away} onClick={toPos} />
      <Tabbar items={TABS.reels} active={0} onPick={act} />
    </Screen>
  );
}
