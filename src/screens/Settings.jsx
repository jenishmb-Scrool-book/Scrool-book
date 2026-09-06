import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import {clearWallpaper, getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import {appInfo, cancelNotifications, ensureNotifications} from '../native.js';
import {pageAt} from '../lib/pages.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';

// Имя приложения для случая «уведомление включили, книги ещё нет».
// В i18n его нет намеренно: это не строка интерфейса, а название продукта —
// одинаковое в обоих языках (index.html <title>, strings.xml app_name).
const APP = 'СДВГ';

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
    'СДВГ ' + (info.version || '?') + (info.build ? ' (' + info.build + ')' : ''),
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

export default function Settings({go}) {
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
    const ok = await ensureNotifications({
      title: t('notif.title', {page}),
      body: t('notif.body', {title: (current && current.title) || APP})
    });
    // Флаг ставим только после реального разрешения. «Включено» без разрешения —
    // худший из исходов: уведомлений нет, а системный диалог второй раз не придёт,
    // и починить это из приложения человек уже не сможет.
    if (ok) setUi({notify: 'on'});
    else setNotifMsg(t('set.notif_denied'));
  };

  return (
    <Screen id="settings">
      <StatusBar />
      <Header onBack={() => go('library')} title={t('set.title')} />
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
        <div className="row">
          <label className="filebtn">
            {wall ? t('set.wall_replace') : t('set.wall_pick')}
            <input type="file" accept="image/*" onChange={fromImage} />
          </label>
          {wall ? <button className="ghost" onClick={dropWall}>{t('set.wall_drop')}</button> : null}
        </div>
        {wall ? <div className="wallprev" style={{backgroundImage: `url(${wall})`}} /> : null}
        {msg ? <div className="hint">{msg}</div> : null}
        <div className="hint">{t('set.wall_hint')}</div>

        <div className="sect">{t('set.notif')}</div>
        <Seg
          value={ui.notify}
          options={[['on', t('set.notif_on')], ['off', t('set.notif_off')]]}
          onPick={pickNotify}
        />
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
