import React from 'react';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {render, waitFor, act, fireEvent} from '@testing-library/react';
import App from './App.jsx';
import {StoreProvider} from './store.jsx';
import {saveMeta, saveText} from './lib/storage.js';
import {DICT} from './i18n.js';
import {dayKey} from './lib/streak.js';

// Возврат на то место, где закрыли приложение.
//
// Проверяется здесь, а не в сторе, потому что ломается это не в хранилище.
// Место хранится одним значением, а восстанавливают его два эффекта подряд:
// первый читает прошлое, второй запоминает настоящее. Перепутай их порядок — и
// первый же кадр с домашним экраном затрёт то, что мы собирались прочитать,
// причём молча: тесты стора останутся зелёными, а приложение всегда будет
// открываться на доме.

const TEXT = 'Раз, два, три, четыре, пять. Вышел зайчик погулять.\n\n'.repeat(40);

// Аппаратная «назад» приходит из нативного слоя, а он в браузере не
// выполняется вовсе. Подменяем его целиком, кроме одного: запоминаем
// обработчик, который на телефоне дёргает система, — чтобы дёрнуть его самим.
const NAT = vi.hoisted(() => ({onBack: null, notify: [], answer: 'on'}));
vi.mock('./native.js', async orig => ({
  ...(await orig()),
  initNative: async ({onBack} = {}) => {NAT.onBack = onBack;},
  // Напоминание переставляется при каждом запуске, и настоящая функция в
  // тестах всегда отвечает «негде»: платформа тут не телефон. Подменяем, чтобы
  // увидеть и сам вызов, и то, с каким текстом он уходит.
  refreshNotifications: async payload => {NAT.notify.push(payload); return NAT.answer;}
}));

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const here = () => {
  const el = document.querySelector('.screen');
  return el ? el.id : null;
};

/** Поднять приложение и дождаться конца гидрации (экран загрузки ушёл). */
async function boot() {
  const r = render(<App />, {wrapper});
  await waitFor(() => expect(document.querySelector('.boot')).toBeNull());
  // Экран загрузки ушёл — это коммит гидрации, но не её эффекты: возврат на
  // прошлый экран делает эффект, и под нагрузкой (файлы тестов идут
  // параллельно) он успевал не всегда. Тест тогда видел дом вместо места.
  await act(async () => {});
  return r;
}

/**
 * Пройти вступление первого запуска: выбрать язык и пролистать карточки.
 * Само вступление проверяется в screens/Intro.test.jsx — здесь оно просто
 * стоит на дороге к дому, как и на настоящем первом запуске.
 */
async function pass(lang = 'ru') {
  const want = lang === 'en' ? 'English' : 'Русский';
  const btn = [...document.querySelectorAll('.ilang button')].find(b => b.textContent === want);
  await act(async () => {btn.click();});
  // Кнопка внизу справа ведёт по карточкам, последняя заканчивает вступление.
  for (let i = 0; i < 8 && document.querySelector('.igo'); i++) {
    await act(async () => {document.querySelector('.igo').click();});
  }
  // Первая книга кладётся после вступления и кладётся асинхронно. Дождаться её
  // здесь обязательно: незавершённая запись доживает до следующего теста и
  // приезжает в чужое хранилище посреди его гидрации.
  await waitFor(() => expect((rawMeta() || {books: []}).books).toHaveLength(1));
}

/** Положить в хранилище книгу и место, как после прошлого запуска. */
const seed = (place, ui) =>
  Promise.all([
    saveText('b1', TEXT),
    saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1',
      at: {b1: 0},
      last: 'reels',
      ui: ui || undefined,
      place
    })
  ]);

beforeEach(() => {
  localStorage.clear();
  NAT.notify.length = 0;
  NAT.answer = 'on';
});

describe('место при перезапуске', () => {
  // Пустое хранилище — это первый запуск, а он начинается со вступления.
  // Дом за ним: возвращаться после него некуда, места ещё нет.
  it('без записи открывается дом — после вступления', async () => {
    await boot();
    expect(here()).toBe('intro');
    await pass();
    expect(here()).toBe('home');
  });

  it('возвращает на тот экран, где закрыли', async () => {
    await seed({id: 'feed', arg: null});
    await boot();
    expect(here()).toBe('feed');
  });

  // Параметр — часть места, а не украшение: без него «переписка» открылась бы,
  // но с другим собеседником, а мессенджер — не на той вкладке.
  it('возвращает и параметр экрана', async () => {
    // Панель вкладок есть только у «зелёного» мессенджера — этим он и отличается.
    await seed({id: 'chats', arg: 'groups'}, {skin: 'wa'});
    await boot();
    expect(here()).toBe('chats');
    expect(document.querySelector('.tabbar span.on').getAttribute('aria-label'))
      .toBe(DICT.ru['chats.tab_groups']);
  });

  // Книгу могли удалить, пока приложения не было. Экран чтения без текста —
  // это пустой экран, и `go` для таких случаев уводит в библиотеку; на старте
  // это было бы хуже дома: человек не просил ничего открывать.
  it('без книги остаётся дома, а не уходит в чтение', async () => {
    // `intro: 1` — приложением уже пользовались: книгу удалили, а не не завели.
    await saveMeta({books: [], cur: null, at: {}, last: 'reels',
                    place: {id: 'reels', arg: null}, intro: 1});
    await boot();
    expect(here()).toBe('home');
  });

  // Запись могла остаться от версии, где такой экран был.
  it('неизвестный экран не открывается', async () => {
    await seed({id: 'кино', arg: null});
    await boot();
    expect(here()).toBe('home');
  });

  it('запоминает переход и не затирает его домом', async () => {
    await seed(null);
    const {container} = await boot();
    expect(here()).toBe('home');

    // «Продолжить» на домашнем экране уводит в последнюю читалку.
    await act(async () => {container.querySelector('.widget button').click();});
    expect(here()).toBe('reels');
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'reels', arg: null, at: null, y: 0}));
  });

  // Полный круг: закрыли в чтении — открылись в чтении.
  it('переживает перезапуск целиком', async () => {
    await seed(null);
    const first = await boot();
    await act(async () => {first.container.querySelector('.widget button').click();});
    await waitFor(() => expect(rawMeta().place.id).toBe('reels'));
    first.unmount();

    await boot();
    expect(here()).toBe('reels');
  });

  // Дом — такой же ответ на вопрос «где я был», как остальные. Вышел на дом —
  // вернулся на дом, а не в ту читалку, где был до него.
  it('дом тоже запоминается', async () => {
    await seed({id: 'chats', arg: null});
    const {container} = await boot();
    expect(here()).toBe('chats');

    // Восстановленный экран пришёл без истории, поэтому «‹» ведёт на дом.
    await act(async () => {container.querySelector('.mhdr .back').click();});
    expect(here()).toBe('home');
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'home', arg: null, at: null, y: 0}));
  });
});

// Аппаратная «назад» на телефоне.
//
// Сломать её можно в двух местах: в самом обработчике и в проводе до него.
// Провод здесь и проверяется — что App отдаёт нативному слою работающий
// обработчик и что тот ходит по истории переходов, а не по таблице «откуда
// куда». Сам нативный слой проверяет native.test.js.
describe('аппаратная «назад»', () => {
  it('возвращает на предыдущий экран', async () => {
    await seed(null);
    await boot();
    await act(async () => {document.querySelector('.grid .icon').click();});
    expect(here()).not.toBe('home');

    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(here()).toBe('home');
  });

  // Единственный случай, когда «назад» отдаёт false: дальше некуда, и Android
  // должен свернуть приложение сам.
  it('на доме сворачивает приложение', async () => {
    await seed(null);
    await boot();
    expect(here()).toBe('home');
    expect(await NAT.onBack()).toBe(false);
  });

  // Экран восстановлен после перезапуска — истории переходов нет вообще.
  // Выходить из приложения в этом месте нельзя: человек пришёл на него сам.
  it('с восстановленного экрана ведёт на дом', async () => {
    await seed({id: 'feed', arg: null});
    await boot();
    expect(here()).toBe('feed');

    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(here()).toBe('home');
  });
});

// Напоминание при запуске.
//
// Будильник живёт в Android, а не в приложении: обновление из Play снимает
// запланированные alarm'ы, и напоминание, включённое месяц назад, после
// первого же обновления молча перестаёт приходить — при переключателе,
// который по-прежнему стоит на «Вкл».
describe('напоминание при запуске', () => {
  /** Книга, место в ней и состояние переключателя — как после прошлого запуска. */
  const seedNotify = (notify, at = 0) =>
    Promise.all([
      saveText('b1', TEXT),
      saveMeta({
        books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
        cur: 'b1', at: {b1: at}, last: 'reels', place: null,
        ui: {theme: 'system', lang: 'ru', font: 'md', notify, skin: 'tg'}
      })
    ]);

  it('включённое переставляется заново', async () => {
    await seedNotify('on');
    await boot();
    await waitFor(() => expect(NAT.notify).toHaveLength(1));
  });

  it('в текст уезжает та страница, на которой остановились', async () => {
    await seedNotify('on', 1900);
    await boot();
    await waitFor(() => expect(NAT.notify).toHaveLength(1));
    // Страница 2, а не 1: иначе напоминание полгода зовёт в начало книги.
    expect(NAT.notify[0].title).toBe(DICT.ru['notif.title'].replace('{page}', '2'));
    expect(NAT.notify[0].body).toContain('Книга');
  });

  it('выключенное не трогаем', async () => {
    await seedNotify('off');
    await boot();
    expect(here()).toBe('home');
    expect(NAT.notify).toHaveLength(0);
  });

  // Разрешение отзывают в настройках телефона, и приложение узнаёт об этом
  // только здесь. «Вкл» без разрешения — надпись, которой нельзя верить.
  it('отозванное разрешение гасит переключатель', async () => {
    await seedNotify('on');
    NAT.answer = 'denied';
    await boot();
    await waitFor(() => expect(rawMeta().ui.notify).toBe('off'));
  });

  it('в браузере переключатель не гасится', async () => {
    await seedNotify('on');
    NAT.answer = 'nowhere';
    await boot();
    await waitFor(() => expect(NAT.notify).toHaveLength(1));
    expect(rawMeta().ui.notify).toBe('on');
  });
});

describe('плашка ошибки', () => {
  // Стор отдаёт ключ, а текст выбирает приложение: раньше плашка говорила
  // по-русски и тому, кто выбрал английский, и висела до следующего импорта
  // поверх нижней панели.
  it('говорит на языке человека и убирается нажатием', async () => {
    await seed({id: 'library', arg: null}, {lang: 'en'});
    await boot();
    expect(here()).toBe('library');
    fireEvent.change(document.querySelector('#library textarea'), {target: {value: 'Some text.'}});
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      await act(async () => {document.querySelector('#library .row button').click();});
      await waitFor(() => expect(document.querySelector('.err')).not.toBeNull());
      expect(document.querySelector('.err').textContent).toBe(DICT.en['err.full']);
      await act(async () => {document.querySelector('.err').click();});
      expect(document.querySelector('.err')).toBeNull();
    } finally {
      full.mockRestore();
    }
  });
});

describe('библиотека', () => {
  // Место в каждой книге стор хранил всегда, а библиотека показывала процент
  // только у открытой — выбрать «ту, что почти дочитал» было нельзя.
  it('показывает, сколько прочитано, у каждой книги', async () => {
    const other = 'Другая книга. '.repeat(100);
    await Promise.all([
      saveText('b1', TEXT),
      saveText('b2', other),
      saveMeta({
        books: [
          {id: 'b1', title: 'Первая', len: TEXT.length, toc: 1},
          {id: 'b2', title: 'Вторая', len: other.length, toc: 1}
        ],
        cur: 'b1',
        at: {b1: Math.floor(TEXT.length / 4), b2: other.length - 1},
        last: 'reels',
        place: {id: 'library', arg: null}
      })
    ]);
    await boot();
    const rows = [...document.querySelectorAll('#library .book .i span')].map(s => s.textContent);
    expect(rows[0]).toMatch(/· 25%$/);
    expect(rows[1]).toMatch(/· 100%$/);
    const bars = [...document.querySelectorAll('#library .book .pbar em')].map(e => e.style.transform);
    expect(bars[1]).toBe('scaleX(1.0000)');
  });
});

describe('счёт дня на домашнем экране', () => {
  const at = (pace) => Promise.all([
    saveText('b1', TEXT),
    saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1', at: {b1: 0}, last: 'reels', place: {id: 'home', arg: null}, pace
    })
  ]);
  const line = () => {
    const el = document.querySelector('.widget .ws');
    return el ? el.textContent : null;
  };
  const day = shift => dayKey(new Date(Date.now() + shift * 864e5));

  it('сегодня — минуты и серия', async () => {
    await at({d: day(0), n: 3300, s: 3});
    await boot();
    expect(line()).toBe('Сегодня 3 мин · 3 дня подряд');
  });

  it('вчерашняя серия жива, пока день не кончился', async () => {
    await at({d: day(-1), n: 3300, s: 5});
    await boot();
    expect(line()).toBe('5 дней подряд');
  });

  it('один день — это просто «сегодня», без серии; ничего — ничего', async () => {
    await at({d: day(0), n: 200, s: 1});
    await boot();
    expect(line()).toBe('Сегодня 1 мин');
  });

  it('позавчера — пусто', async () => {
    await at({d: day(-2), n: 3300, s: 9});
    await boot();
    expect(line()).toBeNull();
  });
});

describe('переход на другой экран', () => {
  // Место прокрутки принадлежит экрану. Новый экран на первой отрисовке читал
  // место ПРЕДЫДУЩЕГО — оно менялось эффектом уже после — и открывался с чужой
  // прокруткой: переписка сдвигалась, а замер по нижнему краю уносил курсор на
  // экран вперёд. Видно это и по кнопке «Вернуться к месту»: она горит, когда
  // видимое отстаёт от курсора, — то есть по записи с чужого экрана.
  it('не берёт место прокрутки с прошлого экрана', async () => {
    // В ленте листали назад и там же остановились: запись прокрутки на
    // начале книги, курсор — далеко впереди.
    await Promise.all([
      saveText('b1', TEXT),
      saveMeta({
        books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
        cur: 'b1', at: {b1: 1500}, last: 'feed',
        place: {id: 'feed', arg: null, at: 0, y: 0}
      })
    ]);
    await boot();
    expect(here()).toBe('feed');
    expect(document.querySelector('.resume')).not.toBeNull();   // своя запись — своя кнопка
    // «Сообщения» на нижней панели ленты — в переписку.
    const mail = [...document.querySelectorAll('.tabbar span')]
      .find(el => el.getAttribute('aria-label') === DICT.ru['a11y.chats']);
    await act(async () => {mail.click();});
    expect(here()).toBe('chats');
    expect(document.querySelector('.resume')).toBeNull();       // чужой записи нет
    expect(rawMeta().at.b1).toBe(1500);
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'chats', arg: null, at: null, y: 0}));
  });

  it('«назад» из оглавления после второго захода — в тот же экран, а не на дом', async () => {
    await seed({id: 'home', arg: null});
    await boot();
    const open = async label => {
      const el = [...document.querySelectorAll('#home .grid .icon')].find(e => e.textContent.includes(label));
      await act(async () => {el.click();});
    };
    await open('Telegran');
    expect(here()).toBe('chats');
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    expect(here()).toBe('toc');
    await act(async () => {document.querySelectorAll('#toc .body .ch')[1].click();});
    expect(here()).toBe('chats');
    await act(async () => {document.querySelector('.prog .counter.tap').click();});
    expect(here()).toBe('toc');
    await act(async () => {document.querySelector('#toc .hdr .back').click();});
    expect(here()).toBe('chats');
  });
});

describe('«назад» без истории', () => {
  // После перезапуска истории переходов нет. Раньше «назад» тогда всегда
  // вёл на дом; у оглавления, плеера и переписки есть родитель, и туда и надо.
  const cases = [
    [{id: 'toc', arg: 'pages'}, 'feed'],
    [{id: 'player', arg: null}, 'video'],
    [{id: 'chat', arg: null}, 'chats'],
    [{id: 'settings', arg: null}, 'home']
  ];
  for (const [place, want] of cases) {
    it(place.id + ' → ' + want, async () => {
      await Promise.all([
        saveText('b1', TEXT),
        saveMeta({
          books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
          cur: 'b1', at: {b1: 0}, last: 'feed', place
        })
      ]);
      await boot();
      expect(here()).toBe(place.id);
      await act(async () => {expect(await NAT.onBack()).toBe(true);});
      expect(here()).toBe(want);
    });
  }
});

describe('звонки из переписки', () => {
  // Трубка в шапке переписки у «синего» мессенджера (вкладок нет вовсе)
  // открывает журнал звонков отдельным экраном, а не список чатов.
  it('у обёртки без вкладок открывает журнал звонков', async () => {
    await seed({id: 'chat', arg: 0}, {skin: 'tg'});
    await boot();
    expect(here()).toBe('chat');
    const phone = [...document.querySelectorAll('.chdr .ic')]
      .find(el => el.getAttribute('aria-label') === DICT.ru['chats.tab_calls']);
    await act(async () => {phone.click();});
    expect(here()).toBe('chats');
    expect(document.querySelector('.mhdr h2').textContent).toBe(DICT.ru['chats.tab_calls']);
    expect(document.querySelectorAll('.crow.call').length).toBeGreaterThan(0);
  });
});

describe('книга без текста', () => {
  // После восстановления из облачной копии текста книги нет, а место есть.
  it('домашний экран говорит, что делать, и место не обнуляется', async () => {
    await saveMeta({
      books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
      cur: 'b1', at: {b1: 900}, last: 'reels', place: {id: 'home', arg: null}
    });
    await boot();
    expect(document.querySelector('.widget .ws').textContent).toBe(DICT.ru['home.missing']);
    expect(rawMeta() === null || rawMeta().at.b1 === 900).toBe(true);
  });
});

describe('история после поиска', () => {
  // Путь, на котором тестировщик терялся: дом → строка поиска → находка
  // (открываются клипы) → лупа (снова оглавление) → «назад». Раньше это вело
  // на дом: второе открытие оглавления разматывало историю до первого.
  it('«назад» из оглавления возвращает в «приложение», где читали', async () => {
    await seed({id: 'home', arg: null});
    await boot();
    await act(async () => {document.querySelector('.qsearch').click();});
    expect(here()).toBe('toc');
    const input = document.querySelector('.qbox input');
    await act(async () => {fireEvent.change(input, {target: {value: 'зайчик'}});});
    await waitFor(() => expect(document.querySelector('.snip')).not.toBeNull());
    await act(async () => {document.querySelector('.snip').closest('.ch').click();});
    expect(here()).toBe('reels');
    await act(async () => {document.querySelectorAll('.tabbar span')[1].click();});   // «Подписки» → оглавление
    expect(here()).toBe('toc');
    await act(async () => {expect(await NAT.onBack()).toBe(true);});
    expect(here()).toBe('reels');
    // А с клипов «назад» — не по кругу, а к выходу.
    await act(async () => {await NAT.onBack();});
    await act(async () => {await NAT.onBack();});
    expect(here()).toBe('home');
    await act(async () => {expect(await NAT.onBack()).toBe(false);});
  });
});

describe('дочитанная книга', () => {
  // Курсор на последнем знаке — книга кончилась: «осталось» говорит
  // «дочитано», а кнопка ведёт выбрать следующую, а не на последнюю страницу.
  it('на доме «дочитано» и «Выбрать следующую книгу»', async () => {
    await Promise.all([
      saveText('b1', TEXT),
      saveMeta({
        books: [{id: 'b1', title: 'Книга', len: TEXT.length, toc: 1}],
        cur: 'b1', at: {b1: TEXT.length - 1}, last: 'reels', place: {id: 'home', arg: null}
      })
    ]);
    await boot();
    expect(document.querySelector('.widget .lf').textContent).toBe(DICT.ru['pace.done']);
    const btn = document.querySelector('.widget button');
    expect(btn.textContent).toBe(DICT.ru['home.next_book']);
    await act(async () => {btn.click();});
    expect(here()).toBe('library');
  });
});

