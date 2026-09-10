import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {
  StorageFullError, deletePic, deletePix, deleteText, deleteToc,
  loadMeta, loadPic, loadPix, loadText, loadToc,
  saveMeta, savePic, savePix, saveText, saveToc
} from './lib/storage.js';
import {dataUrl} from './lib/img.js';
import {detect} from './lib/toc.js';

// Одно состояние на всё приложение: сырой текст книги и один курсор.
//
// Курсор — СМЕЩЕНИЕ В СИМВОЛАХ, а не номер фрагмента. Стор специально не режет
// текст: у каждого экрана свой размер фрагмента, поэтому нарезка — дело экрана
// (см. useChunks), а общая для всех величина только одна — позиция в символах.
// Именно она и делает продукт: переключился с клипов на чаты — продолжил с того
// же места, хотя фрагменты там совсем другой длины.

const DEBOUNCE = 400;                                   // мс между последним сдвигом курсора и записью
// Экраны-читалки, куда уводит «Продолжить». Список обязан совпадать с READERS
// в App.jsx: на Этапе 1 сюда не доехали три новых экрана, и `setLastApp` молча
// отбрасывал их — «Продолжить» после чтения в чатах открывало клипы.
// «chats» появился здесь на Этапе 6: список переписок сам стал способом читать.
const APPS = ['chats', 'chat', 'reels', 'stories', 'feed', 'video', 'tweets'];
// Настройки интерфейса живут в той же мете: им нужны те же дебаунс и дозапись
// при выходе, что и курсору, — заводить ради них второе хранилище незачем.
const THEMES = ['system', 'light', 'dark'];
const FONTS = ['sm', 'md', 'lg'];
const LANGS = ['ru', 'en'];
const ONOFF = ['on', 'off'];
// Скин мессенджера. Живёт в сторе, а не в состоянии App, ровно по одной причине:
// иначе «Продолжить» после перезапуска открывало бы чтение в чужой обёртке —
// человек закрыл приложение в зелёном мессенджере, а вернулся в синий.
const SKINS = ['tg', 'wa', 'ms'];
const UI = {theme: 'system', lang: 'ru', font: 'md', notify: 'off', skin: 'tg'};

const EMPTY = {books: [], cur: null, at: {}, last: 'reels', ui: UI, place: null};

// Место, где закрыли приложение: экран, его параметр (вкладка мессенджера,
// номер собеседника) и прокрутка на нём. Курсор хранился и раньше, но одного
// его мало: приложение всё равно открывалось на домашнем экране, и до текста
// оставалось ещё одно нажатие.
//
// Прокрутка — это ПАРА: `at` — смещение в символах той карточки, что стояла у
// кромки экрана, `y` — сколько её уже ушло под кромку. Карточка в символах, а
// не номером, по той же причине, что и курсор: номер зависит от размера
// фрагмента, а он у каждого экрана свой. Одних пикселей тоже мало: после
// перезапуска окно рендера начинается с другого куска книги, и та же тысяча
// пикселей означает другое место.
//
// Списка экранов стор нарочно не знает: он лежит в App.jsx, и импорт
// оттуда замкнул бы круг. Здесь только защита от мусора в хранилище, а
// «есть ли такой экран» проверяет тот, кто его открывает.
const CAP = 1e6;      // потолок пикселя: заслон от мусора, а не смысл

const readPlace = raw => {
  const id = raw && typeof raw.id === 'string' ? raw.id.slice(0, 24) : '';
  if (!id) return null;
  const a = raw.arg;
  const arg = typeof a === 'string' ? a.slice(0, 32)
    : Number.isFinite(a) ? Math.trunc(a)
    : null;
  const at = Number.isFinite(raw.at) && raw.at >= 0 ? Math.trunc(raw.at) : null;
  const y = at === null || !Number.isFinite(raw.y)
    ? 0
    : Math.trunc(Math.min(Math.max(raw.y, -CAP), CAP));
  return {id, arg, at, y};
};

// Экран и параметр — да, прокрутка — нет, и это несущая деталь. App пишет сюда
// {id, arg} на каждом переходе и не знает про прокрутку вовсе; сравнивай мы её
// тоже — запись «тот же экран» стирала бы место прокрутки на первом же кадре.
// А смена экрана, наоборот, обязана его стереть: мерить прокрутку нечем.
const samePlace = (a, b) =>
  (a ? a.id : null) === (b ? b.id : null) && (a ? a.arg : null) === (b ? b.arg : null);

// Значение из хранилища могло устареть или быть испорчено — берём только известные.
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const readUi = raw => ({
  theme: pick(raw && raw.theme, THEMES, UI.theme),
  lang: pick(raw && raw.lang, LANGS, UI.lang),
  font: pick(raw && raw.font, FONTS, UI.font),
  // Уведомления по умолчанию выключены: системный диалог показывается один раз
  // за всё время, и спрашивать до того, как человек что-то прочитал, — сжечь его.
  notify: pick(raw && raw.notify, ONOFF, UI.notify),
  skin: pick(raw && raw.skin, SKINS, UI.skin)
});

// Сравнение по ключам UI, а не по перечислению полей вручную: следующее
// добавленное поле иначе молча перестало бы сохраняться.
const sameUi = (a, b) => Object.keys(UI).every(k => a[k] === b[k]);

// Оглавление приходит из трёх мест — от парсера fb2/epub, от распознавания в
// обычном тексте и из хранилища, — и ни одному из них доверять нельзя: файл
// мог быть кривым, а запись остаться от прошлой версии книги. Пропускаем
// только то, что указывает внутрь текста.
const readToc = (list, len) =>
  (Array.isArray(list) ? list : [])
    .map(c => ({
      title: String((c && c.title) || '').trim().slice(0, 120),
      at: Math.min(Math.max(Math.trunc(Number(c && c.at)) || 0, 0), Math.max(0, len - 1))
    }))
    .filter(c => c.title)
    .sort((a, b) => a.at - b.at)
    .filter((c, i, all) => i === 0 || c.at !== all[i - 1].at);

// Картинки книги. Список «где какая» — та же координата, что у глав: смещение
// в символах. Ему верить нельзя ровно по тем же причинам, поэтому и проверка
// такая же — пропускаем только то, что указывает внутрь текста.
const readPix = (list, len) =>
  (Array.isArray(list) ? list : [])
    // Не запись — не картинка. Без этой строки `null` в списке доезжал до
    // конца целым: `null && null.k` это `null`, а `Number(null)` — ноль,
    // то есть законный номер нулевой картинки на нулевом смещении.
    .filter(p => p && typeof p === 'object')
    .map(p => ({
      k: Math.trunc(Number(p && p.k)),
      at: Math.min(Math.max(Math.trunc(Number(p && p.at)) || 0, 0), Math.max(0, len - 1))
    }))
    .filter(p => Number.isFinite(p.k) && p.k >= 0)
    .sort((a, b) => a.at - b.at);

// Кэш загруженных картинок: ключ «книга:номер» → промис data: URL.
//
// Модульный, а не в состоянии React: он ни на что не влияет в разметке, а
// перерисовка всего дерева из-за того, что доехала одна иллюстрация, — это
// подёргивание там, где человек читает. Промис, а не строка, потому что одна
// картинка легко оказывается на экране дважды (карточка и её же превью), и
// два чтения одного файла ни к чему.
//
// Записей немного: у иллюстрации data: URL весит сотни килобайт, и держать в
// памяти всю книгу незачем — окно рендера всё равно показывает полтора десятка
// карточек.
const PICS = 8;
const cache = new Map();

const remember = (key, job) => {
  cache.set(key, job);
  if (cache.size > PICS) cache.delete(cache.keys().next().value);
  return job;
};

/** Забыть всё про книгу: её только что удалили, а ключи в кэше пережили бы её. */
const forget = id => {
  for (const key of [...cache.keys()]) if (key.startsWith(id + ':')) cache.delete(key);
};

/**
 * Кладёт картинки книги в хранилище и отдаёт список «где какая».
 *
 * Ошибки записи глотаются намеренно: текст книги к этому моменту уже лёг, и
 * потерять книгу из-за иллюстрации, которая не влезла в память телефона, было
 * бы обменом наоборот. Не влезла — читаем без неё.
 *
 * `lead` — те же обрезанные ведущие пробелы, что и у глав: парсер считал
 * смещения по своему тексту, а храним мы подрезанный.
 */
async function writePics(id, images, lead) {
  const list = [];
  const seen = new Map();          // одинаковые данные → один файл на все ссылки
  let count = 0;
  for (const img of Array.isArray(images) ? images : []) {
    if (!img || !img.type || !img.data) continue;
    let k = seen.get(img.data);
    if (k === undefined) {
      k = count;
      try {
        await savePic(id, k, dataUrl(img.type, img.data));
      } catch {
        break;                     // место кончилось — дальше будут те же отказы
      }
      seen.set(img.data, k);
      count += 1;
    }
    list.push({at: (Math.trunc(Number(img.at)) || 0) - lead, k});
  }
  return {list, count};
}

/**
 * Убрать картинки книги. Отдельной функцией, потому что нужна дважды: при
 * удалении книги и при откате неудачного импорта. Осиротевший файл картинки из
 * библиотеки не виден и не удаляется — значит, живёт до переустановки.
 */
async function dropPics(id, count) {
  for (let k = 0; k < (Number(count) || 0); k++) await deletePic(id, k).catch(() => {});
  await deletePix(id).catch(() => {});
  forget(id);
}

const Ctx = createContext(null);

export function StoreProvider({children}) {
  const [meta, setMeta] = useState(EMPTY);
  const [text, setText] = useState('');
  const [chapters, setChapters] = useState([]);
  const [pics, setPics] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Зеркала состояния для колбэков: дебаунс и async-операции не должны
  // ловить устаревшее замыкание.
  const metaRef = useRef(EMPTY);
  const textRef = useRef('');
  const timer = useRef(null);
  const dirty = useRef(false);       // есть несохранённые изменения меты
  const mounted = useRef(true);
  const openSeq = useRef(0);         // защита от гонки двух openBook подряд

  const applyMeta = useCallback(next => {
    metaRef.current = next;
    if (mounted.current) setMeta(next);
  }, []);
  const applyText = useCallback(txt => {
    textRef.current = txt;
    if (mounted.current) setText(txt);
  }, []);
  const applyToc = useCallback(list => {
    if (mounted.current) setChapters(list);
  }, []);
  const applyPix = useCallback(list => {
    if (mounted.current) setPics(list);
  }, []);

  /**
   * Оглавление книги. Считается ОДИН раз за книгу, дальше берётся из хранилища.
   *
   * Флаг `toc` в записи книги отличает «ещё не считали» от «считали, глав нет».
   * Без него распознавание гонялось бы по всему тексту при каждом открытии
   * книги, в которой глав и нет.
   */
  const bookToc = useCallback(async (book, txt) => {
    if (!book) return [];
    if (book.toc) return readToc(await loadToc(book.id), txt.length);
    const list = readToc(detect(txt), txt.length);
    try {
      await saveToc(book.id, list);
    } catch {
      /* оглавление — удобство, а не книга: не легло, так не легло */
    }
    return list;
  }, []);

  /**
   * Список картинок книги. В хранилище лезем только если книга их и правда
   * несёт: у книг без картинок — а это почти все — лишнего чтения не будет.
   */
  const bookPix = useCallback(async (book, txt) => {
    if (!book || !book.pics) return [];
    return readPix(await loadPix(book.id), txt.length);
  }, []);

  /**
   * Картинка по номеру. Отдаёт промис готового `src` для `<img>` — или пустую
   * строку, если файла нет: карточка тогда просто останется без иллюстрации.
   */
  const getPic = useCallback(k => {
    const id = metaRef.current.cur;
    if (!id) return Promise.resolve('');
    const key = id + ':' + k;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);            // самая свежая — в конец очереди на вылет
      return remember(key, hit);
    }
    return remember(key, loadPic(id, k).catch(() => ''));
  }, []);

  const report = useCallback(e => {
    const msg = e instanceof StorageFullError
      ? e.message
      : (e && e.message) || 'Не получилось сохранить.';
    if (mounted.current) setError(msg);
  }, []);

  // Единственная точка записи меты. Ошибку показываем пользователю, но не роняем приложение.
  const write = useCallback(async () => {
    if (timer.current) {clearTimeout(timer.current); timer.current = null;}
    dirty.current = false;
    try {
      await saveMeta(metaRef.current);
    } catch (e) {
      report(e);
    }
  }, [report]);

  // Курсор в ленте дёргается десятки раз в секунду — пишем не чаще раза в DEBOUNCE.
  const schedule = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {timer.current = null; write();}, DEBOUNCE);
  }, [write]);

  // Дописать немедленно. Нужна тем, кто знает, что жить осталось до конца
  // обработчика: сворачивание ниже и окно рендера, которое в этот же момент
  // снимает с экрана последнюю прокрутку.
  const flush = useCallback(() => {if (dirty.current) write();}, [write]);

  /* ===== гидрация ===== */
  useEffect(() => {
    let live = true;
    // Кэш картинок живёт вне React и переживает перемонтирование стора. За
    // это время хранилище могло стать другим — книгу удалили и завели заново,
    // а номер у неё тот же. Показать при этом картинку из прошлой жизни хуже,
    // чем прочитать файл ещё раз: чтение стоит миллисекунды, а неправильная
    // иллюстрация посреди книги выглядит поломкой.
    cache.clear();
    (async () => {
      const raw = (await loadMeta()) || EMPTY;
      const m = {
        books: Array.isArray(raw.books) ? raw.books : [],
        cur: raw.cur ?? null,
        at: {...(raw.at || {})},
        last: APPS.includes(raw.last) ? raw.last : 'reels',
        ui: readUi(raw.ui),
        place: readPlace(raw.place)
      };
      let txt = '';
      if (m.cur && m.books.some(b => b.id === m.cur)) {
        txt = String((await loadText(m.cur)) ?? '');
        m.at[m.cur] = clamp(m.at[m.cur], txt.length);
        m.books = m.books.map(b => (b.id === m.cur ? {...b, len: txt.length} : b));
      } else {
        m.cur = null;                       // мета ссылается на исчезнувшую книгу
      }
      const book = m.books.find(b => b.id === m.cur) || null;
      const toc = await bookToc(book, txt);
      const pix = await bookPix(book, txt);
      if (book) m.books = m.books.map(b => (b.id === book.id ? {...b, toc: 1} : b));
      if (!live) return;
      applyMeta(m);
      applyText(txt);
      applyToc(toc);
      applyPix(pix);
      setReady(true);
    })();
    return () => {live = false;};
  }, [applyMeta, applyText, applyToc, applyPix, bookToc, bookPix]);

  /* ===== размонтирование ===== */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) {clearTimeout(timer.current); timer.current = null;}
      // Дебаунс мог не успеть — дописываем, иначе последний сдвиг курсора теряется.
      if (dirty.current) {
        dirty.current = false;
        saveMeta(metaRef.current).catch(() => {});
      }
    };
  }, []);

  /* ===== выход из приложения ===== */
  // Размонтирование выше спасает только в браузере. На телефоне Android
  // не закрывает WebView вежливо, а убивает процесс целиком, и React об этом
  // не узнаёт — последние DEBOUNCE миллисекунд чтения просто пропадали бы.
  // А пропадали бы они каждый раз: человек выходит тогда, когда дочитал, то
  // есть последний сдвиг курсора почти всегда моложе задержки.
  // visibilitychange приходит от системы при сворачивании — это и есть последний
  // момент, когда мы ещё живы и можем дописать.
  useEffect(() => {
    const hidden = () => {if (document.visibilityState === 'hidden') flush();};
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  /* ===== курсор ===== */
  const setOffset = useCallback(n => {
    const m = metaRef.current;
    const len = textRef.current.length;
    if (!m.cur || !len) return;
    const v = clamp(n, len);
    if ((m.at[m.cur] || 0) === v) return;
    applyMeta({...m, at: {...m.at, [m.cur]: v}});
    schedule();
  }, [applyMeta, schedule]);

  const setUi = useCallback(patch => {
    const m = metaRef.current;
    const next = readUi({...m.ui, ...patch});
    const cur = m.ui || UI;
    if (sameUi(next, cur)) return;
    applyMeta({...m, ui: next});
    schedule();
  }, [applyMeta, schedule]);

  const setLastApp = useCallback(id => {
    const m = metaRef.current;
    // «Продолжить» уводит только в читалки: home и library тут запоминать нечего.
    if (!APPS.includes(id) || m.last === id) return;
    applyMeta({...m, last: id});
    schedule();
  }, [applyMeta, schedule]);

  // Где закрыли приложение. От lastApp отличается тем, что тот отвечает на
  // вопрос «куда ведёт Продолжить» и потому знает только читалки. Этот —
  // на вопрос «где я был», и дом с библиотекой тут такие же ответы, как
  // остальные: вышел с дома — вернулся на дом.
  const setPlace = useCallback(p => {
    const m = metaRef.current;
    const next = readPlace(p);
    if (samePlace(next, m.place || null)) return;
    applyMeta({...m, place: next});
    schedule();
  }, [applyMeta, schedule]);

  // Куда смотрели на этом экране: карточка у кромки (в символах) и сколько её
  // ушло под кромку. От курсора отличается тем, что курсор отвечает «докуда
  // прочитано» и назад не едет, а это — «что было на экране», и при листании
  // назад они расходятся. Хранится внутри места и вместе с ним умирает: на
  // другом экране мерить эту прокрутку нечем.
  const setSeen = useCallback((at, y) => {
    const m = metaRef.current;
    if (!m.place) return;
    const next = readPlace({...m.place, at: clamp(at, textRef.current.length), y});
    if (next.at === m.place.at && next.y === m.place.y) return;
    applyMeta({...m, place: next});
    schedule();
  }, [applyMeta, schedule]);

  /* ===== книги ===== */
  const addBook = useCallback(async (title, body, incoming, images) => {
    if (mounted.current) setError(null);
    const raw = String(body ?? '');
    const txt = raw.trim();
    // Парсер считал смещения глав по СВОЕМУ тексту, а хранить мы будем
    // подрезанный. Ведущие пробелы сдвинули бы всё оглавление на свою длину.
    const lead = raw.length - raw.trimStart().length;
    if (!txt) {
      if (mounted.current) setError('Пустой текст — читать нечего.');
      return null;
    }

    const prev = metaRef.current;
    let id = String(Date.now());
    while (prev.books.some(b => b.id === id)) id = String(Number(id) + 1);   // две книги в одну мс

    // Сначала текст: он большой и падает первым. Мету трогаем только когда он лёг.
    try {
      await saveText(id, txt);
    } catch (e) {
      report(e);
      return null;
    }

    // Главы от парсера .fb2/.epub, а если их нет — распознанные в самом тексте.
    const toc = readToc(
      Array.isArray(incoming) && incoming.length
        ? incoming.map(c => ({...c, at: (Math.trunc(Number(c && c.at)) || 0) - lead}))
        : detect(txt),
      txt.length
    );
    try {
      await saveToc(id, toc);
    } catch {
      /* книга уже сохранена; без оглавления она читается, без текста — нет */
    }

    // Картинки — туда же и по тем же правилам: не легли, значит книга просто
    // будет без них. Смещения подрезаем на ведущие пробелы, как и главы.
    const {list, count} = await writePics(id, images, lead);
    const pix = readPix(list, txt.length);
    if (count) {
      try {
        await savePix(id, pix);
      } catch {
        /* список не лёг — картинки останутся лежать, но книга откроется */
      }
    }

    const next = {
      ...prev,
      books: [...prev.books, {
        id, title: (title || txt.slice(0, 40)).trim(), len: txt.length, toc: 1, pics: count
      }],
      at: {...prev.at, [id]: 0},
      cur: id
    };
    metaRef.current = next;
    if (timer.current) {clearTimeout(timer.current); timer.current = null;}
    dirty.current = false;
    try {
      await saveMeta(next);
    } catch (e) {
      // Мета не легла — откатываемся и убираем текст, иначе он осиротеет
      // в хранилище: из библиотеки его будет не видно и не удалить.
      metaRef.current = prev;
      await deleteText(id).catch(() => {});
      await deleteToc(id).catch(() => {});
      await dropPics(id, count);
      report(e);
      return null;
    }
    if (mounted.current) setMeta(next);
    applyText(txt);
    applyToc(toc);
    applyPix(pix);
    return id;
  }, [applyText, applyToc, applyPix, report]);

  const openBook = useCallback(async id => {
    if (mounted.current) setError(null);
    if (!metaRef.current.books.some(b => b.id === id)) return;

    const seq = ++openSeq.current;
    const txt = String((await loadText(id)) ?? '');
    if (seq !== openSeq.current) return;          // пока грузили — открыли другую книгу

    const base = metaRef.current;                 // мету перечитываем: за await она могла уехать
    const book = base.books.find(b => b.id === id) || null;
    const toc = await bookToc(book, txt);
    const pix = await bookPix(book, txt);
    if (seq !== openSeq.current) return;          // и ещё раз: чтение оглавления тоже асинхронно
    applyMeta({
      ...base,
      cur: id,
      at: {...base.at, [id]: clamp(base.at[id], txt.length)},
      books: base.books.map(b => (b.id === id ? {...b, len: txt.length, toc: 1} : b))
    });
    applyText(txt);
    applyToc(toc);
    applyPix(pix);
    await write();                                // смена книги важнее дебаунса
  }, [applyMeta, applyText, applyToc, applyPix, bookToc, bookPix, write]);

  const deleteBook = useCallback(async id => {
    if (mounted.current) setError(null);
    const gone = metaRef.current.books.find(b => b.id === id) || null;
    await deleteText(id);
    await deleteToc(id).catch(() => {});
    await dropPics(id, gone && gone.pics);

    const prev = metaRef.current;
    const books = prev.books.filter(b => b.id !== id);
    const at = {...prev.at};
    delete at[id];
    const next = {...prev, books, at};
    let txt = null;                               // null — текст не трогаем
    let toc = null;
    let pix = null;

    if (prev.cur === id) {
      const first = books[0] || null;
      next.cur = first ? first.id : null;
      txt = first ? String((await loadText(first.id)) ?? '') : '';
      toc = first ? await bookToc(first, txt) : [];
      pix = first ? await bookPix(first, txt) : [];
      if (first) {
        next.books = books.map(b => (b.id === first.id ? {...b, len: txt.length, toc: 1} : b));
        next.at = {...next.at, [first.id]: clamp(next.at[first.id], txt.length)};
      }
    }

    applyMeta(next);
    if (txt !== null) applyText(txt);
    if (toc !== null) applyToc(toc);
    if (pix !== null) applyPix(pix);
    await write();
  }, [applyMeta, applyText, applyToc, applyPix, bookToc, bookPix, write]);

  const value = useMemo(() => ({
    ready,
    books: meta.books,
    current: meta.books.find(b => b.id === meta.cur) || null,
    text,
    chapters,
    // Картинки книги: где какая стоит (`pics`) и как достать саму (`getPic`).
    // Порознь намеренно — список крошечный и нужен всем карточкам сразу, а
    // сама картинка тяжёлая и нужна только той, до которой долистали.
    pics,
    getPic,
    offset: meta.cur ? meta.at[meta.cur] || 0 : 0,
    setOffset,
    lastApp: meta.last,
    setLastApp,
    place: meta.place || null,
    setPlace,
    setSeen,
    flush,
    ui: meta.ui || UI,
    setUi,
    addBook,
    openBook,
    deleteBook,
    error
  }), [ready, meta, text, chapters, pics, getPic, error, setOffset, setLastApp, setPlace, setSeen,
       flush, setUi, addBook, openBook, deleteBook]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore() вызван вне <StoreProvider>');
  return v;
}

// Смещение всегда внутри [0, len-1]; на пустом тексте — 0.
function clamp(n, len) {
  const v = Math.trunc(Number(n)) || 0;
  if (!len) return 0;
  return Math.min(Math.max(v, 0), len - 1);
}
