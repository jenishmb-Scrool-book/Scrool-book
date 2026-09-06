import {useEffect, useState} from 'react';
import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import {clearWallpaper, getWallpaper, setWallpaper, shrink} from '../wallpaper.js';
import Screen from '../ui/Screen.jsx';
import StatusBar from '../ui/StatusBar.jsx';
import Header from '../ui/Header.jsx';

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
  const {ui, setUi} = useStore();
  const t = useT();
  const [wall, setWall] = useState('');
  const [msg, setMsg] = useState('');

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
      </div>
    </Screen>
  );
}
