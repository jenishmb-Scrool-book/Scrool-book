import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useStore} from './store.jsx';
import {initNative, setBarColor} from './native.js';
import {isLight, rgbOf} from './ui/color.js';
import {SEED, SEED_TITLE} from './seed.js';
import {DICT} from './i18n.js';
import Home from './screens/Home.jsx';
import Chats, {Chat} from './screens/Chats.jsx';
import Reels from './screens/Reels.jsx';
import Stories from './screens/Stories.jsx';
import Feed from './screens/Feed.jsx';
import Video, {Player} from './screens/Video.jsx';
import Tweets from './screens/Tweets.jsx';
import Chapters from './screens/Chapters.jsx';
import Library from './screens/Library.jsx';
import Settings from './screens/Settings.jsx';

const SCREENS = {
  home: Home,
  chats: Chats, chat: Chat,
  reels: Reels, stories: Stories, feed: Feed,
  video: Video, player: Player, tweets: Tweets,
  toc: Chapters, library: Library, settings: Settings
};

// Куда возвращает «Продолжить». Список чатов входит сюда наравне с остальными:
// с Этапа 6 он сам читалка — строка списка это кусок книги, а прокрутка двигает
// курсор. Раньше «chats» подменялся на «chat», и человека, читавшего список,
// возврат уводил внутрь переписки, то есть в другой способ чтения.
const READERS = ['chats', 'chat', 'reels', 'stories', 'feed', 'video', 'tweets'];
const NO_BOOK_OK = ['home', 'library', 'settings'];       // этим книга не нужна

// Куда ведёт аппаратная «назад». Всё, чего здесь нет, возвращает домой.
// Без этой таблицы «назад» из плеера или переписки выбрасывало на дом, хотя
// человек пришёл из списка — и терялся ровно тот экран, куда он метил.
const BACK = {chat: 'chats', player: 'video'};

// Шапки, с которых снимается цвет для системного статус-бара. Порядок не важен:
// на экране она всегда одна.
const BARS = '.screen .mhdr, .screen .chdr, .screen .yhdr, .screen .thdr, .screen .fhdr, .screen .hdr';
const pick = el => (el ? getComputedStyle(el).backgroundColor : null);

export default function App() {
  const {ready, books, text, ui, lastApp, addBook, setLastApp, error} = useStore();
  const [screen, setScreen] = useState('home');
  const [arg, setArg] = useState(null);      // параметр экрана: с какой строки списка вошли

  // Тема, кегль и язык живут атрибутами на <html>: токены палитры объявлены
  // на :root, а body красит система вокруг «телефона» — под #phone их не спрятать.
  useEffect(() => {
    const root = document.documentElement;
    if (ui.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', ui.theme);
    root.setAttribute('data-font', ui.font);
    root.setAttribute('lang', ui.lang);
  }, [ui.theme, ui.font, ui.lang]);

  // Системный статус-бар красим под шапку текущего экрана — так ведёт себя
  // любое настоящее приложение, и именно по этой полоске видно переход из
  // системы в «читалку», когда цвет не совпадает.
  //
  // Цвет замеряем с самой шапки, а не берём из таблицы: таблица разошлась бы
  // с палитрой на первой же правке скина. Если шапки нет (клипы, истории) или
  // фон у неё градиентный (дом) — берём фон «телефона».
  // Именно useLayoutEffect, а не useEffect с requestAnimationFrame: кадра
  // может не быть долго (в фоновой вкладке их около одного в секунду), и цвет
  // приезжал бы с опозданием или не приезжал вовсе, если экран сменился раньше.
  // Здесь же DOM уже собран, значит getComputedStyle отдаёт настоящий цвет.
  useLayoutEffect(() => {
    const phone = document.getElementById('phone');
    const scr = document.querySelector('.screen');
    // Порядок: объявленный экраном цвет → шапка → фон самого экрана → фон
    // «телефона». Прозрачное на каждом шаге значит «цвета нет» и пропускается:
    // у дома фон градиентный, background-color там пустой, и покрасить бар в
    // него значило бы получить чёрную полоску поверх красивого перехода.
    const color = [
      scr && scr.dataset.barColor,
      pick(document.querySelector(BARS)),
      pick(scr),
      pick(phone)
    ].find(c => rgbOf(c));
    if (!color) return;
    setBarColor(color);

    // Тем же цветом красим бар, нарисованный для браузера, — иначе на телефоне
    // и на экране разработчика приложение выглядит по-разному ровно в том
    // месте, ради которого всё это делается.
    const rgb = rgbOf(color);
    if (phone && rgb) {
      phone.style.setProperty('--bar', color);
      phone.setAttribute('data-bar', isLight(rgb) ? 'light' : 'dark');
    }
    // Chrome красит по theme-color свою полоску: в мобильном браузере переход
    // выглядит так же ровно, как в приложении.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  }, [screen, ui.skin, ui.theme]);

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
  // Оглавление открывается из любой читалки, поэтому «назад» из него ведёт
  // не в фиксированный экран, а туда, откуда читали.
  const lastRef = useRef(null);
  lastRef.current = lastApp;
  const textRef = useRef(text);
  textRef.current = text;

  const go = (id, opt) => {
    // Читать нечего — вместо пустого экрана уводим в библиотеку.
    if (!NO_BOOK_OK.includes(id) && !textRef.current.length) id = 'library';
    if (READERS.includes(id)) setLastApp(id);
    setArg(opt && 'arg' in opt ? opt.arg : null);
    setScreen(id);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    let off;
    let dead = false;
    // С дома «назад» отдаёт false — приложение сворачивается.
    const onBack = () => {
      const at = screenRef.current;
      if (at === 'home') return false;
      if (at === 'toc') goRef.current(lastRef.current || 'reels');
      else goRef.current(BACK[at] || 'home');
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

  // Пока хранилище не прогидрировано — текст трогать нельзя.
  if (!ready) {
    return (
      <div id="phone">
        <div className="screen on"><div className="boot">{DICT[ui.lang] ? DICT[ui.lang].boot : DICT.ru.boot}</div></div>
      </div>
    );
  }

  const Current = SCREENS[screen] || Home;
  return (
    <div id="phone">
      <Current go={go} arg={arg} />
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
