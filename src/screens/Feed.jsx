import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress from '../ui/Progress.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, marks} from '../ui/visual.js';

// «Лента»: те же куски постами. Текст лежит ровно на месте картинки —
// в этом весь фокус, картинки тут нет вообще.
export default function Feed({go}) {
  const {text, offset} = useStore();
  const {chunks, pos, setPos} = useChunks(SIZE.feed);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 1, cardSelector: '.post'});

  return (
    <Screen id="feed">
      <StatusBar />
      <Header onBack={() => go('home')} title="Лента" />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="post" key={i} data-i={i}>
            <div className="u">
              <div className="av" style={{background: grad(i)}} />
              книга.дня
            </div>
            <div className="pic" style={{background: grad(i + 3)}}>{chunks[i].text}</div>
            <div className="acts">♡ ⌯ ↗</div>
            <div className="cap">{marks(i)} отметок · фрагмент {i + 1} из {count}</div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
