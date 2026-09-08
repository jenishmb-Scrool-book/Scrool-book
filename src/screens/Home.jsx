import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import {percent, useLeft} from '../ui/Progress.jsx';
import {getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import {APP_NAMES} from '../ui/skins.js';
import {dayLine, hhmm, useNow} from '../ui/clock.js';
import {pic} from '../ui/pics.js';
import AppIcon from '../ui/AppIcon.jsx';
import Glyph from '../ui/Glyph.jsx';

// Сетка «как на телефоне»: часть иконок ведёт в те же экраны — это часть обмана.
//
// Названия лежат в `ui/skins.js` и намеренно искажены. Настоящие бренды здесь
// нельзя: это чужие товарные знаки, и Google Play такое приложение снимет с
// публикации. Узнаваемость даёт вёрстка и расположение, а не буквы в названии.
//
// Восемь иконок ведут в шесть движков. Три мессенджера — один экран с разными
// скинами: списки переписок у них устроены одинаково, и три копии одного кода
// утроили бы цену каждой правки. Различие даёт `skin` (пятый элемент строки).
//
// Шестой элемент — круглая плитка. На настоящем телефоне значки разной формы:
// мессенджеры круглые, остальные — скруглённый квадрат. Одна форма на всё
// выдаёт нарисованный экран быстрее, чем любая другая мелочь: ряд одинаковых
// квадратов не встречается ни на одном живом телефоне.
const APPS = [
  ['plane', APP_NAMES.tg, 'chats', 'linear-gradient(145deg,#41b6e6,#1d7fb8)', 'tg', true],
  ['phone', APP_NAMES.wa, 'chats', 'linear-gradient(145deg,#4ee07f,#0f7a4d)', 'wa', true],
  ['camera', APP_NAMES.feed, 'feed', 'linear-gradient(145deg,#f9a03f,#d62976 58%,#7c5cff)'],
  ['note', APP_NAMES.reels, 'reels', 'linear-gradient(150deg,#33333d,#0a0a0f)'],
  ['play', APP_NAMES.video, 'video', 'linear-gradient(145deg,#ff4b4b,#a10f0f)'],
  ['bolt', APP_NAMES.ms, 'chats', 'linear-gradient(145deg,#b06cff,#0084ff)', 'ms', true],
  ['snap', APP_NAMES.stories, 'stories', 'linear-gradient(145deg,#ffd93b,#e0a000)'],
  ['bird', APP_NAMES.tweets, 'tweets', 'linear-gradient(145deg,#5aa9e6,#1b6ca8)', null, true]
];

// Док — наши собственные экраны, сетка — «приложения».
//
// Раньше док повторял две иконки из сетки, и это единственное место экрана, где
// повторение видно: на живом телефоне в доке стоит то, чего в сетке нет. Заодно
// нашлось место «Обоям»: просьба поставить обои висела отдельной плашкой
// посреди экрана — а плашки посреди рабочего стола не бывает ни на одном
// телефоне, и именно она сильнее всего выдавала, что экран нарисован.
// Подписи док-панели переводятся, названия «приложений» — нет: это имена собственные.
const DOCK = [
  ['books', 'app.books', 'library', 'linear-gradient(145deg,#6f6f86,#33334a)'],
  ['list', 'app.chapters', 'toc', 'linear-gradient(145deg,#4fb0a5,#1c6f68)'],
  ['image', 'app.wall', null, 'linear-gradient(145deg,#e0699a,#8a3f7a)'],
  ['gear', 'app.settings', 'settings', 'linear-gradient(145deg,#5a5a6a,#33333f)']
];

// Обои по умолчанию — снимок из тех же, которыми набиты ленты.
//
// До этого фоном был градиент, гаснущий книзу в цвет приложения, и от этого
// пустое место под иконками читалось как незаполненный блок, а не как обои.
// Настоящий домашний экран тоже наполовину пустой — но там пустота это фотография.
const WALL = pic('tall', 38);

function Icon({glyph, label, background, round, onClick}) {
  return (
    <div className={round ? 'icon rnd' : 'icon'} onClick={onClick} role="button">
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
  const read = percent(offset, text.length) / 100;
  const left = useLeft(offset, text.length);

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
  // Иконка в доке для этого честнее плашки: она подписана, стоит там же, где
  // остальные наши экраны, и не занимает половину рабочего стола.
  const pickWall = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    shrink(f)
      .then(uri => setWallpaper(uri).then(() => setWall(uri)))
      .catch(() => {});      // не смогли разобрать картинку — остаются прежние обои
  };

  return (
    <Screen id="home">
      {/* Затемняющая накладка обязательна: обои — произвольное фото, своё или
          наше, и без неё белые подписи иконок на светлом кадре пропадают. */}
      <div className="wall" style={{backgroundImage: `url(${wall || WALL})`}} />
      <StatusBar />
      {/* Часы с датой в левом верхнем углу — то, по чему домашний экран Android
          узнаётся раньше всего остального, раньше даже иконок. */}
      <div className="glance">
        <b>{hhmm(now)}</b>
        <span>{dayLine(now, ui.lang)}</span>
      </div>
      <div className="widget">
        <div className="wt">
          <div className="ti">
            <div className="t">{t('home.now')}</div>
            <div className="n">{current ? current.title : t('home.empty')}</div>
          </div>
          {/* «Осталось» — то же число, что и в плашке над каждым списком.
              На домашнем экране оно отвечает на вопрос, ради которого туда и
              смотрят: успею ли я сейчас. */}
          {text.length ? <div className="lf">{left}</div> : null}
        </div>
        <div className="bar"><i style={{transform: `scaleX(${read.toFixed(4)})`}} /></div>
        <button onClick={cont}>{t('home.continue')}</button>
      </div>
      <div className="grid">
        {APPS.map(([glyph, label, to, background, skin, round], k) => (
          <Icon key={k} glyph={glyph} label={label} background={background} round={round}
                onClick={() => open(to, skin)} />
        ))}
      </div>
      {/* Точек страниц здесь нет. Довод «без них это не рабочий стол» не
          выдержал проверки глазами владельца: три точки, из которых горит
          одна, обещают ещё два экрана — а их нет, и обещание видно как
          неточность. Настоящий лаунчер с одним экраном точек тоже не рисует. */}
      <div className="dock">
        {DOCK.map(([glyph, label, to, background], k) =>
          to ? (
            <Icon key={k} glyph={glyph} label={t(label)} background={background}
                  onClick={() => open(to)} />
          ) : (
            // «Обои» — не переход, а выбор файла, поэтому это <label> с
            // input внутри: нативный выбор картинки открывает сам WebView.
            <label className="icon" key={k}>
              <AppIcon name={glyph} background={background} />
              <span>{t(label)}</span>
              <input type="file" accept="image/*" onChange={pickWall} />
            </label>
          )
        )}
      </div>
      {/* Строка поиска ведёт в оглавление: искать в этом приложении можно
          ровно одно — место в книге. */}
      <div className="qsearch" role="button" onClick={() => go('toc')}>
        <Glyph name="search" />
        <span className="q">{t('home.search')}</span>
        <Glyph name="mic" />
        <Glyph name="lens" />
      </div>
    </Screen>
  );
}
