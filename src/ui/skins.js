// Имена «приложений» и состав их экранов.
//
// Названия искажены намеренно: чужой товарный знак снимут с публикации.
// Узнаваемость даёт вёрстка, а не буквы, — и лежат они в одном месте, потому
// что имя видно дважды: на иконке домашнего экрана и в шапке самого экрана,
// и разъехавшись эти два места сразу выдают подделку.
export const APP_NAMES = {
  tg: 'Telegran',
  wa: 'Whhatsapp',
  ms: 'Massenger',
  feed: 'IInstagram',
  reels: 'TikTak',
  video: 'YuoTube',
  stories: 'Snapchart',
  tweets: 'Tvitter'
};

// Три «мессенджера» — один движок и три разных приложения.
//
// Раньше скин был только цветом шапки и радиусом пузыря, и все три читались
// одинаково: «карточки с текстом». Настоящие мессенджеры отличаются не
// палитрой, а раскладкой — у одного нижняя панель, у другого её нет, у третьего
// белая шапка и круглые пузыри без хвоста. Поэтому здесь лежит состав экрана,
// а не цвет: цвет остался в CSS, где ему и место.
//
// Значки описаны той же тройкой, что и нижние панели в `ui/tabs.js`:
// [значок, ключ подписи или null, действие]. Подписи у значков в шапке нет
// никогда, но форма одна — иначе одну из двух форм рано или поздно проверять
// перестанут, а «кнопка без назначения» видна только на телефоне.
// Значок — имя из `ui/Glyph.jsx`: рисовать их символами шрифта нельзя, они
// приходят разной толщины и на каждом телефоне свои.
// Куда ведёт каждое действие — в `ui/actions.js`; префикс `tab:` означает
// вкладку внутри самого мессенджера.
export const SKINS = {
  tg: {
    name: APP_NAMES.tg,
    fab: 'pencil',                                    // кнопка «новое сообщение»
    head: [['search', null, 'toc'], ['more', null, 'settings']],      // значки в шапке списка
    chat: [['phone', null, 'tab:calls'], ['more', null, 'toc']],     // значки в шапке переписки
    search: true,                                // строка поиска под шапкой
    tabs: null                                   // нижней панели нет — этим и отличается
  },
  wa: {
    name: APP_NAMES.wa,
    fab: 'mail',
    head: [['status', null, 'stories'], ['search', null, 'toc'], ['more', null, 'settings']],
    chat: [['videocam', null, 'video'], ['phone', null, 'tab:calls'], ['more', null, 'toc']],
    search: true,
    tabs: [
      ['mail', 'chats.tab_chats', 'tab:chats'],
      ['status', 'chats.tab_status', 'stories'],
      ['people', 'chats.tab_groups', 'tab:groups'],
      ['phone', 'chats.tab_calls', 'tab:calls']
    ]
  },
  ms: {
    name: APP_NAMES.ms,
    fab: 'pencil',
    head: [['search', null, 'toc']],
    chat: [['phone', null, 'tab:calls'], ['videocam', null, 'video'], ['info', null, 'toc']],
    search: true,
    tabs: [
      ['mail', 'chats.tab_chats', 'tab:chats'],
      ['people', 'chats.tab_people', 'tab:people'],
      ['status', 'chats.tab_status', 'stories']
    ]
  }
};

export const skinOf = id => SKINS[id] || SKINS.tg;

/** Индекс активной вкладки нижней панели по её имени. */
export function tabIndex(skin, tab) {
  const tabs = skinOf(skin).tabs;
  if (!tabs) return 0;
  const k = tabs.findIndex(([, , action]) => action === 'tab:' + tab);
  return k < 0 ? 0 : k;
}
