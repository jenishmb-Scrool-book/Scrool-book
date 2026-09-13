import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import {APP_NAME} from '../name.js';
import {WALLS, clearWallpaper, getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import {NOTIFY, appInfo, cancelNotifications, ensureNotifications, notifyError, testNotification} from '../native.js';
import {pageAt} from '../lib/pages.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';
import Walls from '../ui/Walls.jsx';

// Что сказать, когда напоминание не включилось. Ключ на каждый исход, потому
// что причины разные: одну чинят в настройках телефона, вторую не чинят вовсе.
const WHY = {
  [NOTIFY.denied]: 'set.notif_denied',
  [NOTIFY.nowhere]: 'set.notif_nowhere',
  [NOTIFY.failed]: 'set.notif_failed'
};

// Причина от плагина дописывается только к «не вышло»: у отказа и у браузера
// причина уже названа словами, а у сорванной записи её знает только Android.
const whyText = (t, how) => {
  const err = how === NOTIFY.failed ? notifyError() : '';
  return t(WHY[how] || 'set.notif_failed') + (err ? ' (' + err + ')' : '');
};

// Переключатель из нескольких кнопок. Ползунка нет намеренно: три градации
// кегля покрывают почти всех, а точное значение — это лишний выбор на экране,
// где человек и так пришёл не за настройками.
function Seg({value, options, onPick}) {
  return (
    <div className="seg">
      {options.map(([id, label]) => (
        <button key={id} className={id === value ? 'on' : ''} onClick={() => onPick(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Строка для сообщения об ошибке. Здесь нет ничего о человеке и ничего из
// книги — только версия сборки и то, на чём она запущена. Длина книги нужна
// затем, что половина проблем воспроизводится лишь на большом тексте.
function details(info, ui, len) {
  const s = window.screen || {};
  return [
    APP_NAME + ' ' + (info.version || '?') + (info.build ? ' (' + info.build + ')' : ''),
    info.id || '',
    navigator.userAgent,
    // Плотность округляем: у неё бывает хвост вида 2.0000000596046448,
    // и в письме это выглядит как мусор, а не как сведения.
    'экран ' + (s.width || '?') + '×' + (s.height || '?') +
      ' @' + Math.round((window.devicePixelRatio || 1) * 100) / 100,
    'тема ' + ui.theme + ', шрифт ' + ui.font + ', язык ' + ui.lang + ', обёртка ' + ui.skin,
    'книга ' + len + ' знаков'
  ].filter(Boolean).join('\n');
}

export default function Settings({go, back}) {
  const {ui, setUi, current, offset, text} = useStore();
  const t = useT();
  const [wall, setWall] = useState('');
  const [msg, setMsg] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [info, setInfo] = useState({version: '', build: '', id: ''});
  const [copied, setCopied] = useState('');
  const [fallback, setFallback] = useState('');

  useEffect(() => {
    let live = true;
    appInfo().then(i => live && setInfo(i)).catch(() => {});
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
      .catch(err => setMsg(err.message || t('set.wall_failed')));
  };

  const dropWall = () => clearWallpaper().then(() => setWall('')).catch(() => {});

  // Позиция в тексте ЗАМОРАЖИВАЕТСЯ в момент включения — и это осознанно.
  // Уведомление планируется один раз, а курсор двигается десятки раз в секунду;
  // перепланировать будильник на каждый сдвиг — это будить AlarmManager весь
  // сеанс чтения ради строки, которую человек увидит завтра в полдень.
  // Смягчение бесплатное: повторное нажатие «Вкл» перепланирует напоминание
  // с текущей страницей, поэтому раннего возврата на «то же значение» здесь нет.
  // Своей почты в приложении нет: адрес разработчика — его решение, а не наше,
  // и вписывать его в код без спроса нельзя. Поэтому не «написать нам», а
  // «скопировать» — тестировщик отправит это тем способом, каким уже общается.
  const copyDetails = async () => {
    const s = details(info, ui, text.length);
    try {
      await navigator.clipboard.writeText(s);
      setCopied(t('set.copied'));
      setFallback('');
    } catch {
      // Буфер может быть недоступен: нет разрешения, старый WebView, не
      // защищённый контекст. Тогда показываем те же сведения прямо на экране —
      // их можно выделить или снять экран. Отказ без запасного пути означал бы,
      // что человек просто не может сказать, какая у него сборка.
      setCopied(t('set.copy_failed', {v: info.version || '?'}));
      setFallback(s);
    }
  };

  const pickNotify = async v => {
    setNotifMsg('');
    if (v === 'off') {
      await cancelNotifications();
      setUi({notify: 'off'});
      return;
    }
    const page = current ? pageAt(offset, current.len) : 1;
    const how = await ensureNotifications({
      title: t('notif.title', {page}),
      body: t('notif.body', {title: (current && current.title) || APP_NAME})
    });
    // Флаг ставим только после реального разрешения. «Включено» без разрешения —
    // худший из исходов: уведомлений нет, а системный диалог второй раз не придёт,
    // и починить это из приложения человек уже не сможет.
    if (how === NOTIFY.on) {
      setUi({notify: 'on'});
      // Без этой строки успех выглядит как ничего: переключатель сдвинулся, а
      // уведомления нет, и человек решает, что не работает. Полдень сегодня
      // уже прошёл — первое придёт завтра: так будильник и встанет.
      const day = new Date().getHours() < 12 ? 'set.notif_today' : 'set.notif_tomorrow';
      setNotifMsg(t('set.notif_done', {day: t(day)}));
    } else setNotifMsg(whyText(t, how));
  };

  const tryNotify = async () => {
    setNotifMsg('');
    const how = await testNotification({title: t('notif.test_title'), body: t('notif.test_body')});
    setNotifMsg(how === NOTIFY.on ? t('set.notif_test_sent') : whyText(t, how));
  };

  // Готовые обои пишутся путём, своя картинка — data-URI. Разницы дальше нет
  // никакой: и то и другое уезжает в `url()`, и то и другое лежит под одним
  // ключом. Поэтому выбор из решётки стирает свою картинку сам собой.
  const pickWall = src => setWallpaper(src).then(() => setWall(src)).catch(() => {});

  // Своя картинка или готовая. Разница нужна трём подписям: «Заменить» при
  // выбранном готовом снимке обещало бы, что где-то лежит своя картинка, а
  // «Убрать» рядом с решёткой снимало бы то, что в ней же и отмечено.
  const own = !!wall && !WALLS.includes(wall);

  return (
    <Screen id="settings">
      <StatusBar />
      <Header onBack={back} title={t('set.title')} />
      <div className="body">
        <div className="sect">{t('set.theme')}</div>
        <Seg
          value={ui.theme}
          options={[['system', t('set.theme.system')], ['light', t('set.theme.light')], ['dark', t('set.theme.dark')]]}
          onPick={theme => setUi({theme})}
        />

        <div className="sect">{t('set.font')}</div>
        <Seg
          value={ui.font}
          options={[['sm', t('set.font.sm')], ['md', t('set.font.md')], ['lg', t('set.font.lg')]]}
          onPick={font => setUi({font})}
        />

        <div className="sect">{t('set.lang')}</div>
        <Seg
          value={ui.lang}
          options={[['ru', t('set.lang.ru')], ['en', t('set.lang.en')]]}
          onPick={lang => setUi({lang})}
        />

        <div className="sect">{t('set.wallpaper')}</div>
        <Walls value={wall} onPick={pickWall} />
        <div className="row">
          <label className="filebtn">
            {own ? t('set.wall_replace') : t('set.wall_pick')}
            <input type="file" accept="image/*" onChange={fromImage} />
          </label>
          {own ? <button className="ghost" onClick={dropWall}>{t('set.wall_drop')}</button> : null}
        </div>
        {own ? <div className="wallprev" style={{backgroundImage: `url(${wall})`}} /> : null}
        {msg ? <div className="hint">{msg}</div> : null}
        <div className="hint">{t('set.wall_hint')}</div>

        <div className="sect">{t('set.notif')}</div>
        <Seg
          value={ui.notify}
          options={[['on', t('set.notif_on')], ['off', t('set.notif_off')]]}
          onPick={pickNotify}
        />
        {ui.notify === 'on' ? (
          <div className="row">
            <button className="ghost" onClick={tryNotify}>{t('set.notif_test')}</button>
          </div>
        ) : null}
        {notifMsg ? <div className="hint">{notifMsg}</div> : null}
        <div className="hint">{t('set.notif_hint')}</div>

        <div className="sect">{t('set.about')}</div>
        <div className="hint">
          {t('set.version', {v: info.version + (info.build ? ' (' + info.build + ')' : '')})}
        </div>
        <div className="row">
          <button className="ghost" onClick={copyDetails}>{t('set.copy')}</button>
        </div>
        {copied ? <div className="hint">{copied}</div> : null}
        {fallback ? <div className="diag">{fallback}</div> : null}
        <div className="hint">{t('set.about_hint')}</div>
      </div>
    </Screen>
  );
}
