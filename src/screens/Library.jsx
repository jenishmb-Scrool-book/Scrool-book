import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {clearWallpaper, getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import {percent} from '../ui/Progress.jsx';
import {pageCount} from '../lib/pages.js';

// Стор возвращает Promise; но если реализация вдруг синхронная — не падаем.
const later = v => Promise.resolve(v);

export default function Library({go}) {
  const {books, current, text: bookText, offset, addBook, openBook, deleteBook} = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [wall, setWall] = useState('');

  useEffect(() => {
    let live = true;
    getWallpaper().then(w => live && setWall(w)).catch(() => {});
    return () => {live = false;};
  }, []);

  // Картинку ужимаем ДО записи: оригинал обоев с телефона — это мегабайты,
  // которые не влезут в квоту и не нужны на экране шириной 440px.
  const fromImage = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMsg('');
    shrink(f)
      .then(uri => setWallpaper(uri).then(() => setWall(uri)))
      .catch(err => setMsg(err.message || 'Не удалось поставить обои'));
  };

  const dropWall = () => clearWallpaper().then(() => setWall('')).catch(() => {});

  const add = (title, body) => {
    const t = (body || '').trim();
    if (!t) return setMsg('Пустой текст');
    setMsg('');
    // Заголовок по умолчанию — первые 40 символов, как в прототипе.
    // addBook не реджектится: при переполнении и на пустом тексте она резолвится
    // в null и пишет причину в store.error. Поэтому решаем по id, а не по .catch.
    later(addBook((title || t.slice(0, 40)).trim(), t))
      .then(id => {
        if (!id) return setMsg('Не удалось сохранить — возможно, кончилось место');
        setText('');            // поле чистим только после успеха, иначе текст потерян навсегда
        go('home');
      })
      .catch(() => setMsg('Не удалось сохранить текст'));
  };

  const fromPaste = () => add(text.split('\n')[0], text);

  const fromFile = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';           // чтобы тот же файл можно было выбрать второй раз
    if (f) f.text().then(t => add(f.name.replace(/\.\w+$/, ''), t));
  };

  const open = id => later(openBook(id)).then(() => go('home')).catch(() => {});

  const remove = (e, b) => {
    e.stopPropagation();           // клик по «✕» не должен открывать книгу
    if (window.confirm('Удалить «' + b.title + '»?')) later(deleteBook(b.id)).catch(() => {});
  };

  // Прогресс стор отдаёт только для текущей книги — у остальных показываем
  // просто размер. См. контракт useStore(): смещение там одно, не по книгам.
  const progressOf = b =>
    current && b.id === current.id && bookText.length
      ? ' · ' + Math.round(percent(offset, bookText.length)) + '%'
      : '';

  return (
    <Screen id="library">
      <StatusBar />
      <Header onBack={() => go('home')} title="Библиотека" />
      <div className="body">
        <textarea
          placeholder="Вставь сюда текст книги…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="row">
          <button onClick={fromPaste}>Добавить</button>
          <label className="filebtn">
            Файл .txt
            <input type="file" accept=".txt,.md,text/plain" onChange={fromFile} />
          </label>
        </div>
        {msg ? <div className="hint">{msg}</div> : null}
        <div className="hint">
          Один текст — один прогресс. Читай его в чатах, клипах, ленте или «видео», позиция общая.
        </div>

        <div className="sect">Обои рабочего стола</div>
        <div className="row">
          <label className="filebtn">
            {wall ? 'Заменить' : 'Выбрать из галереи'}
            <input type="file" accept="image/*" onChange={fromImage} />
          </label>
          {wall ? <button className="ghost" onClick={dropWall}>Убрать</button> : null}
        </div>
        {wall ? <div className="wallprev" style={{backgroundImage: `url(${wall})`}} /> : null}
        <div className="hint">
          Поставь те же обои, что на твоём телефоне — домашний экран приложения станет похож на настоящий.
          Скриншот лаунчера снять нельзя: Android это запрещает приложениям.
        </div>
        <div>
          {books.length ? books.map(b => (
            <div
              className={'book' + (current && b.id === current.id ? ' sel' : '')}
              key={b.id}
              onClick={() => open(b.id)}
            >
              <div className="i">
                <b>{b.title}</b>
                <span>{pageCount(b.len)} стр.{progressOf(b)}</span>
              </div>
              <span className="x" onClick={e => remove(e, b)} role="button" aria-label="Удалить">✕</span>
            </div>
          )) : <div className="hint">Пока пусто.</div>}
        </div>
      </div>
    </Screen>
  );
}
