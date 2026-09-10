import {useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import {percent} from '../ui/Progress.jsx';
import {pageCount} from '../lib/pages.js';
import {parseFb2} from '../lib/fb2.js';
import {parseEpub} from '../lib/epub.js';

// Стор возвращает Promise; но если реализация вдруг синхронная — не падаем.
const later = v => Promise.resolve(v);

// Коды ошибок парсеров → ключи i18n. Всё, что кодом не помечено, — просто
// «файл не разобрался»: пользователю незачем знать, XML там сломался или ZIP.
const ERR = {zip: 'lib.parse_failed_zip', unsupported: 'lib.unsupported'};

/**
 * Файл → {title, text}. Парсер выбираем по расширению, а не по MIME: Android
 * отдаёт для .fb2 и .epub то application/octet-stream, то пустую строку.
 */
const parseFile = async f => {
  const ext = (/\.(\w+)$/.exec(f.name) || ['', ''])[1].toLowerCase();
  if (ext === 'fb2') return parseFb2(await f.arrayBuffer());
  if (ext === 'epub') return parseEpub(await f.arrayBuffer());
  // Без расширения считаем текстом: хуже, чем отказ, только отказ по ошибке.
  if (!ext || ext === 'txt' || ext === 'md') return {title: '', text: await f.text()};
  throw Object.assign(new Error('неизвестное расширение: ' + ext), {code: 'unsupported'});
};

// Библиотека: только книги. Настройки живут отдельным экраном — этот файл
// иначе становится местом, где сходятся сразу несколько несвязанных задач.
export default function Library({go, back}) {
  const {books, current, text: bookText, offset, addBook, openBook, deleteBook} = useStore();
  const t = useT();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  // Разбор большого .fb2 и запись его на диск занимают заметное время, а на
  // экране до сих пор не менялось ничего. Секунда без единого признака жизни
  // читается как «не нажалось» — и человек жмёт второй раз, добавляя книгу дважды.
  //
  // Хранится ключ строки, а не флаг: разбор файла и сохранение — разные фазы,
  // и «разбираю файл» над вставленным из буфера текстом было бы просто неправдой.
  const [busy, setBusy] = useState('');

  const add = (title, body, chapters, images) => {
    const v = (body || '').trim();
    if (!v) {
      setBusy('');
      return setMsg(t('lib.empty_text'));
    }
    setMsg('');
    // Заголовок по умолчанию — первые 40 символов, как в прототипе.
    // addBook не реджектится: при переполнении и на пустом тексте она резолвится
    // в null и пишет причину в store.error. Поэтому решаем по id, а не по .catch.
    setBusy('lib.busy');
    later(addBook((title || v.slice(0, 40)).trim(), v, chapters, images))
      .then(id => {
        if (!id) return setMsg(t('lib.save_failed_space'));
        setText('');            // поле чистим только после успеха, иначе текст потерян навсегда
        go('home');
      })
      .catch(() => setMsg(t('lib.save_failed')))
      .finally(() => setBusy(''));
  };

  const fromPaste = () => {
    if (busy) return;
    add(text.split('\n')[0], text);
  };

  const fromFile = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';           // чтобы тот же файл можно было выбрать второй раз
    if (!f || busy) return;
    setMsg('');
    setBusy('lib.busy_file');
    parseFile(f)
      .then(r => {
        if (!String(r.text || '').trim()) {
          setBusy('');
          return setMsg(t('lib.no_text'));
        }
        // Главы от парсера идут в стор как есть. Если файл их не размечал,
        // стор сам распознает заголовки в тексте — как для вставленного руками.
        // Картинки идут туда же и тем же путём: стор кладёт их в хранилище
        // и запоминает, на каком смещении какая стояла.
        // add() снимет busy сам: она же и завершает всю операцию.
        add(r.title || f.name.replace(/\.\w+$/, ''), r.text, r.chapters, r.images);
      })
      .catch(err => {
        setBusy('');
        setMsg(t(ERR[err && err.code] || 'lib.parse_failed'));
      });
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
        onBack={back}
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
          <button onClick={fromPaste} disabled={!!busy}>{t('lib.add')}</button>
          <label className={'filebtn' + (busy ? ' off' : '')}>
            {t('lib.file')}
            <input type="file" accept=".txt,.md,.fb2,.epub" onChange={fromFile} disabled={!!busy} />
          </label>
        </div>
        {busy ? <div className="hint busy">{t(busy)}</div> : null}
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
