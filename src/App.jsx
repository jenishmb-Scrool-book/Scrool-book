import {useEffect, useRef, useState} from 'react';
import {useStore} from './store.jsx';
import {initNative} from './native.js';
import {SEED, SEED_TITLE} from './seed.js';
import Home from './screens/Home.jsx';
import Chats from './screens/Chats.jsx';
import Reels from './screens/Reels.jsx';
import Feed from './screens/Feed.jsx';
import Video, {Player} from './screens/Video.jsx';
import Library from './screens/Library.jsx';

const SCREENS = {home: Home, chats: Chats, reels: Reels, feed: Feed, video: Video, player: Player, library: Library};
const READERS = ['chats', 'reels', 'feed', 'video'];  // эти запоминаются как lastApp
const NO_BOOK_OK = ['home', 'library'];               // этим двум книга не нужна

export default function App() {
  const {ready, books, chunks, addBook, setLastApp, error} = useStore();
  const [screen, setScreen] = useState('home');

  // Первый запуск: вместо пустого экрана подкладываем текст, объясняющий механику.
  // Живёт здесь, а не в сторе: это онбординг, а не хранилище.
  const seeded = useRef(false);
  useEffect(() => {
    if (!ready || books.length || seeded.current) return;
    seeded.current = true;   // одна попытка: если запись не удалась, не зацикливаемся
    addBook(SEED_TITLE, SEED);
  }, [ready, books.length, addBook]);

  // Рефы, чтобы обработчик аппаратной «назад» видел свежее состояние,
  // не переподписываясь на каждый рендер.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const go = id => {
    // Читать нечего — вместо пустого экрана уводим в библиотеку.
    if (!NO_BOOK_OK.includes(id) && !chunksRef.current.length) id = 'library';
    if (READERS.includes(id)) setLastApp(id);
    setScreen(id);
  };

  useEffect(() => {
    let off;
    let dead = false;
    // С любого экрана «назад» возвращает домой; с дома — false, приложение сворачивается.
    const onBack = () => {
      if (screenRef.current === 'home') return false;
      setScreen('home');
      return true;
    };
    Promise.resolve(initNative({onBack}))
      .then(r => {
        // Контракт обещает Promise<void>; если реализация всё же вернёт отписку — снимем её.
        if (dead) { if (typeof r === 'function') r(); return; }
        off = r;
      })
      .catch(() => {});
    return () => {
      dead = true;
      if (typeof off === 'function') off();
    };
  }, []);

  // Пока хранилище не прогидрировано — chunks трогать нельзя.
  if (!ready) {
    return (
      <div id="phone">
        <div className="screen on"><div className="boot">Загрузка…</div></div>
      </div>
    );
  }

  const Current = SCREENS[screen] || Home;
  return (
    <div id="phone">
      <Current go={go} />
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
