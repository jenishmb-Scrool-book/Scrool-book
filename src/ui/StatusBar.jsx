import {hhmm, useNow} from './clock.js';
import {isNative} from '../native.js';

// Статус-бар.
//
// На телефоне его НЕТ. Там наверху уже висит настоящий, системный — с
// настоящим временем и настоящим зарядом, — и рисовать под ним второй значило
// бы показать человеку две полоски подряд. Именно это и делает переход из
// своей системы в нарисованную странным: не оформление, а дубль.
//
// В браузере системного бара нет, и без нарисованного экран перестаёт быть
// похож на телефон. Поэтому он остаётся ровно там, где он единственный.
//
// Значки — не символы шрифта, а разметка: у «антенны» и «батареи» нет
// подходящих глифов, а те, что есть, в системных шрифтах рисуются как попало.

function Bars() {
  return (
    <svg viewBox="0 0 17 12" width="14" height="10" aria-hidden="true">
      <path fill="currentColor" opacity=".4" d="M0 9h2.5v3H0z" />
      <path fill="currentColor" opacity=".7" d="M4.3 6.5h2.5V12H4.3z" />
      <path fill="currentColor" d="M8.6 3.4h2.5V12H8.6zM12.9 0h2.5v12h-2.5z" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg viewBox="0 0 16 12" width="14" height="10" aria-hidden="true">
      <path fill="currentColor" d="M8 11.6 0.5 3.6a10.6 10.6 0 0 1 15 0z" />
    </svg>
  );
}

function Battery() {
  return (
    <svg viewBox="0 0 25 12" width="20" height="10" aria-hidden="true">
      <rect x="0.6" y="1.1" width="20.8" height="9.8" rx="3" fill="none"
            stroke="currentColor" strokeWidth="1.2" opacity=".6" />
      <rect x="2.2" y="2.7" width="14" height="6.6" rx="1.6" fill="currentColor" />
      <path d="M23.2 4.4v3.2" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

export default function StatusBar() {
  const now = useNow();
  if (isNative()) return null;
  return (
    <div className="status">
      <span className="ct">{hhmm(now)}</span>
      <span className="sysic"><Bars /><Wifi /><Battery /></span>
    </div>
  );
}
