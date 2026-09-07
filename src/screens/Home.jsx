import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import {percent} from '../ui/Progress.jsx';
import {getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import {APP_NAMES} from '../ui/skins.js';
import {dayLine, hhmm, useNow} from '../ui/clock.js';
import AppIcon from '../ui/AppIcon.jsx';

// Сетка «как на телефоне»: часть иконок ведёт в те же экраны — это часть обмана.
//
// Названия лежат в `ui/skins.js` и намеренно искажены. Настоящие бренды здесь
// нельзя: это чужие товарные знаки, и Google Play такое приложение снимет с
// публикации. Узнаваемость даёт вёрстка и расположение, а не буквы в названии.
//
// Восемь иконок ведут в шесть движков. Три мессенджера — один экран с разными
// скинами: списки переписок у них устроены одинаково, и три копии одного кода
// утроили бы цену каждой правки. Различие даёт `skin` (пятый элемент строки).
const APPS = [
  ['send', APP_NAMES.tg, 'chats', 'linear-gradient(145deg,#41b6e6,#1d7fb8)', 'tg'],
  ['bubble', APP_NAMES.wa, 'chats', 'linear-gradient(145deg,#4ee07f,#0f7a4d)', 'wa'],
  ['photo', APP_NAMES.feed, 'feed', 'linear-gradient(145deg,#f9a03f,#d62976 60%,#7c5cff)'],
  ['note', APP_NAMES.reels, 'reels', 'linear-gradient(145deg,#ff2d55,#26f4ee 140%)'],
  ['play', APP_NAMES.video, 'video', 'linear-gradient(145deg,#ff4b4b,#a10f0f)'],
  ['chats', APP_NAMES.ms, 'chats', 'linear-gradient(145deg,#b06cff,#0084ff)', 'ms'],
  ['ring', APP_NAMES.stories, 'stories', 'linear-gradient(145deg,#ffd93b,#e0a000)'],
  ['hash', APP_NAMES.tweets, 'tweets', 'linear-gradient(145deg,#5aa9e6,#1b6ca8)']
];

// Подписи док-панели переводятся, названия «приложений» — нет: это имена собственные.
const DOCK = [
  ['books', 'app.books', 'library', 'linear-gradient(145deg,#5b5b6e,#2a2a3a)'],
  ['note', APP_NAMES.reels, 'reels', 'linear-gradient(145deg,#ff2d55,#26f4ee 140%)'],
  ['bubble', APP_NAMES.wa, 'chats', 'linear-gradient(145deg,#4ee07f,#0f7a4d)', 'wa'],
  ['gear', 'app.settings', 'settings', 'linear-gradient(145deg,#4a4a58,#33333f)']
];

function Icon({glyph, label, background, onClick}) {
  return (
    <div className="icon" onClick={onClick}>
      <AppIcon name={glyph} background={background} />
      <span>{label}</span>
    </div>
  );
}

export default function Home({go}) {
  const {current, text, offset, lastApp, ui, setUi} = useStore();
  const t = useT();
  const [wall, setWall] = useState('');
  const now = useNow();
  const width = percent(offset, text.length).toFixed(1) + '%';

  // Обои читаются один раз за сессию — дальше отдаёт кеш в wallpaper.js.
  useEffect(() => {
    let live = true;
    getWallpaper().then(w => live && setWall(w)).catch(() => {});
    return () => {live = false;};
  }, []);

  // «Продолжить» уводит туда, где читали в прошлый раз. Нет книги — в библиотеку.
  const cont = () => go(text.length ? (lastApp || 'reels') : 'library');

  // Скин запоминается в сторе, а не в состоянии экрана: иначе «Продолжить»
  // после перезапуска открывало бы чтение в чужой обёртке.
  const open = (to, skin) => {
    if (skin && skin !== ui.skin) setUi({skin});
    go(to);
  };

  // Обои предлагаем прямо здесь, а не только в настройках: подтянуть настоящие
  // обои телефона нельзя (с Android 14 система их приложениям не отдаёт совсем),
  // поэтому единственный способ получить «свой» экран — попросить картинку.
  // На домашнем экране это один тап вместо трёх, и просьба видна там, где
  // сразу понятно, что она изменит.
  const pickWall = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    shrink(f)
      .then(uri => setWallpaper(uri).then(() => setWall(uri)))
      .catch(() => setUi({wallTip: 'off'}));   // не смогли — молча убираем просьбу
  };

  return (
    <Screen id="home">
      {/* Затемняющая накладка обязательна: обои — произвольное фото пользователя,
          и без неё белые подписи иконок на светлой картинке пропадают. */}
      {wall ? <div className="wall" style={{backgroundImage: `url(${wall})`}} /> : null}
      <StatusBar />
      {/* Часы с датой в левом верхнем углу — то, по чему домашний экран Android
          узнаётся раньше всего остального, раньше даже иконок. */}
      <div className="glance">
        <b>{hhmm(now)}</b>
        <span>{dayLine(now, ui.lang)}</span>
      </div>
      <div className="widget">
        <div className="t">{t('home.now')}</div>
        <div className="n">{current ? current.title : t('home.empty')}</div>
        <div className="bar"><i style={{width}} /></div>
        <button onClick={cont}>{t('home.continue')}</button>
      </div>
      {!wall && ui.wallTip === 'on' ? (
        <div className="walltip">
          <span>{t('home.wall_tip')}</span>
          <label className="pick">
            {t('home.wall_pick')}
            <input type="file" accept="image/*" onChange={pickWall} />
          </label>
          <span className="x" onClick={() => setUi({wallTip: 'off'})}
                role="button" aria-label={t('dismiss')}>✕</span>
        </div>
      ) : null}
      <div className="grid">
        {APPS.map(([glyph, label, to, background, skin], k) => (
          <Icon key={k} glyph={glyph} label={label} background={background}
                onClick={() => open(to, skin)} />
        ))}
      </div>
      {/* Точки страниц и строка поиска не работают и работать не должны:
          экранов у «рабочего стола» один, а искать в приложении нечего.
          Стоят они потому, что без них это не домашний экран телефона, а
          сетка иконок, — и переход из настоящей системы в такую сетку
          чувствуется как выход из телефона, а не как открытие приложения. */}
      <div className="dots" aria-hidden="true"><i className="on" /><i /><i /></div>
      <div className="dock">
        {DOCK.map(([glyph, label, to, background, skin], k) => (
          <Icon key={k} glyph={glyph} label={label.includes('.') ? t(label) : label}
                background={background} onClick={() => open(to, skin)} />
        ))}
      </div>
      <div className="qsearch" aria-hidden="true">
        <span className="g">⌕</span>
        <span className="q">{t('home.search')}</span>
        <span className="m">◉</span>
      </div>
    </Screen>
  );
}
