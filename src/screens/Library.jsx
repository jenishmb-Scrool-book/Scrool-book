import {useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import {percent} from '../ui/Progress.jsx';
import {pageCount} from '../lib/pages.js';
import {parseBook} from '../lib/book.js';
import {isNative} from '../native.js';
import Glyph from '../ui/Glyph.jsx';

// Стор возвращает Promise; но если реализация вдруг синхронная — не падаем.
const later = v => Promise.resolve(v);

// Коды ошибок парсеров → ключи i18n. Всё, что кодом не помечено, — просто
// «файл не разобрался»: пользователю незачем знать, XML там сломался или ZIP.
const ERR = {zip: 'lib.parse_failed_zip', unsupported: 'lib.unsupported', pdf: 'lib.pdf', empty: 'lib.no_text',
  binary: 'lib.binary', docx: 'lib.docx'};

// Что показывать в системном выборе файла.
//
// На телефоне — всё. Фильтр по расширению там не помогает, а мешает: Android
// сопоставляет расширение с типом по своей таблице, а `fb2` в ней нет, и книга
// в системном выборе оказывается серой — той самой, ради которой фильтр и
// ставили. Что за файл принесли, мы всё равно узнаём по его первым байтам.
// В браузере таблицы нет и расширение работает как написано — там фильтруем.
const ACCEPT = '.txt,.md,.fb2,.epub,.zip';

// Библиотека: только книги. Настройки живут отдельным экраном — этот файл
// иначе становится местом, где сходятся сразу несколько несвязанных задач.
export default function Library({go, back}) {
  const {books, current, text: bookText, offset, positions, addBook, openBook, deleteBook, renameBook} = useStore();
  const t = useT();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');     // не ошибка — просто что случилось
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
    setNote('');
    // Заголовок по умолчанию — первые 40 символов, как в прототипе.
    // addBook не реджектится: при переполнении и на пустом тексте она резолвится
    // в null и пишет причину в store.error. Поэтому решаем по id, а не по .catch.
    setBusy('lib.busy');
    later(addBook((title || v.slice(0, 40)).trim(), v, chapters, images))
      .then(id => {
        // Причину неудачи показывает плашка стора — своими словами и верно:
        // «кончилось место» здесь говорилось о любой неудаче записи, и рядом
        // с плашкой это было второе сообщение об одном и том же.
        if (!id) return;
        setText('');            // поле чистим только после успеха, иначе текст потерян навсегда
        // Книга уже была (та же целиком или та, чей текст пропал): она открыта
        // на своём месте. Говорим это здесь, а не молча уводим на дом —
        // иначе непонятно, что сработало и куда делась «новая» книга.
        if (books.some(b => b.id === id)) {
          setBusy('');
          setNote(t('lib.again'));
          return;
        }
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
    parseBook(f)
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

  // Переименовать — системным окном ввода: оно уже есть и привычно, а своё
  // окно поверх библиотеки было бы ещё одним экраном ради одной строки.
  const rename = (e, b) => {
    e.stopPropagation();           // нажатие по карандашу не должно открывать книгу
    const v = window.prompt(t('lib.rename_ask'), b.title);
    if (v != null) renameBook(b.id, v);
  };

  const remove = (e, b) => {
    e.stopPropagation();           // клик по крестику не должен открывать книгу
    if (window.confirm(t('lib.confirm_delete', {title: b.title}))) {
      later(deleteBook(b.id)).catch(() => {});
    }
  };

  // Сколько прочитано — у каждой книги, а не только у открытой. Раньше у
  // остальных стоял один размер, и выбрать «ту, что почти дочитал» из списка
  // было нельзя: место в каждой книге стор хранил всегда, но не отдавал.
  // У открытой книги длина и место — живые, у остальных — из записи книги.
  const shareOf = b => {
    const open = current && b.id === current.id && bookText.length;
    return open
      ? percent(offset, bookText.length)
      : percent((positions && positions[b.id]) || 0, b.len);
  };

  return (
    <Screen id="library">
      <StatusBar />
      <Header
        onBack={back}
        title={t('lib.title')}
        right={
          <span className="ic" onClick={() => go('settings')} role="button" aria-label={t('set.title')}>
            <Glyph name="gear" />
          </span>
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
            <input type="file" accept={isNative() ? '*/*' : ACCEPT} onChange={fromFile} disabled={!!busy} />
          </label>
        </div>
        {busy ? <div className="hint busy">{t(busy)}</div> : null}
        {/* Ошибка — не подсказка: серым она терялась среди пояснений под ней. */}
        {msg ? <div className="hint bad" role="alert">{msg}</div> : null}
        {note ? <div className="hint note" role="status">{note}</div> : null}
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
                <span>
                  {t('lib.pages', {n: pageCount(b.len)})} · {Math.round(shareOf(b))}%
                  {current && b.id === current.id && !bookText.length ? ' · ' + t('lib.missing') : ''}
                </span>
                <i className="pbar"><em style={{transform: `scaleX(${(shareOf(b) / 100).toFixed(4)})`}} /></i>
              </div>
              <span className="x" onClick={e => rename(e, b)} role="button" aria-label={t('lib.rename')}>
                <Glyph name="pencil" />
              </span>
              <span className="x" onClick={e => remove(e, b)} role="button" aria-label={t('delete')}>
                <Glyph name="close" />
              </span>
            </div>
          )) : <div className="hint">{t('lib.nothing')}</div>}
        </div>
      </div>
    </Screen>
  );
}
