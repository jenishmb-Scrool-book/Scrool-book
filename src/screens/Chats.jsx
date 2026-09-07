import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Progress from '../ui/Progress.jsx';
import Tabbar from '../ui/Tabbar.jsx';
import useCardWindow from '../ui/useCardWindow.js';
import useChunks from '../ui/useChunks.js';
import {SIZE} from '../ui/sizes.js';
import {grad, reaction, reactionCount, sticker} from '../ui/visual.js';
import {shot} from '../ui/pics.js';
import {skinOf} from '../ui/skins.js';
import {contactAt, msgTime} from '../lib/fake.js';

// «Мессенджер» — два экрана на одном движке, и ЧИТАТЬ можно на обоих.
//
//   Chats — список переписок. Каждая строка это кусок книги, подписанный
//           очередным именем: книга как будто приходит от разных людей.
//           Прокрутка списка двигает курсор — то есть по контактам можно
//           просто идти сверху вниз и читать, никуда не заходя.
//   Chat  — разговор. Тот же текст, но репликами по очереди: одну говорит
//           собеседник, следующую ты. Между ними — смайлики и реакции.
//
// Так это устроено по прямой просьбе владельца: «чтобы информация из книги
// была не внутри чата, а снаружи, — можно было читать, просто проходя по
// контактам; а когда заходишь внутрь, пусть будет как переписка: сперва
// один пишет, потом другой, и между ними смайлики смеха или сердечек».
//
// Витринных чатов больше нет и не нужно: раньше список состоял из одной живой
// строки и шести нарисованных, теперь живые все.

const TYPING = 260;    // мс, столько показывается «печатает…» после отправки

// Кто говорит. Строгое чередование: чётные — собеседник, нечётные — ты.
// Реплики книги длинные, и любая «умная» группировка тут же превращает
// разговор обратно в монолог, который и просили убрать.
const isOut = i => i % 2 === 1;

// Аватарка со снимком. Буква на цветном кружке — это как выглядит контакт БЕЗ
// фотографии, и когда без фотографии весь список, он читается как пустой.
function Avatar({seed, cls}) {
  return <div className={cls || 'av'} style={{background: shot(seed, grad(seed))}} />;
}

/**
 * Шапка переписки. Иконки справа берутся у скина: в «зелёном» это камера и
 * трубка, в «синем» — только трубка. Последняя иконка — единственная живая:
 * перепрыгнуть по главам в мессенджере больше нечем, а иногда нужно.
 */
function ChatHead({skin, onBack, seed, title, sub, onMenu}) {
  const S = skinOf(skin);
  const last = S.chat.length - 1;
  return (
    <div className="chdr">
      <span className="back" onClick={onBack} role="button" aria-label="Назад">‹</span>
      <Avatar seed={seed} cls="av sm" />
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

/**
 * Строка списка. Превью здесь НЕ обрезается многоточием, а показывается в две
 * строки: это не подпись к чату, это сам текст, и оборвать его на середине
 * значило бы сломать единственное, зачем экран нужен.
 */
function Row({i, name, seed, text, time, state, onClick}) {
  return (
    <div className={'crow ' + state} data-i={i} onClick={onClick}>
      <Avatar seed={seed} />
      <div className="ci">
        <b>{name}</b>
        <span>{text}</span>
      </div>
      <div className="cm">
        <i>{time}</i>
        {state === 'new' ? <em className="dot" /> : null}
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
function Bubble({text, time, out, tick, react, count}) {
  const cls = ['msg', out ? 'out' : '', 'tail', react ? 'hasr' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {text}
      <span className="sp" />
      <span className="t">{time}{tick ? <i className="tick">✓✓</i> : null}</span>
      {react ? <span className="react">{react}<i>{count}</i></span> : null}
    </div>
  );
}

export default function Chats({go}) {
  const {text, offset, ui} = useStore();
  const t = useT();
  const S = skinOf(ui.skin);
  const {chunks, pos, setPos} = useChunks(SIZE.roster);
  const count = chunks.length;
  // gap: под плашкой «страница / осталось» нужен запас, иначе она накрывает
  // время у самой верхней строки.
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 2, cardSelector: '.crow', gap: 26});

  // Открыть разговор ровно на этой строке. Курсор двигаем здесь, а не внутри
  // разговора: он общий и в символах, поэтому переписка просто откроется на
  // том же месте книги — со своим, вдвое более крупным фрагментом.
  const open = i => {
    setPos(i);
    go('chat', {arg: i});
  };

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
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        {items.map(i => {
          const c = contactAt(i);
          return (
            <Row
              key={i}
              i={i}
              name={c.name}
              seed={c.seed}
              text={chunks[i].text}
              time={msgTime(i)}
              /* Непрочитанное здесь не выдумано: всё, что ниже курсора, ты
                 действительно ещё не читал. Точка справа — ровно это. */
              state={i === pos ? 'on' : (i > pos ? 'new' : 'seen')}
              onClick={() => open(i)}
            />
          );
        })}
      </div>
      {/* Кнопка «новое сообщение». Нерабочая: писать в этом приложении некому.
          Стоит потому, что её отсутствие заметнее, чем её бездействие, — она
          есть в каждом мессенджере ровно в этом углу. */}
      <div className="fab" aria-hidden="true">{S.fab}</div>
      {S.tabs ? <Tabbar items={S.tabs} active={0} /> : null}
    </Screen>
  );
}

export function Chat({go, arg}) {
  const {text, offset, ui} = useStore();
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

  // Собеседник фиксируется на входе и дальше не меняется. Имя пришло из строки
  // списка, а если в разговор вошли «Продолжить» — берётся от текущего места.
  // Меняться посреди переписки оно не должно: человек, превращающийся в
  // другого человека на середине разговора, это не мессенджер.
  const person = useRef(arg == null ? pos : Math.max(0, Math.trunc(Number(arg)) || 0));
  const c = contactAt(person.current);

  // Черта «непрочитанные» ставится там, где человек вошёл на экран, и дальше
  // не двигается — как в настоящем мессенджере. Если бы она ехала за курсором,
  // она не значила бы ничего: под ней всегда было бы «всё остальное».
  const entry = useRef(pos);
  const unreadAt = entry.current + 1;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Курсор двигаем сразу, а «печатает…» — только оформление последнего пузыря.
  // Если бы курсор ждал таймер, уход с экрана в эти 260 мс терял бы фрагмент.
  //
  // Точки показываются, только когда следующая реплика чужая: своё сообщение
  // появляется мгновенно, и «печатает…» над ним читалось бы как ошибка.
  const send = () => {
    if (last) return;
    setPos(pos + 1);
    stick.current = true;
    if (isOut(pos + 1)) return;
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
        seed={c.seed}
        title={c.name}
        sub={typing ? t('chats.typing') : t('chats.online')}
        onMenu={() => go('toc')}
      />
      <Progress offset={offset} len={text.length} />
      <div className="body" ref={boxRef}>
        <div className="daysep"><span>{t('today')}</span></div>
        {items.map(i => {
          const out = isOut(i);
          const emo = sticker(i);
          return (
            <div className="mline" key={i} data-i={i}>
              {i === unreadAt && i < count ? (
                <div className="unread"><span>{t('chats.unread')}</span></div>
              ) : null}
              {typing && i === pos ? (
                <div className="msg tail"><span className="dots"><i /><i /><i /></span></div>
              ) : (
                <Bubble
                  text={chunks[i].text}
                  time={msgTime(i)}
                  out={out}
                  tick={out}
                  react={reaction(i)}
                  count={reactionCount(i)}
                />
              )}
              {/* Ответ одним смайликом — с противоположной стороны: так на него
                  и отвечают. Без этих вставок две длинные реплики подряд снова
                  читаются как рассылка, а не как разговор. */}
              {emo ? <div className={out ? 'msg stk' : 'msg stk out'}>{emo}</div> : null}
            </div>
          );
        })}
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
