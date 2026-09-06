import {useLayoutEffect, useRef} from 'react';
import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress from '../ui/Progress.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, views} from '../ui/visual.js';

/**
 * «Видео» — список роликов.
 * Здесь скролл курсор НЕ двигает: листать список ≠ читать. Курсор двигает
 * только открытие ролика. Поэтому trackPos: false.
 */
export default function Video({go}) {
  const {text, offset} = useStore();
  const {chunks, pos, setPos} = useChunks(SIZE.video);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({
    count, pos, setPos, ahead: 1, cardSelector: '.vid', trackPos: false
  });

  const play = i => {
    setPos(i);
    go('player');
  };

  return (
    <Screen id="video">
      <StatusBar />
      <Header onBack={() => go('home')} title="Видео" />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {items.map(i => (
          <div className="vid" key={i} data-i={i} onClick={() => play(i)}>
            <div className="th" style={{background: grad(i)}}>▶</div>
            <div>
              <div className="ti">{chunks[i].text.slice(0, 70)}{chunks[i].text.length > 70 ? '…' : ''}</div>
              <div className="meta">
                книга · {views(i)} тыс. просмотров{i === pos ? ' · тут остановился' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// Плеер показывает кусок, на котором стоит курсор: открытие ролика курсор и выставило.
export function Player({go}) {
  const {text, offset} = useStore();
  const {chunks, pos, setPos} = useChunks(SIZE.video);
  const count = chunks.length;
  const boxRef = useRef(null);
  const cur = chunks[pos];

  // Переключились на следующий ролик — смотрим его сверху.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = 0;
  }, [pos]);

  return (
    <Screen id="player">
      <StatusBar />
      <Header onBack={() => go('video')} title="Смотрим" />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="stage" style={{background: grad(pos)}}>
          <div>{cur ? cur.text : ''}</div>
        </div>
        <div className="info">
          <h3>Фрагмент {pos + 1} из {count}</h3>
          <div className="m">{views(pos)} тыс. просмотров · сегодня</div>
          {pos + 1 < count
            ? <button className="next" onClick={() => setPos(pos + 1)}>Следующее ▶</button>
            : <div className="done">Конец текста</div>}
        </div>
      </div>
    </Screen>
  );
}
