# Скролл

Читалка для людей с СДВГ и тех, кто привык к быстрому вертикальному контенту.

Вставляешь свою книгу — приложение режет её на короткие куски и показывает не как книгу, а как экран телефона. Заходишь в «Чаты» — текст приходит сообщениями. В «Клипы» — листаешь вертикально. В «Ленту» — читаешь постами. В «Видео» — открываешь «ролики».

**Главное:** курсор общий. Прочитал десять кусков в клипах, зашёл в чаты — продолжаешь с одиннадцатого.

## Стек

React 18 + Vite 6, обёрнутые в Capacitor 7. Тесты — Vitest.

```
src/
├── lib/chunk.js       нарезка текста на куски
├── lib/storage.js     хранилище: Capacitor на Android, localStorage в браузере
├── store.jsx          весь стейт: книги, чанки, курсор
├── screens/           Home, Chats, Reels, Feed, Video, Library
├── ui/                оболочка экрана, шапка, прогресс, окно рендера карточек
└── native.js          status bar и аппаратная кнопка «назад»
android/               проект для Android Studio (генерируется Capacitor)
www_backup/            ванильный прототип, эталон поведения
```

## Разработка

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 42 теста
```

## Сборка под Android

Требуется Android Studio. Свой JDK у неё внутри — отдельные `java` и `gradle` ставить не нужно.

**Первый запуск.** Открой Android Studio → `Tools → SDK Manager` → поставь Android SDK Platform 35 и Android SDK Build-Tools. Без этого Gradle не соберёт проект.

**Открыть проект.** В Android Studio: `Open` → выбери папку **`android`**, не корень репозитория. Корень она не поймёт — там лежит фронт, а не Gradle-проект. Дождись, пока пройдёт Gradle Sync.

**Собрать и запустить на телефоне.** Включи на телефоне режим разработчика и отладку по USB, подключи, выбери устройство в списке вверху → `Run` (▶).

**Debug-APK:** `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
Файл ляжет в `android/app/build/outputs/apk/debug/`.

**Подписанный `.aab` для Google Play:**

1. `Build → Generate Signed Bundle / APK` → `Android App Bundle`.
2. Если keystore ещё нет — `Create new`. **Сохрани файл keystore и пароли.** Потеряешь их — обновить приложение в Play уже не сможешь, придётся публиковать заново под другим именем пакета.
3. Вариант сборки — `release`.
4. Готовый `.aab` окажется в `android/app/release/`.

## После правок фронта

Android не видит изменения в `src/` автоматически — в проект копируется собранный `dist/`:

```bash
npm run build && npx cap sync android
```

Или одной командой, которая ещё и откроет Studio:

```bash
npm run android
```

## Что менять перед публикацией

| Что | Где |
|---|---|
| ID пакета (`com.sdvgapp.scroll`) | `capacitor.config.json` и `android/app/build.gradle` |
| Название приложения | `capacitor.config.json`, `android/app/src/main/res/values/strings.xml` |
| Версия (`versionCode`, `versionName`) | `android/app/build.gradle` — `versionCode` обязан расти с каждой заливкой в Play |
| Иконка | `android/app/src/main/res/mipmap-*` — сейчас стоят дефолтные от Capacitor |

## Известные ограничения

- Иконка и splash — заглушки Capacitor, надо нарисовать свои.
- Поддерживается `.txt` и вставка текста. EPUB/PDF нет — для них нужна отдельная библиотека-распаковщик.
- Ориентация зафиксирована портретной (`AndroidManifest.xml`).
