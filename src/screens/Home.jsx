import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import {percent} from '../ui/Progress.jsx';

// Сетка «как на телефоне»: часть иконок ведёт в те же экраны — это часть обмана.
const APPS = [
  ['💬', 'Чаты', 'chats', 'linear-gradient(145deg,#2ea36f,#0f7a4d)'],
  ['🎬', 'Клипы', 'reels', 'linear-gradient(145deg,#ff2d55,#7c5cff)'],
  ['📷', 'Лента', 'feed', 'linear-gradient(145deg,#f9a03f,#d62976 60%,#7c5cff)'],
  ['▶️', 'Видео', 'video', 'linear-gradient(145deg,#ff4b4b,#a10f0f)'],
  ['📚', 'Книги', 'library', '#2a2a3a'],
  ['⚙️', 'Настройки', 'library', '#33333f'],
  ['🔔', 'Уведомления', 'chats', 'linear-gradient(145deg,#4a90d9,#1f4f8f)'],
  ['🔥', 'Стрик', 'reels', 'linear-gradient(145deg,#ff8a00,#e52e71)']
];

const DOCK = [
  ['📚', 'Библиотека', 'library', '#2a2a3a'],
  ['🎬', 'Клипы', 'reels', 'linear-gradient(145deg,#ff2d55,#7c5cff)'],
  ['💬', 'Чаты', 'chats', 'linear-gradient(145deg,#2ea36f,#0f7a4d)']
];

function Icon({glyph, label, background, onClick}) {
  return (
    <div className="icon" onClick={onClick}>
      <b style={{background}}>{glyph}</b>
      <span>{label}</span>
    </div>
  );
}

export default function Home({go}) {
  const {current, chunks, pos, lastApp} = useStore();
  const width = percent(pos, chunks.length).toFixed(1) + '%';

  // «Продолжить» уводит туда, где читали в прошлый раз. Нет книги — в библиотеку.
  const cont = () => go(chunks.length ? (lastApp || 'reels') : 'library');

  return (
    <Screen id="home">
      <StatusBar />
      <div className="widget">
        <div className="t">Читаешь сейчас</div>
        <div className="n">{current ? current.title : 'Нет текста — добавь в библиотеке'}</div>
        <div className="bar"><i style={{width}} /></div>
        <button onClick={cont}>Продолжить</button>
      </div>
      <div className="grid">
        {APPS.map(([glyph, label, to, background], k) => (
          <Icon key={k} glyph={glyph} label={label} background={background} onClick={() => go(to)} />
        ))}
      </div>
      <div className="dock">
        {DOCK.map(([glyph, label, to, background]) => (
          <Icon key={to} glyph={glyph} label={label} background={background} onClick={() => go(to)} />
        ))}
      </div>
    </Screen>
  );
}
