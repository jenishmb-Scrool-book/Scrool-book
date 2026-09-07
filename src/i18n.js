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
  'home.search': 'Поиск',
  'app.books': 'Книги',
  'app.settings': 'Настройки',

  // ===== мессенджеры =====
  'chats.search': 'Поиск',
  'chats.online': 'в сети',
  'chats.typing': 'печатает…',
  'chats.composer': 'Сообщение',
  'chats.unread': 'Непрочитанные сообщения',
  'chats.tab_chats': 'Чаты',
  'chats.tab_status': 'Статус',
  'chats.tab_groups': 'Группы',
  'chats.tab_calls': 'Звонки',
  'chats.tab_people': 'Люди',
  'reader.end': 'Конец текста',

  // ===== клипы =====
  'reels.handle': '@книга',
  'reels.of': '{i} из {n}',
  'reels.tag': '#книга #дочитать',
  'reels.tab_feed': 'Рекомендации',
  'reels.tab_subs': 'Подписки',
  'reels.tab_home': 'Главная',
  'reels.tab_friends': 'Друзья',
  'reels.tab_inbox': 'Входящие',
  'reels.tab_me': 'Профиль',

  // ===== истории =====
  'stories.title': 'Истории',
  'stories.hint': 'Тап справа — дальше, слева — назад',
  'stories.of': '{i} из {n}',

  // ===== лента =====
  'feed.author': 'книга.дня',
  'feed.caption': '{marks} отметок · фрагмент {i} из {n}',
  'feed.likes': 'Нравится: {n}',
  'feed.your_story': 'Ваша история',

  // ===== короткие посты =====
  'tw.name': 'Книга',
  'tw.handle': '@kniga',
  'tw.tab_feed': 'Для вас',
  'tw.tab_subs': 'Подписки',
  'tw.views': '{n} тыс.',

  // ===== видео =====
  'video.meta': 'книга · {views} тыс. просмотров · сегодня',
  'video.here': ' · тут остановился',
  'video.fragment': 'фрагмент {i} из {n}',
  'video.views': '{views} тыс. просмотров · сегодня',
  'video.chip_all': 'Все',
  'video.chip_new': 'Новое',
  'video.channel': 'книга',
  'video.subscribe': 'Подписаться',
  'video.subs': '12,4 тыс. подписчиков',
  'video.desc': 'Описание',
  'video.comments': 'Комментарии',
  'video.reply': 'Ответить',
  'video.add_comment': 'Добавить комментарий…',
  'video.ago': '{n} нед. назад',
  'video.share': 'Поделиться',
  'video.save': 'Сохранить',
  'video.upnext': 'Следующее',
  'video.tab_home': 'Главная',
  'video.tab_shorts': 'Клипы',
  'video.tab_subs': 'Подписки',
  'video.tab_you': 'Вы',

  // ===== оглавление =====
  'toc.title': 'Оглавление',
  'toc.count': '{n} глав',
  'toc.count.one': '{n} глава',
  'toc.count.few': '{n} главы',
  'toc.count.many': '{n} глав',
  'toc.count.other': '{n} главы',
  'toc.page': 'стр. {n}',
  'toc.here': 'читаешь',
  'toc.empty': 'В этом тексте глав не нашлось. Они есть в файлах .fb2 и .epub, а в обычном тексте распознаются заголовки вида «Глава 5», «ЧАСТЬ ВТОРАЯ» или римские цифры отдельной строкой.',

  // ===== индикатор =====
  'pace.m': '{m} мин',
  'pace.hm': '{h} ч {m} мин',
  'pace.h': '{h} ч',
  'pace.done': 'дочитано',

  // ===== библиотека =====
  'lib.title': 'Библиотека',
  'lib.placeholder': 'Вставь сюда текст книги…',
  'lib.add': 'Добавить',
  'lib.file': 'Файл',
  'lib.empty_text': 'Пустой текст',
  'lib.save_failed_space': 'Не удалось сохранить — возможно, кончилось место',
  'lib.save_failed': 'Не удалось сохранить текст',
  'lib.hint': 'Один текст — один прогресс. Читай его в переписке, клипах, историях, ленте, «видео» или коротких постах — позиция общая.',
  'lib.busy': 'Готовлю книгу…',
  'lib.busy_file': 'Разбираю файл…',
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
  'set.about': 'О приложении',
  'set.version': 'Версия {v}',
  'set.copy': 'Скопировать сведения',
  'set.copied': 'Скопировано — вставляй в письмо',
  'set.copy_failed': 'Не удалось скопировать. Версия: {v}',
  'set.about_hint': 'Если что-то сломалось, скопируй сведения и приложи их к сообщению: по ним видно, какая это сборка и на чём она запущена. Ни текст книги, ни что-либо ещё о тебе туда не попадает.',
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
  'home.search': 'Search',
  'app.books': 'Books',
  'app.settings': 'Settings',

  'chats.search': 'Search',
  'chats.online': 'online',
  'chats.typing': 'typing…',
  'chats.composer': 'Message',
  'chats.unread': 'Unread messages',
  'chats.tab_chats': 'Chats',
  'chats.tab_status': 'Status',
  'chats.tab_groups': 'Groups',
  'chats.tab_calls': 'Calls',
  'chats.tab_people': 'People',
  'reader.end': 'End of text',

  'reels.handle': '@book',
  'reels.of': '{i} of {n}',
  'reels.tag': '#book #finishit',
  'reels.tab_feed': 'For you',
  'reels.tab_subs': 'Following',
  'reels.tab_home': 'Home',
  'reels.tab_friends': 'Friends',
  'reels.tab_inbox': 'Inbox',
  'reels.tab_me': 'Profile',

  'stories.title': 'Stories',
  'stories.hint': 'Tap right for next, left for previous',
  'stories.of': '{i} of {n}',

  'feed.author': 'book.daily',
  'feed.caption': '{marks} likes · fragment {i} of {n}',
  'feed.likes': '{n} likes',
  'feed.your_story': 'Your story',

  'tw.name': 'Book',
  'tw.handle': '@thebook',
  'tw.tab_feed': 'For you',
  'tw.tab_subs': 'Following',
  'tw.views': '{n}K',

  'video.meta': 'book · {views}K views · today',
  'video.here': ' · you stopped here',
  'video.fragment': 'fragment {i} of {n}',
  'video.views': '{views}K views · today',
  'video.chip_all': 'All',
  'video.chip_new': 'New',
  'video.channel': 'book',
  'video.subscribe': 'Subscribe',
  'video.subs': '12.4K subscribers',
  'video.desc': 'Description',
  'video.comments': 'Comments',
  'video.reply': 'Reply',
  'video.add_comment': 'Add a comment…',
  'video.ago': '{n} weeks ago',
  'video.share': 'Share',
  'video.save': 'Save',
  'video.upnext': 'Up next',
  'video.tab_home': 'Home',
  'video.tab_shorts': 'Shorts',
  'video.tab_subs': 'Subscriptions',
  'video.tab_you': 'You',

  'toc.title': 'Contents',
  'toc.count': '{n} chapters',
  'toc.count.one': '{n} chapter',
  'toc.count.few': '{n} chapters',
  'toc.count.many': '{n} chapters',
  'toc.count.other': '{n} chapters',
  'toc.page': 'p. {n}',
  'toc.here': 'reading',
  'toc.empty': 'No chapters found in this text. They come with .fb2 and .epub files; in plain text the app recognises headings like “Chapter 5”, “PART TWO” or a roman numeral on its own line.',

  'pace.m': '{m} min',
  'pace.hm': '{h}h {m}m',
  'pace.h': '{h} h',
  'pace.done': 'finished',

  'lib.title': 'Library',
  'lib.placeholder': 'Paste your book text here…',
  'lib.add': 'Add',
  'lib.file': 'File',
  'lib.empty_text': 'Empty text',
  'lib.save_failed_space': 'Could not save — you may be out of space',
  'lib.save_failed': 'Could not save the text',
  'lib.hint': 'One text, one progress. Read it in chat, clips, stories, feed, “video” or short posts — the position is shared.',
  'lib.busy': 'Preparing the book…',
  'lib.busy_file': 'Reading the file…',
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
  'set.about': 'About',
  'set.version': 'Version {v}',
  'set.copy': 'Copy details',
  'set.copied': 'Copied — paste it into your message',
  'set.copy_failed': 'Could not copy. Version: {v}',
  'set.about_hint': 'If something breaks, copy the details and attach them to your message: they show which build it is and what it runs on. Nothing about you or your book goes in.',
  'notif.title': 'You stopped on page {page}',
  'notif.body': '“{title}” is waiting. A couple of pages is a couple of minutes.'
};

export const DICT = {ru, en};

// Подстановка вида «{i} из {n}». Отсутствующий параметр оставляем как есть —
// это заметно на экране, а значит, будет починено, в отличие от пустой строки.
/**
 * Форма множественного числа для числа `n`.
 *
 * Заводится не «для красоты»: «3 глав» — это не опечатка, а неверный русский,
 * и заметно оно сразу. Считает `Intl.PluralRules` — у русского три формы плюс
 * дробная, и таблица падежей руками здесь была бы своим же багом.
 * Нет Intl (очень старый WebView) — работаем без склонения, а не падаем.
 */
export function pluralForm(lang, n) {
  try {
    return new Intl.PluralRules(lang).select(n);
  } catch {
    return null;
  }
}

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
  return useCallback((key, params) => {
    // Ключ со склонением берётся, только если он объявлен: остальным строкам
    // ничего знать про формы не нужно.
    let k = key;
    if (params && typeof params.n === 'number') {
      const form = pluralForm(lang, params.n);
      if (form && DICT[lang][key + '.' + form]) k = key + '.' + form;
    }
    return format(DICT[lang][k] ?? DICT.ru[k] ?? DICT[lang][key] ?? DICT.ru[key] ?? key, params);
  }, [lang]);
}
