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
// Куда ведёт каждое действие — в `ui/actions.js`; префикс `tab:` означает
// вкладку внутри самого мессенджера.
export const SKINS = {
  tg: {
    name: APP_NAMES.tg,
    fab: '✎',                                    // кнопка «новое сообщение»
    head: [['⌕', null, 'toc'], ['⋮', null, 'settings']],      // значки в шапке списка
    chat: [['☏', null, 'tab:calls'], ['⋮', null, 'toc']],     // значки в шапке переписки
    search: true,                                // строка поиска под шапкой
    tabs: null                                   // нижней панели нет — этим и отличается
  },
  wa: {
    name: APP_NAMES.wa,
    fab: '✉',
    head: [['⊙', null, 'stories'], ['⌕', null, 'toc'], ['⋮', null, 'settings']],
    chat: [['▷', null, 'video'], ['☏', null, 'tab:calls'], ['⋮', null, 'toc']],
    search: true,
    tabs: [
      ['✉', 'chats.tab_chats', 'tab:chats'],
      ['◎', 'chats.tab_status', 'stories'],
      ['⊞', 'chats.tab_groups', 'tab:groups'],
      ['☏', 'chats.tab_calls', 'tab:calls']
    ]
  },
  ms: {
    name: APP_NAMES.ms,
    fab: '✎',
    head: [['⌕', null, 'toc']],
    chat: [['☏', null, 'tab:calls'], ['▷', null, 'video'], ['ⓘ', null, 'toc']],
    search: true,
    tabs: [
      ['✉', 'chats.tab_chats', 'tab:chats'],
      ['⊞', 'chats.tab_people', 'tab:people'],
      ['◎', 'chats.tab_status', 'stories']
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
