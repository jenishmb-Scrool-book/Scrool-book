// Снимки экрана для карточки Google Play через Chrome DevTools Protocol.
//
// Порядок:
//   1. npm run build && npm run preview -- --port 4173
//   2. Edge или Chrome без окна, с портом отладки:
//      msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<любая папка> about:blank
//   3. node tools/store-shots.mjs <ru|en> <книга.txt> <папка> [dark|light]
//      MARK — строка, с которой открыть книгу (по умолчанию «Глава III» / «CHAPTER VII»),
//      SCENES — JSON-список кадров, если нужно переснять не все.
//
// Снимает 360×640 при плотности 3, то есть 1080×1920 (9:16) — так Play
// рекомендует. Хранилище пишется со страницы-картинки того же сайта: живое
// приложение при уходе со страницы записало бы своё место поверх нашего.
// Книга — из общественного достояния, иначе снимок публикует чужой текст;
// откуда брать — `docs/release/store-listing.md`, раздел «Скриншоты».
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const [lang = 'ru', bookPath, outDir, theme = 'dark'] = process.argv.slice(2);
const PORT = 9333;
const APP = 'http://localhost:4173/';
const W = 360, H = 640, DPR = 3;          // 1080×1920, 9:16

const text = readFileSync(bookPath, 'utf8').split('\r\n').join('\n');
const title = text.split('\n')[0].trim();
// Место чтения — начало третьей главы: там уже идёт действие.
const mark = process.env.MARK || (lang === 'ru' ? 'Глава III' : 'CHAPTER VII');
const head = text.indexOf(mark);
const at = head < 0 ? 0 : text.indexOf('\n\n', head) + 2;
const meta = {
  books: [{id: 'b1', title, len: text.length, toc: 0, pics: 0}],
  cur: 'b1', at: {b1: at}, last: 'chats',
  ui: {theme, lang, font: 'md', notify: 'off', skin: 'tg'},
  place: {id: 'home', arg: null}, intro: 1, pace: null
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, {once: true}));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const {res, rej} = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, {res, rej});
  ws.send(JSON.stringify({id, method, params}));
});
const js = async expr => {
  const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'js error');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: DPR, mobile: true});
await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: theme}]});
// Часы в строке состояния — днём: снимок в 22:45 выглядит как ночная сессия.
await send('Emulation.setTimezoneOverride', {timezoneId: process.env.TZ_SHOT || 'America/Los_Angeles'});

// Чистый старт: стираем всё и кладём книгу до первого скрипта страницы.
await send('Page.navigate', {url: APP + 'pics/wall/small/001.webp'});
await sleep(1500);
await js(`localStorage.clear(); localStorage.setItem('scroll.book.b1', ${JSON.stringify(text)});
  localStorage.setItem('scroll.meta', ${JSON.stringify(JSON.stringify(meta))}); true`);

const settle = async (ms = 1800) => {
  await sleep(ms);
  // ждём картинки на экране
  for (let k = 0; k < 20; k++) {
    const done = await js(`[...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).every(i => i.complete)`);
    if (done) break;
    await sleep(250);
  }
  await sleep(400);
};
const BLANK = APP + 'pics/wall/small/001.webp';
const reload = async place => {
  const m = {...meta, place};
  await send('Page.navigate', {url: BLANK});
  await sleep(700);
  await js(`localStorage.setItem('scroll.meta', ${JSON.stringify(JSON.stringify(m))}); true`);
  await send('Page.navigate', {url: APP});
  await settle(2200);
};
const clickText = (sel, label) => js(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().includes(${JSON.stringify(label)}));
  if (!el) return false; el.click(); return true; })()`);
const shot = async name => {
  const r = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('saved', name);
};

const scenes = JSON.parse(process.env.SCENES || 'null') || [
  ['01-chat', {id: 'chats', arg: null}, `document.querySelector('.crow')?.click()`, `(() => {
    const hdr = document.querySelector('.chdr').getBoundingClientRect().bottom;
    const box = [...document.querySelectorAll('#chat *')].find(e => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible');
    const m = [...document.querySelectorAll('#chat .msg')].find(e => e.getBoundingClientRect().top > hdr + 4);
    if (box && m) box.scrollTop += m.getBoundingClientRect().top - hdr - 56;
    return !!(box && m); })()`],
  ['02-reels', {id: 'reels', arg: null}, null],
  ['03-chats', {id: 'chats', arg: null}, null],
  ['04-home', {id: 'home', arg: null}, null],
  ['05-video', {id: 'video', arg: null}, null],
  ['06-feed', {id: 'feed', arg: null}, null],
  ['07-toc', {id: 'toc', arg: null}, null],
  ['08-library', {id: 'library', arg: null}, null]
];
for (const [name, place, after, fix] of scenes) {
  await reload(place);
  if (after) { await js(after); await settle(1500); }
  if (fix) { console.log(name, 'fix', await js(fix)); await settle(900); }
  await shot(name);
}
ws.close();
