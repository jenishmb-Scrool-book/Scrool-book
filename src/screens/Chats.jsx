import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad} from '../ui/visual.js';
import {skinOf} from '../ui/skins.js';
import {contacts, msgTime} from '../lib/fake.js';
import {pageAt, pageCount} from '../lib/pages.js';

// «Мессенджер» — три экрана на одном движке:
//   Chats — список переписок,
//   Chat  — сама книга, приходящая сообщениями,
//   Stub  — витринный чат, чтобы список не состоял из одной строки.
//
// Вперёд ведёт скролл (как в клипах и ленте); кнопка осталась только в виде
// «отправить» в поле ввода — то есть выглядит как часть мессенджера.
//
// Про скины. Их три, и различаются они не цветом, а СОСТАВОМ экрана: у одного
// нижняя панель, у другого её нет, у третьего белая шапка и круглые пузыри без
// хвоста. Состав лежит в `ui/skins.js`, потому что именно он делает три разных
// приложения из одного кода — палитра этого никогда не делала.

const DECOYS = 6;      // столько витринных чатов в списке
const TYPING = 260;    // мс, столько показывается «печатает…» после отправки
const GROUP = 4;       // сообщений в «пачке»: хвост рисуется только у первого

function Avatar({seed, glyph, cls}) {
  return <div className={cls || 'av'} style={{background: grad(seed)}}>{glyph}</div>;
}

/**
 * Шапка переписки. Иконки справа берутся у скина: в «зелёном» это камера и
 * трубка, в «синем» — только трубка. Последняя иконка — единственная живая:
 * перепрыгнуть по главам в мессенджере больше нечем, а иногда нужно.
 */
function ChatHead({skin, onBack, seed, glyph, title, sub, onMenu}) {
  const S = skinOf(skin);
  const last = S.chat.length - 1;
  return (
    <div className="chdr">
      <span className="back" onClick={onBack} role="button" aria-label="Назад">‹</span>
      <Avatar seed={seed} glyph={glyph} cls="av sm" />
      <div className="who">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      {S.chat.map((ic, k) => (
        <span key={k} className="ic"
              onClick={k === last ? onMenu : undefined}
              role={k === last && onMenu ? 'button' : undefined}>{ic}</span>
      ))}
    </div>
  );
}

function Row({seed, glyph, name, text, time, badge, pin, onClick}) {
  return (
    <div className={pin ? 'crow pin' : 'crow'} onClick={onClick}>
      <Avatar seed={seed} glyph={glyph} />
      <div className="ci">
        <b>{pin ? <span className="pinned">📌</span> : null}{name}</b>
        <span>{text}</span>
      </div>
      <div className="cm">
        <i>{time}</i>
        {badge ? <em>{badge > 99 ? '99+' : badge}</em> : null}
      </div>
    </div>
  );
}

/**
 * Пузырь сообщения.
 *
 * `sp` — пустая распорка в конце текста шириной под время. Без неё время,
 * висящее в правом нижнем углу пузыря, ложится поверх последней строки; с ней
 * текст обтекает его, как в настоящем мессенджере. Это единственный способ
 * получить такое поведение без измерений в JS.
 */
function Bubble({text, time, out, tail, tick}) {
  const cls = ['msg', out ? 'out' : '', tail ? 'tail' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {text}
      <span className="sp" />
      <span className="t">{time}{tick ? <i className="tick">✓✓</i> : null}</span>
    </div>
  );
}

export default function Chats({go}) {
  const {current, text, offset, ui} = useStore();
  const t = useT();
  const S = skinOf(ui.skin);
  const list = useMemo(() => contacts(DECOYS), []);
  const len = text.length;

  // Превью и счётчик считаются без нарезки. Чанкер прошёлся бы по всей книге
  // ради ста символов предпросмотра — на списке чатов это чистая трата.
  const preview = text.slice(offset, offset + 120).replace(/\s+/g, ' ').trim();
  const rest = Math.max(0, pageCount(len) - pageAt(offset, len));

  return (
    <Screen id="chats" skin={ui.skin}>
      <StatusBar />
      <div className="mhdr">
        <span className="back" onClick={() => go('home')} role="button" aria-label={t('back')}>‹</span>
        {/* В шапке списка стоит имя «приложения», а не слово «Чаты»: так это
            устроено во всех настоящих мессенджерах, и с одного взгляда видно,
            в каком из трёх ты сейчас. */}
        <h2>{S.name}</h2>
        {S.head.map((ic, k) => <span key={k} className="ic">{ic}</span>)}
      </div>
      {S.search ? <div className="msearch">⌕ {t('chats.search')}</div> : null}
      <div className="body">
        <Row
          pin
          seed={2}
          glyph="📖"
          name={current ? current.title : t('chats.title')}
          text={preview || t('home.empty')}
          time={msgTime(pageAt(offset, len))}
          badge={rest}
          onClick={() => go('chat')}
        />
        {list.map((c, k) => (
          <Row
            key={c.id}
            seed={c.seed}
            glyph={c.name.slice(0, 1)}
            name={c.name}
            text={t('chats.stub_' + (c.stub + 1))}
            time={c.time}
            badge={c.unread}
            onClick={() => go('stub', {arg: k})}
          />
        ))}
      </div>
      {/* Кнопка «новое сообщение». Нерабочая: писать в этом приложении некому.
          Стоит потому, что её отсутствие заметнее, чем её бездействие, — она
          есть в каждом мессенджере ровно в этом углу. */}
      <div className="fab" aria-hidden="true">{S.fab}</div>
      {S.tabs ? <Tabbar items={S.tabs} active={0} /> : null}
    </Screen>
  );
}

export function Chat({go}) {
  const {current, text, offset, ui} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.chats);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({
    count, pos, setPos, ahead: 8, cardSelector: '.mline', anchor: 'bottom'
  });
  const [typing, setTyping] = useState(false);
  const timer = useRef(0);
  const stick = useRef(false);       // просили ли прокрутку вниз после этого рендера
  const last = pos + 1 >= count;

  // Черта «непрочитанные» ставится там, где человек вошёл на экран, и дальше
  // не двигается — как в настоящем мессенджере. Если бы она ехала за курсором,
  // она не значила бы ничего: под ней всегда было бы «всё остальное».
  const entry = useRef(pos);
  const unreadAt = entry.current + 1;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Курсор двигаем сразу, а «печатает…» — только оформление последнего пузыря.
  // Если бы курсор ждал таймер, уход с экрана в эти 260 мс терял бы фрагмент.
  const send = () => {
    if (last) return;
    setPos(pos + 1);
    stick.current = true;
    setTyping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTyping(false), TYPING);
  };

  // Прокрутка к новому сообщению нужна дважды: когда пузырь появился точками и
  // когда точки сменились текстом — высота при этом меняется, и без второго
  // раза сообщение уезжает под нижнюю кромку.
  //
  // Именно к сообщению, а не к концу списка: окно рендера уходит на полтора
  // десятка пузырей вперёд, и прокрутка «в самый низ» перескакивала бы через
  // непрочитанное, а обработчик скролла следом утаскивал бы туда и курсор.
  useLayoutEffect(() => {
    if (!stick.current) return;
    const box = boxRef.current;
    const el = box && box.querySelector('[data-i="' + pos + '"]');
    if (box && el) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
    if (!typing) stick.current = false;
  }, [pos, typing, boxRef]);

  return (
    <Screen id="chat" skin={ui.skin}>
      <StatusBar />
      <ChatHead
        skin={ui.skin}
        onBack={() => go('chats')}
        seed={2}
        glyph="📖"
        title={current ? current.title : t('chats.title')}
        sub={typing ? t('chats.typing') : t('chats.online')}
        onMenu={() => go('toc')}
      />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="daysep"><span>{t('today')}</span></div>
        {items.map(i => (
          <div className="mline" key={i} data-i={i}>
            {i === unreadAt && i < count ? (
              <div className="unread"><span>{t('chats.unread')}</span></div>
            ) : null}
            {typing && i === pos ? (
              <div className="msg tail"><span className="dots"><i /><i /><i /></span></div>
            ) : (
              <Bubble text={chunks[i].text} time={msgTime(i)} tail={i % GROUP === 0} />
            )}
          </div>
        ))}
        {last ? <div className="done">{t('reader.end')}</div> : null}
      </div>
      {/* Поле ввода нерабочее и таким и задумано: отвечать книге некому.
          Оно здесь потому, что без него экран не читается как мессенджер, —
          а кнопка «отправить» заодно заменила бывшую кнопку «Дальше». */}
      <div className="composer">
        <div className="cbox">
          <span className="ic">☺</span>
          <div className="fld">{t('chats.composer')}</div>
          <span className="ic">⊕</span>
        </div>
        <button className="send" onClick={send} disabled={last} aria-label={t('chats.composer')}>➤</button>
      </div>
    </Screen>
  );
}

/**
 * Витринный чат. Открывается с любой строки списка, кроме книги.
 *
 * Мог бы вообще не открываться, но список, где шесть строк из семи не нажимаются,
 * ощущается сломанным, а не декоративным. Три реплики и честная подпись стоят
 * дешевле, чем впечатление недоделанного приложения.
 */
export function Stub({go, arg}) {
  const {ui} = useStore();
  const t = useT();
  const list = useMemo(() => contacts(DECOYS), []);
  const i = Math.min(Math.max(Math.trunc(Number(arg)) || 0, 0), list.length - 1);
  const c = list[i];

  return (
    <Screen id="chat" skin={ui.skin}>
      <StatusBar />
      <ChatHead
        skin={ui.skin}
        onBack={() => go('chats')}
        seed={c.seed}
        glyph={c.name.slice(0, 1)}
        title={c.name}
        sub={t('chats.online')}
      />
      <div className="body">
        <div className="daysep"><span>{t('today')}</span></div>
        {/* Галочки стоят только у своего сообщения: у чужих их не бывает, и
            именно эта мелочь выдаёт подделку быстрее всего. */}
        <Bubble text={t('chats.stub_1')} time={msgTime(3)} tail />
        <Bubble text={t('chats.stub_me')} time={msgTime(4)} out tail tick />
        <Bubble text={t('chats.stub_3')} time={msgTime(6)} tail />
        <div className="note">{t('chats.stub_note')}</div>
        <button className="next" onClick={() => go('chat')}>{t('chats.to_book')}</button>
      </div>
      <div className="composer">
        <div className="cbox">
          <span className="ic">☺</span>
          <div className="fld">{t('chats.composer')}</div>
          <span className="ic">⊕</span>
        </div>
        <span className="send off" aria-hidden="true">➤</span>
      </div>
    </Screen>
  );
}
