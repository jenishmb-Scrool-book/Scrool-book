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

export const LANGS = ['ru', 'en'];

const ru = {
  'boot': 'Загрузка…',
  'back': 'Назад',
  'delete': 'Удалить',

  'home.now': 'Читаешь сейчас',
  'home.empty': 'Нет текста — добавь в библиотеке',
  'home.continue': 'Продолжить',
  'app.books': 'Книги',
  'app.settings': 'Настройки',

  'chats.title': 'Книга',
  'chats.next': 'Дальше ↓',
  'reader.end': 'Конец текста',

  'reels.handle': '@книга',
  'reels.of': '{i} из {n}',

  'feed.title': 'Лента',
  'feed.author': 'книга.дня',
  'feed.caption': '{marks} отметок · фрагмент {i} из {n}',

  'video.title': 'Видео',
  'video.playing': 'Смотрим',
  'video.meta': 'книга · {views} тыс. просмотров',
  'video.here': ' · тут остановился',
  'video.fragment': 'Фрагмент {i} из {n}',
  'video.views': '{views} тыс. просмотров · сегодня',
  'video.next': 'Следующее ▶',

  'lib.title': 'Библиотека',
  'lib.placeholder': 'Вставь сюда текст книги…',
  'lib.add': 'Добавить',
  'lib.file': 'Файл .txt',
  'lib.empty_text': 'Пустой текст',
  'lib.save_failed_space': 'Не удалось сохранить — возможно, кончилось место',
  'lib.save_failed': 'Не удалось сохранить текст',
  'lib.hint': 'Один текст — один прогресс. Читай его в чатах, клипах, ленте или «видео», позиция общая.',
  'lib.nothing': 'Пока пусто.',
  'lib.pages': '{n} стр.',
  'lib.confirm_delete': 'Удалить «{title}»?',

  'set.title': 'Настройки',
  'set.wallpaper': 'Обои рабочего стола',
  'set.wall_pick': 'Выбрать из галереи',
  'set.wall_replace': 'Заменить',
  'set.wall_drop': 'Убрать',
  'set.wall_failed': 'Не удалось поставить обои',
  'set.wall_hint': 'Поставь те же обои, что на твоём телефоне — домашний экран приложения станет похож на настоящий. Скриншот лаунчера снять нельзя: Android это запрещает приложениям.',
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
  'set.lang.en': 'English'
};

const en = {
  'boot': 'Loading…',
  'back': 'Back',
  'delete': 'Delete',

  'home.now': 'Currently reading',
  'home.empty': 'No text yet — add one in the library',
  'home.continue': 'Continue',
  'app.books': 'Books',
  'app.settings': 'Settings',

  'chats.title': 'Book',
  'chats.next': 'Next ↓',
  'reader.end': 'End of text',

  'reels.handle': '@book',
  'reels.of': '{i} of {n}',

  'feed.title': 'Feed',
  'feed.author': 'book.daily',
  'feed.caption': '{marks} likes · fragment {i} of {n}',

  'video.title': 'Video',
  'video.playing': 'Now playing',
  'video.meta': 'book · {views}K views',
  'video.here': ' · you stopped here',
  'video.fragment': 'Fragment {i} of {n}',
  'video.views': '{views}K views · today',
  'video.next': 'Next ▶',

  'lib.title': 'Library',
  'lib.placeholder': 'Paste your book text here…',
  'lib.add': 'Add',
  'lib.file': '.txt file',
  'lib.empty_text': 'Empty text',
  'lib.save_failed_space': 'Could not save — you may be out of space',
  'lib.save_failed': 'Could not save the text',
  'lib.hint': 'One text, one progress. Read it in chats, clips, feed or “video” — the position is shared.',
  'lib.nothing': 'Nothing here yet.',
  'lib.pages': '{n} pages',
  'lib.confirm_delete': 'Delete “{title}”?',

  'set.title': 'Settings',
  'set.wallpaper': 'Home screen wallpaper',
  'set.wall_pick': 'Pick from gallery',
  'set.wall_replace': 'Replace',
  'set.wall_drop': 'Remove',
  'set.wall_failed': 'Could not set the wallpaper',
  'set.wall_hint': 'Use the same wallpaper as on your phone and the home screen will look like the real one. A screenshot of the launcher is impossible: Android forbids it to apps.',
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
  'set.lang.en': 'English'
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
