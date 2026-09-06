# Findings

## Нативные фичи, которые заменили код
- `scroll-snap-type: y mandatory` + `scroll-snap-align: start` — вертикальная лента как в клипах, ноль JS.
- `IntersectionObserver` — какая карточка на экране = текущая позиция чтения.
- `Blob.text()` — чтение загруженного .txt без FileReader-колбэков.
- `100dvh` — корректная высота на мобильных с адресной строкой.
- `<input type="file" accept=".txt,.md">` — импорт без библиотек.

## Ограничения (осознанные)
- localStorage ~5 МБ на домен. Книга в .txt обычно 0.3–1.5 МБ, влезает. Дальше — IndexedDB.
- Окно рендера растёт по мере скролла (не виртуализация). Для одной сессии чтения нормально.
- EPUB/PDF не поддерживаются.

## Untrusted content
Текст книги вставляется пользователем и попадает в innerHTML — экранируется через `esc()`.

## Окружение под Android (проверено 2026-09-06)
- Node v24.19.0, npm 11.17.0, git 2.55 — есть.
- Android Studio: `C:\Program Files\Android\Android Studio` (со своим JDK в `jbr`).
- Отдельных `java`/`javac`/`gradle` в PATH нет, `ANDROID_HOME` не задан, SDK в дефолтном месте не найден.
  → Сборка `.aab` возможна только из самой Android Studio, не из CLI.
- Установлено: react 18.3.1, vite 6.4.3, Capacitor 7.6.9, vitest, jsdom, @testing-library/react.
- npm заблокировал postinstall у esbuild (`allow-scripts`), но платформенный бинарь `@esbuild/win32-x64` на месте и работает — сборка не пострадает.

## Почему хранилище абстрагировано
В WebView на Android `localStorage` система может вычистить при нехватке места, и там же лимит ~5 МБ.
Поэтому мета (маленькая, пишется часто) → Capacitor Preferences, тексты книг (большие, пишутся один раз) → Filesystem/Directory.Data.
В браузере обе ветки падают обратно на localStorage.
