import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {chunk} from './lib/chunk.js';
import {StorageFullError, deleteText, loadMeta, loadText, saveMeta, saveText} from './lib/storage.js';

// Одно состояние на всё приложение: книга порезана на чанки один раз, курсор один.
// Экраны — это разные рендереры одной пары (chunks, pos), поэтому позиция чтения общая.

const DEBOUNCE = 400;                                   // мс между последним сдвигом курсора и записью
const APPS = ['reels', 'chats', 'feed', 'video'];       // экраны-читалки, куда уводит «Продолжить»
const EMPTY = {books: [], cur: null, pos: {}, last: 'reels'};

const Ctx = createContext(null);

export function StoreProvider({children}) {
  const [meta, setMeta] = useState(EMPTY);
  const [chunks, setChunks] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Зеркала состояния для колбэков: дебаунс и async-операции не должны
  // ловить устаревшее замыкание.
  const metaRef = useRef(EMPTY);
  const chunksRef = useRef([]);
  const timer = useRef(null);
  const dirty = useRef(false);       // есть несохранённые изменения меты
  const mounted = useRef(true);
  const openSeq = useRef(0);         // защита от гонки двух openBook подряд

  const applyMeta = useCallback(next => {
    metaRef.current = next;
    if (mounted.current) setMeta(next);
  }, []);
  const applyChunks = useCallback(parts => {
    chunksRef.current = parts;
    if (mounted.current) setChunks(parts);
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

  /* ===== гидрация ===== */
  useEffect(() => {
    let live = true;
    (async () => {
      const raw = (await loadMeta()) || EMPTY;
      const m = {
        books: Array.isArray(raw.books) ? raw.books : [],
        cur: raw.cur ?? null,
        pos: {...(raw.pos || {})},
        last: APPS.includes(raw.last) ? raw.last : 'reels'
      };
      let parts = [];
      if (m.cur && m.books.some(b => b.id === m.cur)) {
        parts = chunk(await loadText(m.cur));
        m.pos[m.cur] = clamp(m.pos[m.cur], parts.length);
        m.books = m.books.map(b => (b.id === m.cur ? {...b, n: parts.length} : b));
      } else {
        m.cur = null;                       // мета ссылается на исчезнувшую книгу
      }
      if (!live) return;
      applyMeta(m);
      applyChunks(parts);
      setReady(true);
    })();
    return () => {live = false;};
  }, [applyMeta, applyChunks]);

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

  /* ===== курсор ===== */
  const setPos = useCallback(i => {
    const m = metaRef.current;
    const n = chunksRef.current.length;
    if (!m.cur || !n) return;
    const v = clamp(i, n);
    if ((m.pos[m.cur] || 0) === v) return;
    applyMeta({...m, pos: {...m.pos, [m.cur]: v}});
    schedule();
  }, [applyMeta, schedule]);

  const setLastApp = useCallback(id => {
    const m = metaRef.current;
    // «Продолжить» уводит только в читалки: home и library тут запоминать нечего.
    if (!APPS.includes(id) || m.last === id) return;
    applyMeta({...m, last: id});
    schedule();
  }, [applyMeta, schedule]);

  /* ===== книги ===== */
  const addBook = useCallback(async (title, text) => {
    if (mounted.current) setError(null);
    const txt = String(text ?? '').trim();
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

    const parts = chunk(txt);
    const next = {
      ...prev,
      books: [...prev.books, {id, title: (title || txt.slice(0, 40)).trim(), n: parts.length}],
      pos: {...prev.pos, [id]: 0},
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
      report(e);
      return null;
    }
    if (mounted.current) {setMeta(next); }
    applyChunks(parts);
    return id;
  }, [applyChunks, report]);

  const openBook = useCallback(async id => {
    if (mounted.current) setError(null);
    if (!metaRef.current.books.some(b => b.id === id)) return;

    const seq = ++openSeq.current;
    const parts = chunk(await loadText(id));
    if (seq !== openSeq.current) return;          // пока грузили — открыли другую книгу

    const base = metaRef.current;                 // мету перечитываем: за await она могла уехать
    applyMeta({
      ...base,
      cur: id,
      pos: {...base.pos, [id]: clamp(base.pos[id], parts.length)},
      books: base.books.map(b => (b.id === id ? {...b, n: parts.length} : b))
    });
    applyChunks(parts);
    await write();                                // смена книги важнее дебаунса
  }, [applyMeta, applyChunks, write]);

  const deleteBook = useCallback(async id => {
    if (mounted.current) setError(null);
    await deleteText(id);

    const prev = metaRef.current;
    const books = prev.books.filter(b => b.id !== id);
    const pos = {...prev.pos};
    delete pos[id];
    const next = {...prev, books, pos};
    let parts = null;                             // null — чанки не трогаем

    if (prev.cur === id) {
      const first = books[0] || null;
      next.cur = first ? first.id : null;
      parts = first ? chunk(await loadText(first.id)) : [];
      if (first) {
        next.books = books.map(b => (b.id === first.id ? {...b, n: parts.length} : b));
        next.pos = {...next.pos, [first.id]: clamp(next.pos[first.id], parts.length)};
      }
    }

    applyMeta(next);
    if (parts) applyChunks(parts);
    await write();
  }, [applyMeta, applyChunks, write]);

  const value = useMemo(() => ({
    ready,
    books: meta.books,
    current: meta.books.find(b => b.id === meta.cur) || null,
    chunks,
    pos: meta.cur ? meta.pos[meta.cur] || 0 : 0,
    setPos,
    lastApp: meta.last,
    setLastApp,
    addBook,
    openBook,
    deleteBook,
    error
  }), [ready, meta, chunks, error, setPos, setLastApp, addBook, openBook, deleteBook]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore() вызван вне <StoreProvider>');
  return v;
}

// Курсор всегда внутри [0, n-1]; на пустой книге — 0.
function clamp(i, n) {
  const v = Math.trunc(Number(i)) || 0;
  return Math.max(0, Math.min(v, Math.max(0, n - 1)));
}
