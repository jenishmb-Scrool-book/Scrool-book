# Скролл — React + Capacitor, порт под Android

> **Для Claude:** этот план исполняется по `subagent-driven-development`: свежий субагент на задачу, ревью-гейт между задачами.

**Goal:** Перенести работающий ванильный прототип читалки на React + Vite и завернуть в настоящий Android Studio проект через Capacitor, готовый к сборке `.aab` для Google Play.

**Architecture:** Текст книги режется на чанки один раз; есть один курсор `pos`. Экраны («Чаты», «Клипы», «Лента», «Видео») — это разные рендереры одной пары `(chunks, pos)`, поэтому позиция чтения общая. Состояние живёт в одном React-контексте; хранилище абстрагировано за `src/lib/storage.js`, чтобы на Android использовать Capacitor Filesystem/Preferences, а в браузере — localStorage.

**Tech Stack:** React 18, Vite 6, Vitest + jsdom + Testing Library, Capacitor 7 (`@capacitor/android`, `preferences`, `filesystem`, `app`, `status-bar`).

**Референс поведения:** `www_backup/vanilla-prototype.html` — рабочий прототип. Вся логика и вёрстка уже проверены в браузере; порт должен сохранить поведение, а не изобретать новое.

---

## Жёсткие контракты (менять нельзя — на них завязаны параллельные задачи)

### `src/lib/chunk.js`

```js
export function chunk(text: string, max = 280): string[]
```

Режет по пустым строкам на абзацы, схлопывает пробелы, абзацы длиннее `max` доразрезает по границам предложений (`/(?<=[.!?…»"])\s+/`). Пустые куски отбрасывает.

### `src/lib/storage.js`

```js
export async function loadMeta(): Promise<Meta | null>
export async function saveMeta(meta: Meta): Promise<void>
export async function loadText(id: string): Promise<string>
export async function saveText(id: string, text: string): Promise<void>   // бросает StorageFullError
export async function deleteText(id: string): Promise<void>
export class StorageFullError extends Error {}

type Meta = {books: {id: string, title: string, n: number}[], cur: string | null, pos: Record<string, number>, last: string}
```

Две реализации за одним интерфейсом: Capacitor (`Preferences` для меты, `Filesystem`/`Directory.Data` для текстов) когда `Capacitor.isNativePlatform()`, иначе `localStorage`. Тексты книг НИКОГДА не лежат в мете — иначе на каждый сдвиг курсора пересериализуется вся книга.

### `src/store.jsx`

```jsx
export function StoreProvider({children})
export function useStore()
```

`useStore()` возвращает ровно это:

```js
{
  ready: boolean,          // гидрация из хранилища завершена
  books: {id, title, n}[],
  current: {id, title, n} | null,
  chunks: string[],        // текущая книга, порезанная
  pos: number,
  setPos(i: number): void,         // клампится в [0, chunks.length-1], пишется в хранилище с дебаунсом 400мс
  lastApp: 'reels'|'chats'|'feed'|'video',
  setLastApp(id): void,
  addBook(title: string, text: string): Promise<string>,   // -> id
  openBook(id: string): Promise<void>,
  deleteBook(id: string): Promise<void>,
  error: string | null     // сообщение для пользователя (например «не влезло в хранилище»)
}
```

### `src/native.js`

```js
export async function initNative({onBack}): Promise<void>   // status bar, edge-to-edge, аппаратная кнопка «назад»
```

`onBack()` вызывается на аппаратную «назад»; если вернёт `false`, приложение сворачивается (`App.exitApp()`).

### Роутинг экранов

`src/App.jsx` держит `const [screen, setScreen] = useState('home')`. Идентификаторы: `home | chats | reels | feed | video | player | library`. Каждый экран получает пропсы `{go}` где `go(screenId)`.

---

## Task 1 — Ядро: чанкер, хранилище, стор

**Владеет файлами:** `src/lib/chunk.js`, `src/lib/chunk.test.js`, `src/lib/storage.js`, `src/lib/storage.test.js`, `src/store.jsx`, `src/store.test.jsx`. Ничего за пределами этого списка не трогает.

**TDD, строго:** сначала падающий тест, потом минимальная реализация.

**Шаг 1.** Тесты `chunk()`: разделение абзацев, отбрасывание пустых, короткий абзац не режется, длинный режется по предложениям, ни один кусок не длиннее `max * 1.15`, схлопывание переносов внутри абзаца.

**Шаг 2.** `npx vitest run src/lib/chunk.test.js` → FAIL. Реализовать. → PASS.

**Шаг 3.** Тесты `storage.js` на веб-ветке (в jsdom `Capacitor.isNativePlatform()` = false): круговорот meta, круговорот текста, `deleteText` убирает ключ, переполнение квоты (замокать `localStorage.setItem` на бросок `QuotaExceededError`) даёт `StorageFullError`, `loadMeta()` на пустом хранилище возвращает `null`, битый JSON в мете тоже даёт `null`, а не бросает.

**Шаг 4.** Тесты `store.jsx` через `@testing-library/react` (`renderHook`): гидрация выставляет `ready`, `addBook` кладёт книгу и режет её на чанки, `setPos` клампится по границам, `openBook` подменяет `chunks` и восстанавливает `pos` этой книги, `deleteBook` переключает `current` на первую оставшуюся (или `null`), `addBook` при переполнении выставляет `error` и не роняет приложение.

**Шаг 5.** `npm test` — всё зелёное.

**Отчёт:** какие тесты написаны, вывод `npm test`, изменённые файлы.

---

## Task 2 — Экраны и вёрстка

**Владеет файлами:** `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `src/ui/**`, `src/screens/{Home,Chats,Reels,Feed,Video,Library}.jsx`. `src/lib/**`, `src/store.jsx`, `src/native.js` — только импортировать, не редактировать.

Работает от контрактов выше: они зафиксированы, ждать Task 1 не нужно.

**Перенести из `www_backup/vanilla-prototype.html` один в один** (вёрстка и CSS уже проверены на 375×812):

- Оболочка `#phone`: `max-width:440px`, `height:100dvh`, экраны абсолютным позиционированием.
- **Home** — виджет «Читаешь сейчас» с прогрессом и «Продолжить» (уводит в `lastApp`), сетка из 8 иконок, док из трёх.
- **Chats** — чанки от `pos-14` до `pos` пузырями, кнопка «Дальше ↓» двигает `pos`, автоскролл вниз.
- **Reels** — `scroll-snap-type: y mandatory`, карточка ровно `height:100%`, рельса лайков справа, счётчик «N из M».
- **Feed** — посты, текст лежит на месте картинки, шапка `книга.дня`.
- **Video** — список «роликов» + экран плеера; **скролл списка НЕ двигает `pos`**, двигает только открытие ролика.
- **Library** — textarea, импорт `.txt` через `<input type="file">`, список книг с прогрессом, удаление.

**Обязательно сохранить два свойства, которые уже проверены:**

1. Скролл-контейнер `.body` имеет `position:relative` — иначе `offsetTop` считается от экрана и промахивается на высоту шапки.
2. Курсор двигает карточка, которая сейчас вверху скролл-контейнера, дебаунс 120 мс. НЕ использовать `IntersectionObserver` — в прототипе он не срабатывал; обычный обработчик `scroll` проще и детерминированнее.

**Окно рендера:** экран монтирует ~25 карточек от `pos - ahead` и доращивает по 20 при подлёте к концу. Не рендерить всю книгу.

**Экранирование:** в React `{text}` экранируется само — `dangerouslySetInnerHTML` не использовать нигде.

**Шаг проверки:** `npm run dev`, пройти все экраны, убедиться что позиция переносится между «Клипами» и «Чатами».

**Отчёт:** список созданных компонентов, что проверено вручную, скриншот-описание каждого экрана.

---

## Task 3 — Android-обвязка

**Владеет файлами:** `capacitor.config.json`, `src/native.js`, `android/**`, `README.md`. `src/screens/**`, `src/store.jsx`, `src/lib/**` не трогает.

**Шаг 1.** `capacitor.config.json`: `appId: "com.sdvgapp.scroll"`, `appName: "Скролл"`, `webDir: "dist"`, `android.backgroundColor: "#0b0b12"`.

**Шаг 2.** `npm run build` (если `src/main.jsx` ещё не готов — создать временную заглушку `dist/index.html`, потом пересобрать), затем `npx cap add android`.

**Шаг 3.** `src/native.js`: `initNative({onBack})` — тёмный status bar, `setOverlaysWebView(false)`, подписка на `App.addListener('backButton')` с вызовом `onBack()` и `App.exitApp()` когда тот вернул `false`. На вебе (`!Capacitor.isNativePlatform()`) молча ничего не делает.

**Шаг 4.** `android/app/src/main/AndroidManifest.xml`: `android:screenOrientation="portrait"`, `android:configChanges` оставить как сгенерировано, `android:allowBackup="true"`.

**Шаг 5.** Иконка и splash: сгенерировать простой adaptive icon (фон `#0b0b12`, глиф) в `android/app/src/main/res/mipmap-*`. Без внешних сервисов — SVG/PNG сгенерировать локально.

**Шаг 6.** `README.md`: как открыть проект в Android Studio (`C:\Program Files\Android\Android Studio`, свой JDK внутри, отдельные java/gradle не нужны), как собрать `.aab` (`Build → Generate Signed Bundle`), как пересобирать после правок фронта (`npm run build && npx cap sync android`), где менять `appId`.

**Отчёт:** что сгенерировалось, содержимое манифеста, точные шаги сборки в Android Studio, известные ограничения.

---

## Task 4 — Ревью-гейт

После Task 1–3: свежий агент читает весь `src/**` и `android/app/src/main/AndroidManifest.xml`, сверяет с контрактами из этого файла и ищет: расхождения интерфейсов между стором и экранами, потерю поведения относительно прототипа, гонки при гидрации, утечки подписок, `dangerouslySetInnerHTML`, хранение текстов книг внутри меты, отсутствующие тесты.

Возвращает: Strengths / Critical / Important / Minor + вердикт.

---

## Интеграция (делает оркестратор)

1. `npm test` — зелёное.
2. `npm run build` — сборка без ошибок.
3. Прогон в браузере: все экраны, перенос позиции, перезагрузка сохраняет прогресс.
4. `npx cap sync android`.
5. Отчёт пользователю + инструкция для Android Studio.
