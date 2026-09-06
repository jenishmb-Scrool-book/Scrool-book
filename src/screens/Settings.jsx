import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import {clearWallpaper, getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import {cancelNotifications, ensureNotifications} from '../native.js';
import {pageAt} from '../lib/pages.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';

// Имя приложения для случая «уведомление включили, книги ещё нет».
// В i18n его нет намеренно: это не строка интерфейса, а название продукта —
// одинаковое в обоих языках (index.html <title>, strings.xml app_name).
const APP = 'Скролл';

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

export default function Settings({go}) {
  const {ui, setUi, current, offset} = useStore();
  const t = useT();
  const [wall, setWall] = useState('');
  const [msg, setMsg] = useState('');
  const [notifMsg, setNotifMsg] = useState('');

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
      .catch(err => setMsg(err.message || t('set.wall_failed')));
  };

  const dropWall = () => clearWallpaper().then(() => setWall('')).catch(() => {});

  // Позиция в тексте ЗАМОРАЖИВАЕТСЯ в момент включения — и это осознанно.
  // Уведомление планируется один раз, а курсор двигается десятки раз в секунду;
  // перепланировать будильник на каждый сдвиг — это будить AlarmManager весь
  // сеанс чтения ради строки, которую человек увидит завтра в полдень.
  // Смягчение бесплатное: повторное нажатие «Вкл» перепланирует напоминание
  // с текущей страницей, поэтому раннего возврата на «то же значение» здесь нет.
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
      </div>
    </Screen>
  );
}
