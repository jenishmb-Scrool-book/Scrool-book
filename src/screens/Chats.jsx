import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad} from '../ui/visual.js';
import {contacts, msgTime} from '../lib/fake.js';
import {pageAt, pageCount} from '../lib/pages.js';

// «Мессенджер» — три экрана на одном движке:
//   Chats — список переписок,
//   Chat  — сама книга, приходящая сообщениями,
//   Stub  — витринный чат, чтобы список не состоял из одной строки.
//
// Раньше здесь была лента пузырей с кнопкой «Дальше ↓». Владелец сказал прямо:
// «чтобы выходили чаты, а не просто дальше-дальше». Кнопка и была тем местом,
// где обман разваливался: в настоящем мессенджере не листают книгу кнопкой.
// Поэтому вперёд ведёт скролл (как в клипах и ленте), а кнопка осталась только
// в виде «отправить» в поле ввода — то есть выглядит как часть мессенджера.

const DECOYS = 6;      // столько витринных чатов в списке
const TYPING = 260;    // мс, столько показывается «печатает…» после отправки

function ChatHead({onBack, seed, glyph, title, sub}) {
  return (
    <div className="chdr">
      <span className="back" onClick={onBack} role="button" aria-label="Назад">‹</span>
      <div className="av sm" style={{background: grad(seed)}}>{glyph}</div>
      <div className="who">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <span className="ic">⋮</span>
    </div>
  );
}

function Row({seed, glyph, name, text, time, badge, pin, onClick}) {
  return (
    <div className={pin ? 'crow pin' : 'crow'} onClick={onClick}>
      <div className="av" style={{background: grad(seed)}}>{glyph}</div>
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

export default function Chats({go}) {
  const {current, text, offset, ui} = useStore();
  const t = useT();
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
        <h2>{t('chats.list')}</h2>
        <span className="ic">✎</span>
      </div>
      <div className="msearch">⌕ {t('chats.search')}</div>
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
    </Screen>
  );
}

export function Chat({go}) {
  const {current, text, offset, ui} = useStore();
  const t = useT();
  const {chunks, pos, setPos} = useChunks(SIZE.chats);
  const count = chunks.length;
  const {boxRef, items} = useCardWindow({
    count, pos, setPos, ahead: 8, cardSelector: '.msg', anchor: 'bottom'
  });
  const [typing, setTyping] = useState(false);
  const timer = useRef(0);
  const stick = useRef(false);       // просили ли прокрутку вниз после этого рендера
  const last = pos + 1 >= count;

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
        onBack={() => go('chats')}
        seed={2}
        glyph="📖"
        title={current ? current.title : t('chats.title')}
        sub={typing ? t('chats.typing') : t('chats.online')}
      />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="daysep">{t('today')}</div>
        {items.map(i => (
          <div className="msg" key={i} data-i={i}>
            {typing && i === pos ? (
              <span className="dots"><i /><i /><i /></span>
            ) : (
              <>
                {chunks[i].text}
                <span className="t">{msgTime(i)}</span>
              </>
            )}
          </div>
        ))}
        {last ? <div className="done">{t('reader.end')}</div> : null}
      </div>
      {/* Поле ввода нерабочее и таким и задумано: отвечать книге некому.
          Оно здесь потому, что без него экран не читается как мессенджер, —
          а кнопка «отправить» заодно заменила бывшую кнопку «Дальше». */}
      <div className="composer">
        <span className="ic">☺</span>
        <div className="fld">{t('chats.composer')}</div>
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
        onBack={() => go('chats')}
        seed={c.seed}
        glyph={c.name.slice(0, 1)}
        title={c.name}
        sub={t('chats.online')}
      />
      <div className="body">
        <div className="daysep">{t('today')}</div>
        <div className="msg">{t('chats.stub_1')}<span className="t">{msgTime(3)}</span></div>
        <div className="msg out">{t('chats.stub_me')}<span className="t">{msgTime(4)}</span></div>
        <div className="msg">{t('chats.stub_3')}<span className="t">{msgTime(6)}</span></div>
        <div className="note">{t('chats.stub_note')}</div>
        <button className="next" onClick={() => go('chat')}>{t('chats.to_book')}</button>
      </div>
    </Screen>
  );
}
