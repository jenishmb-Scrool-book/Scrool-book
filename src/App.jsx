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

export const SCREENS = {
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

// Глубина истории переходов. Больше двух десятков экранов подряд не открывает
// никто, а держать список без предела — это утечка, растущая от каждого тапа.
const DEPTH = 24;

// Шапки, с которых снимается цвет для системного статус-бара. Порядок не важен:
// на экране она всегда одна.
const BARS = '.screen .mhdr, .screen .chdr, .screen .yhdr, .screen .thdr, .screen .fhdr, .screen .hdr';
const pick = el => (el ? getComputedStyle(el).backgroundColor : null);

export default function App() {
  const {ready, books, text, ui, addBook, setLastApp, place, setPlace, error} = useStore();
  const [screen, setScreen] = useState('home');
  const [arg, setArg] = useState(null);      // параметр экрана: с какой строки списка вошли
  const [restored, setRestored] = useState(false);   // место из прошлого запуска уже разобрано

  // История переходов. Была таблица «откуда куда» на два экрана, и она врала
  // везде, где переход не один: в настройки приходят и из дома, и с нижней
  // панели любого «приложения», а «назад» из таблицы всегда уводил на дом —
  // то есть терял ровно то место, откуда человек вышел на минуту.
  const hist = useRef([]);

  // Возврат туда, где закрыли приложение.
  //
  // Курсор сохранялся и раньше, но приложение всё равно открывалось на
  // домашнем экране: место в книге было цело, а место в телефоне терялось, и
  // до текста оставалось лишнее нажатие. Ни одно настоящее приложение так себя
  // не ведёт — свернул на середине переписки, вернулся в середину переписки.
  //
  // Ровно один раз за запуск и только после гидрации: до неё текста ещё нет, и
  // любой экран чтения увёл бы в библиотеку (см. `go`).
  useEffect(() => {
    if (!ready || restored) return;
    setRestored(true);
    if (!place || place.id === 'home' || !SCREENS[place.id]) return;
    // Книга могла исчезнуть вместе с местом — тогда открывать нечего.
    if (!NO_BOOK_OK.includes(place.id) && !text.length) return;
    setArg(place.arg);
    setScreen(place.id);
    if (READERS.includes(place.id)) setLastApp(place.id);
  }, [ready, restored, place, text.length, setLastApp]);

  // И запоминаем место — только ПОСЛЕ разбора прошлого. Иначе первый же кадр,
  // на котором по умолчанию стоит дом, затёр бы то, что мы собирались прочесть.
  // Флаг именно состояние, а не ref: эффекты одного коммита идут подряд, и с
  // ref эта запись случилась бы до того, как `screen` успел смениться.
  useEffect(() => {
    if (!restored) return;
    setPlace({id: screen, arg});
  }, [restored, screen, arg, setPlace]);

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
  const textRef = useRef(text);
  textRef.current = text;

  const argRef = useRef(arg);
  argRef.current = arg;

  const go = (id, opt) => {
    // Читать нечего — вместо пустого экрана уводим в библиотеку.
    if (!NO_BOOK_OK.includes(id) && !textRef.current.length) id = 'library';
    const from = screenRef.current;
    if (id !== from) {
      const h = hist.current;
      // Переход на экран, который уже в истории, РАЗМАТЫВАЕТ её до него, а не
      // наращивает. Иначе «‹» в шапке (он ведёт `go('home')`, а не «назад»)
      // клал бы дом поверх дома, и аппаратная «назад» ходила бы по кругу
      // вместо того, чтобы выйти из приложения.
      const k = h.findIndex(e => e.screen === id);
      if (k >= 0) h.length = k;
      else {
        h.push({screen: from, arg: argRef.current});
        if (h.length > DEPTH) h.shift();
      }
    }
    if (READERS.includes(id)) setLastApp(id);
    setArg(opt && 'arg' in opt ? opt.arg : null);
    setScreen(id);
  };
  const goRef = useRef(go);
  goRef.current = go;

  /** Шаг назад по истории. false — истории нет. */
  const back = () => {
    const prev = hist.current.pop();
    if (!prev) return false;
    if (READERS.includes(prev.screen)) setLastApp(prev.screen);
    setArg(prev.arg == null ? null : prev.arg);
    setScreen(prev.screen);
    return true;
  };
  const backRef = useRef(back);
  backRef.current = back;

  // То, что экраны вешают на «‹» в шапке. Раньше каждый экран знал, куда
  // возвращаться, своим списком — и врал: настройки всегда уводили в
  // библиотеку, хотя попасть в них можно с нижней панели любого движка.
  const goBack = () => { if (!backRef.current()) goRef.current('home'); };

  useEffect(() => {
    let off;
    let dead = false;
    // С дома «назад» отдаёт false — приложение сворачивается.
    const onBack = () => {
      if (screenRef.current === 'home') return false;
      if (backRef.current()) return true;
      // Истории нет (например, экран восстановлен после перезапуска) — на дом.
      goRef.current('home');
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
      <Current go={go} back={goBack} arg={arg} />
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
