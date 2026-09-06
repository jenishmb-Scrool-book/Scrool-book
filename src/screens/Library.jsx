import {useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import {percent} from '../ui/Progress.jsx';
import {pageCount} from '../lib/pages.js';

// Стор возвращает Promise; но если реализация вдруг синхронная — не падаем.
const later = v => Promise.resolve(v);

// Библиотека: только книги. Настройки живут отдельным экраном — этот файл
// иначе становится местом, где сходятся сразу несколько несвязанных задач.
export default function Library({go}) {
  const {books, current, text: bookText, offset, addBook, openBook, deleteBook} = useStore();
  const t = useT();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const add = (title, body) => {
    const v = (body || '').trim();
    if (!v) return setMsg(t('lib.empty_text'));
    setMsg('');
    // Заголовок по умолчанию — первые 40 символов, как в прототипе.
    // addBook не реджектится: при переполнении и на пустом тексте она резолвится
    // в null и пишет причину в store.error. Поэтому решаем по id, а не по .catch.
    later(addBook((title || v.slice(0, 40)).trim(), v))
      .then(id => {
        if (!id) return setMsg(t('lib.save_failed_space'));
        setText('');            // поле чистим только после успеха, иначе текст потерян навсегда
        go('home');
      })
      .catch(() => setMsg(t('lib.save_failed')));
  };

  const fromPaste = () => add(text.split('\n')[0], text);

  const fromFile = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';           // чтобы тот же файл можно было выбрать второй раз
    if (f) f.text().then(v => add(f.name.replace(/\.\w+$/, ''), v));
  };

  const open = id => later(openBook(id)).then(() => go('home')).catch(() => {});

  const remove = (e, b) => {
    e.stopPropagation();           // клик по «✕» не должен открывать книгу
    if (window.confirm(t('lib.confirm_delete', {title: b.title}))) {
      later(deleteBook(b.id)).catch(() => {});
    }
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
      <Header
        onBack={() => go('home')}
        title={t('lib.title')}
        right={
          <span onClick={() => go('settings')} role="button" aria-label={t('set.title')}
                style={{cursor: 'pointer', opacity: .7}}>⚙</span>
        }
      />
      <div className="body">
        <textarea
          placeholder={t('lib.placeholder')}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="row">
          <button onClick={fromPaste}>{t('lib.add')}</button>
          <label className="filebtn">
            {t('lib.file')}
            <input type="file" accept=".txt,.md,text/plain" onChange={fromFile} />
          </label>
        </div>
        {msg ? <div className="hint">{msg}</div> : null}
        <div className="hint">{t('lib.hint')}</div>

        <div>
          {books.length ? books.map(b => (
            <div
              className={'book' + (current && b.id === current.id ? ' sel' : '')}
              key={b.id}
              onClick={() => open(b.id)}
            >
              <div className="i">
                <b>{b.title}</b>
                <span>{t('lib.pages', {n: pageCount(b.len)})}{progressOf(b)}</span>
              </div>
              <span className="x" onClick={e => remove(e, b)} role="button" aria-label={t('delete')}>✕</span>
            </div>
          )) : <div className="hint">{t('lib.nothing')}</div>}
        </div>
      </div>
    </Screen>
  );
}
