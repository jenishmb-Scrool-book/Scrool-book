import {useLayoutEffect, useRef} from 'react';
import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Progress from '../ui/Progress.jsx';

const AVATAR = {
  width: 34, height: 34, borderRadius: '50%',
  background: 'linear-gradient(145deg,#7c5cff,#ff2d55)'
};

const clock = () => {
  const d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
};

// «Чаты»: прочитанное лежит перепиской. Показываем хвост в 15 пузырей
// (от pos-14 до pos), дальше двигаем курсор кнопкой — здесь скролл не листает.
export default function Chats({go}) {
  const {current, chunks, pos, setPos} = useStore();
  const boxRef = useRef(null);
  const from = Math.max(0, pos - 14);
  const time = clock();

  // Лента сообщений всегда прижата к низу — новое сообщение должно быть видно.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [pos]);

  return (
    <Screen id="chats">
      <StatusBar />
      <Header
        onBack={() => go('home')}
        title={current ? current.title : 'Книга'}
        left={<div style={AVATAR} />}
        right={<span style={{opacity: .5}}>⋮</span>}
      />
      <Progress pos={pos} count={chunks.length} />
      <div className="body" ref={boxRef}>
        {chunks.slice(from, pos + 1).map((c, k) => (
          <div className="msg" key={from + k}>
            {c}
            <span className="t">{time}</span>
          </div>
        ))}
        {pos + 1 < chunks.length
          ? <button className="next" onClick={() => setPos(pos + 1)}>Дальше ↓</button>
          : <div className="done">Конец текста</div>}
      </div>
    </Screen>
  );
}
