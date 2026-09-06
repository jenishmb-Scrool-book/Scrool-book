import {useCallback} from 'react';
import {useStore} from './store.jsx';

// Все строки интерфейса в одном месте.
//
// Заведено на Этапе 0 намеренно рано: пока экранов четыре, вынести строки стоит
// полдня, после шести движков со скинами — втрое дороже, потому что доставать
// их пришлось бы из уже написанного кода.
//
// Ключи именуются по смыслу, а не по месту («chats.next», не «button3»):
// одна и та же строка попадается на разных экранах, и привязка к месту
// заставила бы её дублировать.
//
// Ключи для параллельных агентов (парсеры, уведомления) добавлены заранее —
// см. docs/plans/2026-09-06-stage-1-contracts.md. Этот файл общий, и если бы
// в него писали трое, конфликт был бы гарантирован.

export const LANGS = ['ru', 'en'];

const ru = {
  'boot': 'Загрузка…',
  'back': 'Назад',
  'delete': 'Удалить',
  'dismiss': 'Скрыть',
  'today': 'Сегодня',

  'home.now': 'Читаешь сейчас',
  'home.empty': 'Нет текста — добавь в библиотеке',
  'home.continue': 'Продолжить',
  'home.wall_tip': 'Поставь свои обои — экран станет как твой настоящий',
  'home.wall_pick': 'Выбрать',
  'app.books': 'Книги',
  'app.settings': 'Настройки',

  // ===== мессенджеры =====
  'chats.title': 'Книга',
  'chats.list': 'Чаты',
  'chats.search': 'Поиск',
  'chats.online': 'в сети',
  'chats.typing': 'печатает…',
  'chats.composer': 'Сообщение',
  'chats.left': 'осталось {n}',
  'chats.stub_note': 'Здесь никого нет — это витрина. Книга в закреплённом чате.',
  'chats.stub_1': 'ты где пропал',
  'chats.stub_2': 'опять читаешь?',
  'chats.stub_3': 'ладно, не отвлекаю 😄',
  'chats.to_book': 'Вернуться к книге',
  'reader.end': 'Конец текста',

  // ===== клипы =====
  'reels.handle': '@книга',
  'reels.of': '{i} из {n}',
  'reels.tag': '#книга #дочитать',
  'reels.tab_feed': 'Рекомендации',
  'reels.tab_subs': 'Подписки',

  // ===== истории =====
  'stories.title': 'Истории',
  'stories.hint': 'Тап справа — дальше, слева — назад',
  'stories.of': '{i} из {n}',

  // ===== лента =====
  'feed.title': 'Лента',
  'feed.author': 'книга.дня',
  'feed.caption': '{marks} отметок · фрагмент {i} из {n}',
  'feed.likes': 'Нравится: {n}',
  'feed.your_story': 'Ваша история',

  // ===== короткие посты =====
  'tw.title': 'Главная',
  'tw.name': 'Книга',
  'tw.handle': '@kniga',
  'tw.tab_feed': 'Для вас',
  'tw.tab_subs': 'Подписки',
  'tw.views': '{n} тыс.',

  // ===== видео =====
  'video.title': 'Видео',
  'video.playing': 'Смотрим',
  'video.meta': 'книга · {views} тыс. просмотров',
  'video.here': ' · тут остановился',
  'video.fragment': 'Фрагмент {i} из {n}',
  'video.views': '{views} тыс. просмотров · сегодня',
  'video.next': 'Следующее ▶',
  'video.chip_all': 'Все',
  'video.chip_new': 'Новое',
  'video.channel': 'книга',
  'video.subscribe': 'Подписаться',

  // ===== индикатор =====
  'pace.left': '≈ {n} мин',
  'pace.done': 'дочитано',

  // ===== библиотека =====
  'lib.title': 'Библиотека',
  'lib.placeholder': 'Вставь сюда текст книги…',
  'lib.add': 'Добавить',
  'lib.file': 'Файл',
  'lib.empty_text': 'Пустой текст',
  'lib.save_failed_space': 'Не удалось сохранить — возможно, кончилось место',
  'lib.save_failed': 'Не удалось сохранить текст',
  'lib.hint': 'Один текст — один прогресс. Читай его в чатах, клипах, ленте или «видео», позиция общая.',
  'lib.nothing': 'Пока пусто.',
  'lib.pages': '{n} стр.',
  'lib.confirm_delete': 'Удалить «{title}»?',
  'lib.parse_failed': 'Не удалось разобрать файл',
  'lib.parse_failed_zip': 'Этот EPUB не открылся. Обнови «Android System WebView» в Play Маркете или возьми книгу в .fb2',
  'lib.unsupported': 'Формат не поддерживается: нужен .txt, .fb2 или .epub',
  'lib.chapters': '{n} глав',
  'lib.no_text': 'В файле не нашлось текста',

  // ===== настройки =====
  'set.title': 'Настройки',
  'set.wallpaper': 'Обои рабочего стола',
  'set.wall_pick': 'Выбрать из галереи',
  'set.wall_replace': 'Заменить',
  'set.wall_drop': 'Убрать',
  'set.wall_failed': 'Не удалось поставить обои',
  'set.wall_hint': 'Поставь те же обои, что на твоём телефоне — домашний экран приложения станет похож на настоящий. Взять их автоматически нельзя: с Android 14 система не отдаёт обои приложениям.',
  'set.theme': 'Тема',
  'set.theme.system': 'Как в системе',
  'set.theme.light': 'Светлая',
  'set.theme.dark': 'Тёмная',
  'set.font': 'Размер шрифта',
  'set.font.sm': 'Мельче',
  'set.font.md': 'Обычный',
  'set.font.lg': 'Крупнее',
  'set.lang': 'Язык',
  'set.lang.ru': 'Русский',
  'set.lang.en': 'English',
  'set.notif': 'Напоминание',
  'set.notif_hint': 'Раз в день в 12:00 — короткий толчок вернуться к книге. Времени на выбор нет намеренно: одно напоминание игнорировать легче, чем настраивать.',
  'set.notif_on': 'Вкл',
  'set.notif_off': 'Выкл',
  'set.notif_denied': 'Android не дал разрешение. Включи уведомления для приложения в настройках телефона — второй раз система не спросит.',
  'notif.title': 'Ты остановился на странице {page}',
  'notif.body': '«{title}» ждёт. Пара страниц — это пара минут.'
};

const en = {
  'boot': 'Loading…',
  'back': 'Back',
  'delete': 'Delete',
  'dismiss': 'Dismiss',
  'today': 'Today',

  'home.now': 'Currently reading',
  'home.empty': 'No text yet — add one in the library',
  'home.continue': 'Continue',
  'home.wall_tip': 'Set your own wallpaper — the screen will look like your real one',
  'home.wall_pick': 'Choose',
  'app.books': 'Books',
  'app.settings': 'Settings',

  'chats.title': 'Book',
  'chats.list': 'Chats',
  'chats.search': 'Search',
  'chats.online': 'online',
  'chats.typing': 'typing…',
  'chats.composer': 'Message',
  'chats.left': '{n} left',
  'chats.stub_note': 'Nobody here — this one is set dressing. The book is in the pinned chat.',
  'chats.stub_1': 'where have you been',
  'chats.stub_2': 'reading again?',
  'chats.stub_3': 'fine, I’ll leave you to it 😄',
  'chats.to_book': 'Back to the book',
  'reader.end': 'End of text',

  'reels.handle': '@book',
  'reels.of': '{i} of {n}',
  'reels.tag': '#book #finishit',
  'reels.tab_feed': 'For you',
  'reels.tab_subs': 'Following',

  'stories.title': 'Stories',
  'stories.hint': 'Tap right for next, left for previous',
  'stories.of': '{i} of {n}',

  'feed.title': 'Feed',
  'feed.author': 'book.daily',
  'feed.caption': '{marks} likes · fragment {i} of {n}',
  'feed.likes': '{n} likes',
  'feed.your_story': 'Your story',

  'tw.title': 'Home',
  'tw.name': 'Book',
  'tw.handle': '@thebook',
  'tw.tab_feed': 'For you',
  'tw.tab_subs': 'Following',
  'tw.views': '{n}K',

  'video.title': 'Video',
  'video.playing': 'Now playing',
  'video.meta': 'book · {views}K views',
  'video.here': ' · you stopped here',
  'video.fragment': 'Fragment {i} of {n}',
  'video.views': '{views}K views · today',
  'video.next': 'Next ▶',
  'video.chip_all': 'All',
  'video.chip_new': 'New',
  'video.channel': 'book',
  'video.subscribe': 'Subscribe',

  'pace.left': '≈ {n} min',
  'pace.done': 'finished',

  'lib.title': 'Library',
  'lib.placeholder': 'Paste your book text here…',
  'lib.add': 'Add',
  'lib.file': 'File',
  'lib.empty_text': 'Empty text',
  'lib.save_failed_space': 'Could not save — you may be out of space',
  'lib.save_failed': 'Could not save the text',
  'lib.hint': 'One text, one progress. Read it in chats, clips, feed or “video” — the position is shared.',
  'lib.nothing': 'Nothing here yet.',
  'lib.pages': '{n} pages',
  'lib.confirm_delete': 'Delete “{title}”?',
  'lib.parse_failed': 'Could not parse the file',
  'lib.parse_failed_zip': 'This EPUB would not open. Update “Android System WebView” in the Play Store, or use a .fb2 copy',
  'lib.unsupported': 'Unsupported format: use .txt, .fb2 or .epub',
  'lib.chapters': '{n} chapters',
  'lib.no_text': 'No text found in the file',

  'set.title': 'Settings',
  'set.wallpaper': 'Home screen wallpaper',
  'set.wall_pick': 'Pick from gallery',
  'set.wall_replace': 'Replace',
  'set.wall_drop': 'Remove',
  'set.wall_failed': 'Could not set the wallpaper',
  'set.wall_hint': 'Use the same wallpaper as on your phone and the home screen will look like the real one. Taking it automatically is impossible: since Android 14 the system no longer gives apps the wallpaper.',
  'set.theme': 'Theme',
  'set.theme.system': 'System',
  'set.theme.light': 'Light',
  'set.theme.dark': 'Dark',
  'set.font': 'Text size',
  'set.font.sm': 'Smaller',
  'set.font.md': 'Normal',
  'set.font.lg': 'Larger',
  'set.lang': 'Language',
  'set.lang.ru': 'Русский',
  'set.lang.en': 'English',
  'set.notif': 'Reminder',
  'set.notif_hint': 'Once a day at 12:00 — a short nudge back to the book. There is deliberately no time picker: one reminder is easier to ignore than to configure.',
  'set.notif_on': 'On',
  'set.notif_off': 'Off',
  'set.notif_denied': 'Android denied the permission. Turn notifications on for the app in your phone settings — the system will not ask again.',
  'notif.title': 'You stopped on page {page}',
  'notif.body': '“{title}” is waiting. A couple of pages is a couple of minutes.'
};

export const DICT = {ru, en};

// Подстановка вида «{i} из {n}». Отсутствующий параметр оставляем как есть —
// это заметно на экране, а значит, будет починено, в отличие от пустой строки.
export function format(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (whole, k) => (k in params ? String(params[k]) : whole));
}

/**
 * Переводчик текущего языка. Неизвестный ключ отдаётся как есть: на экране это
 * видно сразу, а падать из-за отсутствующей строки приложение не должно.
 */
export function useT() {
  const {ui} = useStore();
  const lang = DICT[ui.lang] ? ui.lang : 'ru';
  return useCallback(
    (key, params) => format(DICT[lang][key] ?? DICT.ru[key] ?? key, params),
    [lang]
  );
}
