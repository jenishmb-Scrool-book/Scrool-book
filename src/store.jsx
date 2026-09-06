import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {StorageFullError, deleteText, loadMeta, loadText, saveMeta, saveText} from './lib/storage.js';

// Одно состояние на всё приложение: сырой текст книги и один курсор.
//
// Курсор — СМЕЩЕНИЕ В СИМВОЛАХ, а не номер фрагмента. Стор специально не режет
// текст: у каждого экрана свой размер фрагмента, поэтому нарезка — дело экрана
// (см. useChunks), а общая для всех величина только одна — позиция в символах.
// Именно она и делает продукт: переключился с клипов на чаты — продолжил с того
// же места, хотя фрагменты там совсем другой длины.

const DEBOUNCE = 400;                                   // мс между последним сдвигом курсора и записью
const APPS = ['reels', 'chats', 'feed', 'video'];       // экраны-читалки, куда уводит «Продолжить»
const EMPTY = {books: [], cur: null, at: {}, last: 'reels'};

const Ctx = createContext(null);

export function StoreProvider({children}) {
  const [meta, setMeta] = useState(EMPTY);
  const [text, setText] = useState('');
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
        at: {...(raw.at || {})},
        last: APPS.includes(raw.last) ? raw.last : 'reels'
      };
      let txt = '';
      if (m.cur && m.books.some(b => b.id === m.cur)) {
        txt = String((await loadText(m.cur)) ?? '');
        m.at[m.cur] = clamp(m.at[m.cur], txt.length);
        m.books = m.books.map(b => (b.id === m.cur ? {...b, len: txt.length} : b));
      } else {
        m.cur = null;                       // мета ссылается на исчезнувшую книгу
      }
      if (!live) return;
      applyMeta(m);
      applyText(txt);
      setReady(true);
    })();
    return () => {live = false;};
  }, [applyMeta, applyText]);

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
  const setOffset = useCallback(n => {
    const m = metaRef.current;
    const len = textRef.current.length;
    if (!m.cur || !len) return;
    const v = clamp(n, len);
    if ((m.at[m.cur] || 0) === v) return;
    applyMeta({...m, at: {...m.at, [m.cur]: v}});
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
  const addBook = useCallback(async (title, body) => {
    if (mounted.current) setError(null);
    const txt = String(body ?? '').trim();
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

    const next = {
      ...prev,
      books: [...prev.books, {id, title: (title || txt.slice(0, 40)).trim(), len: txt.length}],
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
      report(e);
      return null;
    }
    if (mounted.current) setMeta(next);
    applyText(txt);
    return id;
  }, [applyText, report]);

  const openBook = useCallback(async id => {
    if (mounted.current) setError(null);
    if (!metaRef.current.books.some(b => b.id === id)) return;

    const seq = ++openSeq.current;
    const txt = String((await loadText(id)) ?? '');
    if (seq !== openSeq.current) return;          // пока грузили — открыли другую книгу

    const base = metaRef.current;                 // мету перечитываем: за await она могла уехать
    applyMeta({
      ...base,
      cur: id,
      at: {...base.at, [id]: clamp(base.at[id], txt.length)},
      books: base.books.map(b => (b.id === id ? {...b, len: txt.length} : b))
    });
    applyText(txt);
    await write();                                // смена книги важнее дебаунса
  }, [applyMeta, applyText, write]);

  const deleteBook = useCallback(async id => {
    if (mounted.current) setError(null);
    await deleteText(id);

    const prev = metaRef.current;
    const books = prev.books.filter(b => b.id !== id);
    const at = {...prev.at};
    delete at[id];
    const next = {...prev, books, at};
    let txt = null;                               // null — текст не трогаем

    if (prev.cur === id) {
      const first = books[0] || null;
      next.cur = first ? first.id : null;
      txt = first ? String((await loadText(first.id)) ?? '') : '';
      if (first) {
        next.books = books.map(b => (b.id === first.id ? {...b, len: txt.length} : b));
        next.at = {...next.at, [first.id]: clamp(next.at[first.id], txt.length)};
      }
    }

    applyMeta(next);
    if (txt !== null) applyText(txt);
    await write();
  }, [applyMeta, applyText, write]);

  const value = useMemo(() => ({
    ready,
    books: meta.books,
    current: meta.books.find(b => b.id === meta.cur) || null,
    text,
    offset: meta.cur ? meta.at[meta.cur] || 0 : 0,
    setOffset,
    lastApp: meta.last,
    setLastApp,
    addBook,
    openBook,
    deleteBook,
    error
  }), [ready, meta, text, error, setOffset, setLastApp, addBook, openBook, deleteBook]);

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
