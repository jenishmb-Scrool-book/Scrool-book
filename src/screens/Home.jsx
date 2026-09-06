import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import {percent} from '../ui/Progress.jsx';
import {getWallpaper} from '../wallpaper.js';

// Сетка «как на телефоне»: часть иконок ведёт в те же экраны — это часть обмана.
//
// Названия намеренно искажённые. Настоящие бренды здесь нельзя: это чужие
// товарные знаки, и Google Play такое приложение снимет с публикации.
// Узнаваемость даёт вёрстка и расположение, а не буквы в названии.
const APPS = [
  ['✈️', 'Telegran', 'chats', 'linear-gradient(145deg,#41b6e6,#1d7fb8)'],
  ['💬', 'Whhatsapp', 'chats', 'linear-gradient(145deg,#4ee07f,#0f7a4d)'],
  ['📷', 'IInstagram', 'feed', 'linear-gradient(145deg,#f9a03f,#d62976 60%,#7c5cff)'],
  ['🎵', 'TikTak', 'reels', 'linear-gradient(145deg,#ff2d55,#26f4ee 140%)'],
  ['▶️', 'YuoTube', 'video', 'linear-gradient(145deg,#ff4b4b,#a10f0f)'],
  ['💌', 'Massenger', 'chats', 'linear-gradient(145deg,#b06cff,#0084ff)'],
  ['👻', 'Snapchart', 'reels', 'linear-gradient(145deg,#fffc00,#e0c000)'],
  ['🐦', 'Tvitter', 'feed', 'linear-gradient(145deg,#5aa9e6,#1b6ca8)']
];

const DOCK = [
  ['📚', 'Книги', 'library', '#2a2a3a'],
  ['🎵', 'TikTak', 'reels', 'linear-gradient(145deg,#ff2d55,#26f4ee 140%)'],
  ['💬', 'Whhatsapp', 'chats', 'linear-gradient(145deg,#4ee07f,#0f7a4d)'],
  ['⚙️', 'Настройки', 'library', '#33333f']
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
  const [wall, setWall] = useState('');
  const width = percent(pos, chunks.length).toFixed(1) + '%';

  // Обои читаются один раз за сессию — дальше отдаёт кеш в wallpaper.js.
  useEffect(() => {
    let live = true;
    getWallpaper().then(w => live && setWall(w)).catch(() => {});
    return () => {live = false;};
  }, []);

  // «Продолжить» уводит туда, где читали в прошлый раз. Нет книги — в библиотеку.
  const cont = () => go(chunks.length ? (lastApp || 'reels') : 'library');

  return (
    <Screen id="home">
      {/* Затемняющая накладка обязательна: обои — произвольное фото пользователя,
          и без неё белые подписи иконок на светлой картинке пропадают. */}
      {wall ? <div className="wall" style={{backgroundImage: `url(${wall})`}} /> : null}
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
        {DOCK.map(([glyph, label, to, background], k) => (
          <Icon key={k} glyph={glyph} label={label} background={background} onClick={() => go(to)} />
        ))}
      </div>
    </Screen>
  );
}
