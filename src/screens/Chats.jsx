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
import {run} from '../ui/actions.js';
import {grad, reaction, reactionCount, sticker} from '../ui/visual.js';
import {shot} from '../ui/pics.js';
import {skinOf, tabIndex} from '../ui/skins.js';
import {NAMES, callAt, contactAt, groupAt, msgTime} from '../lib/fake.js';
import Glyph from '../ui/Glyph.jsx';

// «Мессенджер» — один движок и четыре вкладки, и ЧИТАТЬ можно на двух из них.
//
//   Чаты   — список переписок. Каждая строка это кусок книги, подписанный
//            очередным именем: книга как будто приходит от разных людей.
//            Прокрутка списка двигает курсор — то есть по контактам можно
//            просто идти сверху вниз и читать, никуда не заходя.
//   Группы — то же самое, но строка подписана группой и отправителем:
//            «Работа · Костя: текст». Настоящая вторая вкладка, а не копия.
//   Звонки — журнал вызовов. Единственная поверхность приложения БЕЗ текста
//            книги, и это осознанно: кусок книги на месте «Исходящий, 12:30»
//            читался бы как поломка. Строка открывает переписку с человеком.
//   Люди   — список контактов, то же назначение.
//
//   Chat   — сама переписка. Тот же текст, но репликами по очереди: одну
//            говорит собеседник, следующую ты. Между ними смайлики и реакции.
//
// Так это устроено по прямой просьбе владельца: «чтобы информация из книги
// была не внутри чата, а снаружи, — можно было читать, просто проходя по
// контактам; а когда заходишь внутрь, пусть будет как переписка».
// Вкладки внизу заработали по следующей его же правке: «в ватцапе есть внизу
// кнопки статус, группы и так далее — пусть всё работает».

const TYPING = 260;    // мс, столько показывается «печатает…» после отправки

// Вкладки, на которых читают. Остальные — списки людей, там курсор не едет.
const READ_TABS = ['chats', 'groups'];

// Кто говорит. Строгое чередование: чётные — собеседник, нечётные — ты.
// Реплики книги длинные, и любая «умная» группировка тут же превращает
// разговор обратно в монолог, который и просили убрать.
const isOut = i => i % 2 === 1;

// Аватарка со снимком. Буква на цветном кружке — это как выглядит контакт БЕЗ
// фотографии, и когда без фотографии весь список, он читается как пустой.
function Avatar({seed, cls}) {
  return <div className={cls || 'av'} style={{background: shot('face', seed, grad(seed))}} />;
}

/**
 * Шапка переписки. Значки справа берутся у скина вместе с назначением: трубка
 * ведёт в журнал вызовов, камера («видеозвонок») — в «видео», последний значок
 * — в оглавление: перепрыгнуть по главам в мессенджере больше нечем, а иногда
 * нужно.
 */
function ChatHead({skin, onBack, seed, title, sub, onAct}) {
  const S = skinOf(skin);
  return (
    <div className="chdr">
      <span className="back" onClick={onBack} role="button" aria-label="Назад"><Glyph name="back" /></span>
      <Avatar seed={seed} cls="av sm" />
      <div className="who">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      {S.chat.map(([ic, , action], k) => (
        <span key={k} className="ic" role="button"
              onClick={() => onAct(action)}>{ic}</span>
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
 * Читающий список: «Чаты» или «Группы».
 *
 * Отдельный компонент с `key={tab}` не ради порядка, а по необходимости:
 * `useCardWindow` вешает обработчик прокрутки один раз за монтирование. Если
 * бы список просто перерисовывался при смене вкладки, после возврата из
 * «Звонков» обработчик остался бы висеть на выброшенном узле, и прокрутка
 * перестала бы двигать курсор — молча.
 */
function Roster({mode, chunks, pos, setPos, onOpen}) {
  const count = chunks.length;
  // gap: под плашкой «страница / осталось» нужен запас, иначе она накрывает
  // время у самой верхней строки.
  const {boxRef, items} = useCardWindow({count, pos, setPos, ahead: 2, cardSelector: '.crow', gap: 26});

  return (
    <div className="body" ref={boxRef}>
      {items.map(i => {
        const g = mode === 'groups';
        const c = g ? groupAt(i) : contactAt(i);
        return (
          <Row
            key={i}
            i={i}
            name={c.name}
            seed={c.seed}
            /* В группе превью всегда подписано отправителем — без этого
               вкладка «Группы» ничем не отличалась бы от вкладки «Чаты». */
            text={g ? c.from + ': ' + chunks[i].text : chunks[i].text}
            time={msgTime(i)}
            /* Непрочитанное здесь не выдумано: всё, что ниже курсора, ты
               действительно ещё не читал. Точка справа — ровно это. */
            state={i === pos ? 'on' : (i > pos ? 'new' : 'seen')}
            onClick={() => onOpen(i)}
          />
        );
      })}
    </div>
  );
}

/** Журнал вызовов. Текста книги здесь нет — см. заголовок файла. */
function CallList({onOpen}) {
  const t = useT();
  const rows = NAMES.length * 3;   // хватает на экран с запасом, без бесконечности
  const ARROW = {in: 'callIn', out: 'callOut', missed: 'callIn'};
  return (
    <div className="body">
      {Array.from({length: rows}, (unused, i) => {
        const c = callAt(i);
        return (
          <div className="crow call" key={i} onClick={() => onOpen(i)}>
            <Avatar seed={c.seed} />
            <div className="ci">
              <b>{c.name}</b>
              <span className={c.kind === 'missed' ? 'miss' : ''}>
                <Glyph name={ARROW[c.kind]} /> {t('chats.call_' + c.kind)} · {c.time}
              </span>
            </div>
            <span className="ic"><Glyph name={c.video ? 'videocam' : 'phone'} /></span>
          </div>
        );
      })}
    </div>
  );
}

/** Список контактов. Тоже без текста книги и по той же причине. */
function PeopleList({onOpen}) {
  const t = useT();
  return (
    <div className="body">
      {NAMES.map((unused, i) => {
        const c = contactAt(i);
        return (
          <div className="crow call" key={i} onClick={() => onOpen(i)}>
            <Avatar seed={c.seed} />
            <div className="ci">
              <b>{c.name}</b>
              <span>{t('chats.online')}</span>
            </div>
            <span className="ic"><Glyph name="mail" /></span>
          </div>
        );
      })}
    </div>
  );
}

export default function Chats({go, back, arg}) {
  const {text, offset, ui} = useStore();
  const t = useT();
  const S = skinOf(ui.skin);
  const {chunks, pos, setPos} = useChunks(SIZE.roster);

  // На какой вкладке открылись. Приходит из шапки переписки: трубка ведёт в
  // журнал вызовов, а не просто «назад в список».
  const [tab, setTab] = useState(() => {
    const want = String(arg == null ? 'chats' : arg);
    const ok = S.tabs && S.tabs.some(([, , action]) => action === 'tab:' + want);
    return ok ? want : 'chats';
  });

  const act = action => {
    if (action.startsWith('tab:')) {
      const to = action.slice(4);
      // Тап по уже активной вкладке — наверх списка. Так ведут себя настоящие
      // панели, и это единственный способ вернуться к началу длинной ленты.
      if (to === tab) run('top', {go});
      else setTab(to);
      return;
    }
    run(action, {go, pos});
  };

  // Открыть разговор ровно на этой строке. Курсор двигаем здесь, а не внутри
  // разговора: он общий и в символах, поэтому переписка просто откроется на
  // том же месте книги — со своим, вдвое более крупным фрагментом.
  const openAt = i => {
    setPos(i);
    go('chat', {arg: i});
  };
  // А из журнала вызовов и списка людей — с этим человеком, но НЕ трогая
  // курсор: строка там означает собеседника, а не место в книге.
  const openWith = i => go('chat', {arg: i});

  return (
    <Screen id="chats" skin={ui.skin}>
      <StatusBar />
      <div className="mhdr">
        <span className="back" onClick={back} role="button" aria-label={t('back')}><Glyph name="back" /></span>
        {/* В шапке списка стоит имя «приложения», а не слово «Чаты»: так это
            устроено во всех настоящих мессенджерах, и с одного взгляда видно,
            в каком из трёх ты сейчас. */}
        <h2>{S.name}</h2>
        {S.head.map(([ic, , action], k) => (
          <span key={k} className="ic" role="button" onClick={() => act(action)}><Glyph name={ic} /></span>
        ))}
      </div>
      {S.search ? (
        <div className="msearch" onClick={() => go('toc')} role="button"><Glyph name="search" /> {t('chats.search')}</div>
      ) : null}
      {/* Полоса чтения — только там, где читают. На вкладке звонков она
          показывала бы прогресс по книге над списком, в котором книги нет. */}
      {READ_TABS.includes(tab) ? <Progress offset={offset} len={text.length} go={go} /> : null}
      {READ_TABS.includes(tab) ? (
        <Roster key={tab} mode={tab} chunks={chunks} pos={pos} setPos={setPos} onOpen={openAt} />
      ) : tab === 'calls' ? (
        <CallList onOpen={openWith} />
      ) : (
        <PeopleList onOpen={openWith} />
      )}
      {/* «Новое сообщение» открывает переписку на том месте, где читаешь.
          Писать в этом приложении действительно некому, но кнопка в этом углу
          есть у каждого мессенджера, и увести её некуда, кроме как в чат. */}
      <div className="fab" onClick={() => openAt(pos)} role="button"><Glyph name={S.fab} /></div>
      {S.tabs ? <Tabbar items={S.tabs} active={tabIndex(ui.skin, tab)} onPick={act} /> : null}
    </Screen>
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

export function Chat({go, back, arg}) {
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

  // Значки в шапке: `tab:` уводит в список на нужную вкладку, остальное —
  // обычный переход.
  const act = action => {
    if (action.startsWith('tab:')) go('chats', {arg: action.slice(4)});
    else run(action, {go, boxRef, pos});
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
        onBack={back}
        seed={c.seed}
        title={c.name}
        sub={typing ? t('chats.typing') : t('chats.online')}
        onAct={act}
      />
      <Progress offset={offset} len={text.length} go={go} />
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
      {/* Поле ввода не принимает текст и не должно: отвечать книге некому.
          Но нажимается всё — и поле, и оба значка: любое касание внизу
          продвигает разговор, как и кнопка «отправить». Мёртвых кнопок на
          экране быть не должно, а других значений у них здесь нет. */}
      <div className="composer">
        <div className="cbox" onClick={send} role="button">
          <span className="ic"><Glyph name="smile" /></span>
          <div className="fld">{t('chats.composer')}</div>
          <span className="ic"><Glyph name="attach" /></span>
        </div>
        <button className="send" onClick={send} disabled={last} aria-label={t('chats.composer')}><Glyph name="send" /></button>
      </div>
    </Screen>
  );
}
