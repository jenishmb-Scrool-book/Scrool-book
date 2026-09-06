import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import Progress from '../ui/Progress.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, likes, comments, shares} from '../ui/visual.js';

// «Клипы»: вертикальная лента на весь экран со snap'ом.
// Карточка ровно height:100% — иначе snap ловит середину и текст режется.
export default function Reels({go}) {
  const {text, offset} = useStore();
  const {chunks, pos, setPos} = useChunks(SIZE.reels);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 2, cardSelector: '.reel'});

  return (
    <Screen id="reels">
      <Progress offset={offset} len={text.length} float />
      <span className="back float" onClick={() => go('home')} role="button" aria-label="Назад">‹</span>
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="reel" key={i} data-i={i} style={{background: grad(i)}}>
            <div className="txt">{chunks[i].text}</div>
            <div className="cnt">@книга · {i + 1} из {count}</div>
            <div className="rail">
              ❤️<small>{likes(i)}</small>
              💬<small>{comments(i)}</small>
              ↗<small>{shares(i)}</small>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
