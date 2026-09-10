import React from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';
import {StoreProvider, useStore} from './store.jsx';
import {saveMeta, saveText} from './lib/storage.js';

const wrapper = ({children}) => <StoreProvider>{children}</StoreProvider>;
const rawMeta = () => JSON.parse(localStorage.getItem('scroll.meta') || 'null');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Поднять стор и дождаться конца гидрации.
async function mount() {
  const h = renderHook(() => useStore(), {wrapper});
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}
const add = async (h, title, text) => {
  let id;
  await act(async () => {id = await h.result.current.addBook(title, text);});
  return id;
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('гидрация', () => {
  it('на пустом хранилище выставляет ready и пустое состояние', async () => {
    const {result} = await mount();
    expect(result.current.ready).toBe(true);
    expect(result.current.books).toEqual([]);
    expect(result.current.current).toBeNull();
    expect(result.current.text).toBe('');
    expect(result.current.offset).toBe(0);
    expect(result.current.lastApp).toBe('reels');
    expect(result.current.error).toBeNull();
  });

  it('восстанавливает книгу, её текст и смещение', async () => {
    const text = 'Раз. Два.\n\nТри абзац.';
    await saveText('b1', text);
    await saveMeta({books: [{id: 'b1', title: 'Книга', len: text.length}], cur: 'b1', at: {b1: 7}, last: 'feed'});

    const {result} = await mount();
    expect(result.current.text).toBe(text);
    expect(result.current.offset).toBe(7);
    expect(result.current.current).toMatchObject({id: 'b1', title: 'Книга'});
    expect(result.current.lastApp).toBe('feed');
  });

  it('смещение за концом текста подрезается по длине', async () => {
    const text = 'Короткий.';
    await saveText('b1', text);
    await saveMeta({books: [{id: 'b1', title: 'К', len: 999}], cur: 'b1', at: {b1: 900}, last: 'reels'});

    const {result} = await mount();
    expect(result.current.offset).toBe(text.length - 1);
    expect(result.current.current.len).toBe(text.length);   // длина пересчитана по факту
  });
});

describe('addBook', () => {
  it('кладёт книгу, запоминает её длину и делает текущей', async () => {
    const h = await mount();
    const text = 'Первый абзац.\n\nВторой абзац.';
    const id = await add(h, 'Тест', text);

    expect(typeof id).toBe('string');
    expect(h.result.current.books).toHaveLength(1);
    expect(h.result.current.current).toMatchObject({id, title: 'Тест', len: text.length});
    expect(h.result.current.text).toBe(text);
    expect(h.result.current.offset).toBe(0);
  });

  it('берёт заголовок из начала текста, если он не задан', async () => {
    const h = await mount();
    await add(h, '', 'Заголовка не дали.');
    expect(h.result.current.current.title).toBe('Заголовка не дали.');
  });

  it('текст кладёт отдельно от меты', async () => {
    const h = await mount();
    await add(h, 'Тест', 'ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ.');
    expect(localStorage.getItem('scroll.meta')).not.toContain('ОЧЕНЬ-ДЛИННЫЙ-ТЕКСТ-КНИГИ');
  });

  it('двум книгам подряд выдаёт разные id', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'Текст А.');
    const b = await add(h, 'Б', 'Текст Б.');
    expect(a).not.toBe(b);
    expect(h.result.current.books).toHaveLength(2);
  });

  it('на пустом тексте выставляет error и не заводит книгу', async () => {
    const h = await mount();
    const id = await add(h, 'Пусто', '   \n  ');
    expect(id).toBeNull();
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.error).toBeTruthy();
  });

  // Хранилище кончилось — это сообщение пользователю, а не падение приложения.
  it('при переполнении хранилища выставляет error и не роняет приложение', async () => {
    const h = await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const id = await add(h, 'Толстая', 'Очень большой текст.');

    expect(id).toBeNull();
    expect(h.result.current.error).toMatch(/хранилищ/i);
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.ready).toBe(true);
    expect(h.result.current.text).toBe('');
  });
});

describe('setOffset', () => {
  const TEXT = 'Раз.\n\nДва.\n\nТри.';

  it('клампится в [0, длина - 1]', async () => {
    const h = await mount();
    await add(h, 'Тест', TEXT);

    act(() => h.result.current.setOffset(-5));
    expect(h.result.current.offset).toBe(0);
    act(() => h.result.current.setOffset(999));
    expect(h.result.current.offset).toBe(TEXT.length - 1);
    act(() => h.result.current.setOffset(6));
    expect(h.result.current.offset).toBe(6);
  });

  it('на пустой книге не ломается', async () => {
    const {result} = await mount();
    act(() => result.current.setOffset(5));
    expect(result.current.offset).toBe(0);
  });

  // Лента дёргает курсор десятки раз в секунду — писать хранилище на каждый кадр нельзя.
  it('пишется в хранилище с дебаунсом 400 мс, одной записью на серию', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', TEXT);

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {h.result.current.setOffset(6); h.result.current.setOffset(12);});
    expect(rawMeta().at[id]).toBe(0);            // сразу — в хранилище ещё старое
    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(rawMeta().at[id]).toBe(12));
    expect(spy.mock.calls.filter(c => c[0] === 'scroll.meta')).toHaveLength(1);
  });
});

describe('openBook / deleteBook', () => {
  it('openBook подменяет текст и восстанавливает смещение своей книги', async () => {
    const h = await mount();
    const textA = 'А-раз.\n\nА-два.\n\nА-три.';
    const a = await add(h, 'А', textA);
    act(() => h.result.current.setOffset(16));
    const b = await add(h, 'Б', 'Б-раз.\n\nБ-два.');

    expect(h.result.current.text).toBe('Б-раз.\n\nБ-два.');
    expect(h.result.current.offset).toBe(0);

    await act(async () => {await h.result.current.openBook(a);});
    expect(h.result.current.text).toBe(textA);
    expect(h.result.current.offset).toBe(16);
    expect(h.result.current.current.id).toBe(a);

    await act(async () => {await h.result.current.openBook(b);});
    expect(h.result.current.offset).toBe(0);
  });

  it('deleteBook переключает current на первую оставшуюся книгу', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'А-раз.\n\nА-два.');
    const b = await add(h, 'Б', 'Б-раз.');
    expect(h.result.current.current.id).toBe(b);

    await act(async () => {await h.result.current.deleteBook(b);});
    expect(h.result.current.books).toHaveLength(1);
    expect(h.result.current.current.id).toBe(a);
    expect(h.result.current.text).toBe('А-раз.\n\nА-два.');
    expect(localStorage.getItem('scroll.book.' + b)).toBeNull();
  });

  it('удаление последней книги обнуляет current и текст', async () => {
    const h = await mount();
    const a = await add(h, 'А', 'А-раз.');
    await act(async () => {await h.result.current.deleteBook(a);});
    expect(h.result.current.books).toEqual([]);
    expect(h.result.current.current).toBeNull();
    expect(h.result.current.text).toBe('');
    expect(h.result.current.offset).toBe(0);
  });
});

describe('lastApp', () => {
  it('запоминается и переживает перезапуск', async () => {
    const h = await mount();
    act(() => h.result.current.setLastApp('chat'));
    expect(h.result.current.lastApp).toBe('chat');
    h.unmount();

    const again = await mount();
    expect(again.result.current.lastApp).toBe('chat');
  });

  // Список читалок в сторе обязан совпадать с READERS в App.jsx. Когда на
  // Этапе 1 появились три новых экрана, а сюда они не доехали, setLastApp
  // молча их отбрасывал: «Продолжить» после чтения в чатах открывало клипы.
  it('принимает все семь экранов-читалок', async () => {
    const h = await mount();
    for (const id of ['chats', 'chat', 'reels', 'stories', 'feed', 'video', 'tweets']) {
      act(() => h.result.current.setLastApp(id));
      expect(h.result.current.lastApp, id).toBe(id);
    }
  });

  // На Этапе 6 список переписок сам стал читалкой: строка списка это кусок
  // книги, а прокрутка двигает курсор. До этого «chats» здесь отбрасывался, и
  // человека, читавшего список, «Продолжить» уводило внутрь переписки — то
  // есть в другой способ чтения, а не туда, где он был.
  it('запоминает список чатов — он тоже читалка', async () => {
    const h = await mount();
    act(() => h.result.current.setLastApp('feed'));
    act(() => h.result.current.setLastApp('chats'));
    expect(h.result.current.lastApp).toBe('chats');
  });

  // «Продолжить» уводит в читалку. Запомнить тут home или library — значит
  // отправить кнопку в никуда.
  it('не запоминает экраны, которые не читалки', async () => {
    const h = await mount();
    act(() => h.result.current.setLastApp('feed'));
    act(() => h.result.current.setLastApp('library'));
    act(() => h.result.current.setLastApp('home'));
    expect(h.result.current.lastApp).toBe('feed');
  });
});

describe('место', () => {
  // Курсор сохранялся и без этого, но одного его мало: приложение
  // открывалось на доме, и до текста оставалось лишнее нажатие.
  it('запоминается и переживает перезапуск', async () => {
    const h = await mount();
    act(() => h.result.current.setPlace({id: 'chat', arg: 4}));
    expect(h.result.current.place).toEqual({id: 'chat', arg: 4, at: null, y: 0});
    h.unmount();

    const again = await mount();
    expect(again.result.current.place).toEqual({id: 'chat', arg: 4, at: null, y: 0});
  });

  it('вкладка мессенджера — такой же параметр, как номер', async () => {
    const h = await mount();
    act(() => h.result.current.setPlace({id: 'chats', arg: 'groups'}));
    expect(h.result.current.place).toEqual({id: 'chats', arg: 'groups', at: null, y: 0});
  });

  it('без параметра хранит null, а не undefined', async () => {
    const h = await mount();
    act(() => h.result.current.setPlace({id: 'reels'}));
    expect(h.result.current.place).toEqual({id: 'reels', arg: null, at: null, y: 0});
  });

  // Запись могла остаться от другой версии или быть испорчена. Подняться
  // приложение обязано в любом случае — худшее, что теряется, это один переход.
  it('мусор из хранилища превращается в null', async () => {
    for (const junk of [42, 'reels', {}, {id: 7}, {id: ''}, null]) {
      localStorage.clear();
      await saveMeta({books: [], cur: null, at: {}, last: 'reels', place: junk});
      const h = await mount();
      expect(h.result.current.place, JSON.stringify(junk)).toBeNull();
      h.unmount();
    }
  });

  it('параметр неизвестного вида отбрасывается, а само место остаётся', async () => {
    await saveMeta({books: [], cur: null, at: {}, last: 'reels', place: {id: 'chat', arg: {}}});
    const {result} = await mount();
    expect(result.current.place).toEqual({id: 'chat', arg: null, at: null, y: 0});
  });

  it('повторная запись того же места не трогает хранилище', async () => {
    const h = await mount();
    act(() => h.result.current.setPlace({id: 'feed', arg: null}));
    await waitFor(() => expect(rawMeta().place).toEqual({id: 'feed', arg: null, at: null, y: 0}));

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => h.result.current.setPlace({id: 'feed', arg: null}));
    await sleep(600);
    expect(spy).not.toHaveBeenCalled();
  });
});

// Куда смотрели: карточка у кромки экрана (в символах) и сколько её ушло под
// кромку. Одного курсора для возврата мало — он показывает на карточку, а
// стоял человек не на её краю. Как это меряется на живом экране, проверяет
// ui/useCardWindow.test.jsx; здесь — что хранится и когда пропадает.
describe('место прокрутки', () => {
  const BOOK = 'Раз. Два. Три.\n\nЧетыре. Пять.\n\nШесть. Семь.';

  /** Книга и экран, к которому прокрутке есть чем прицепиться. */
  const open = async h => {
    await add(h, 'Тест', BOOK);
    act(() => h.result.current.setPlace({id: 'feed', arg: null}));
  };

  it('пишется внутрь места и переживает перезапуск', async () => {
    const h = await mount();
    await open(h);
    act(() => h.result.current.setSeen(16, 40));
    expect(h.result.current.place).toEqual({id: 'feed', arg: null, at: 16, y: 40});
    h.unmount();

    const again = await mount();
    expect(again.result.current.place).toEqual({id: 'feed', arg: null, at: 16, y: 40});
  });

  // Пиксели меряны от карточки, а карточка — от нарезки этого экрана. На
  // другом экране мерить нечем, и старая запись увела бы в случайное место.
  it('уход на другой экран её стирает', async () => {
    const h = await mount();
    await open(h);
    act(() => h.result.current.setSeen(16, 40));
    act(() => h.result.current.setPlace({id: 'reels', arg: null}));
    expect(h.result.current.place).toEqual({id: 'reels', arg: null, at: null, y: 0});
  });

  // Обратная сторона того же: App пишет место на каждом кадре и знает только
  // экран. Сравнивай setPlace ещё и прокрутку — она стиралась бы сразу.
  it('повторная запись того же экрана её сохраняет', async () => {
    const h = await mount();
    await open(h);
    act(() => h.result.current.setSeen(16, 40));
    act(() => h.result.current.setPlace({id: 'feed', arg: null}));
    expect(h.result.current.place).toEqual({id: 'feed', arg: null, at: 16, y: 40});
  });

  it('без места прокрутке некуда лечь', async () => {
    const h = await mount();
    await add(h, 'Тест', BOOK);
    act(() => h.result.current.setSeen(16, 40));
    expect(h.result.current.place).toBeNull();
  });

  it('за концом книги подрезается', async () => {
    const h = await mount();
    await open(h);
    act(() => h.result.current.setSeen(9000, 40));
    expect(h.result.current.place.at).toBe(BOOK.length - 1);
  });

  it('мусор в записи прокруткой не становится, а экран остаётся', async () => {
    const cases = [
      [{at: '12', y: 5}, {at: null, y: 0}],
      [{at: -5, y: 5}, {at: null, y: 0}],
      [{at: 5, y: 'вниз'}, {at: 5, y: 0}],
      // Отрицательный сдвиг законен: в переписке карточку ставят к нижней кромке.
      [{at: 5, y: -280}, {at: 5, y: -280}],
      [{at: 5, y: 1e9}, {at: 5, y: 1e6}]
    ];
    for (const [raw, want] of cases) {
      localStorage.clear();
      await saveMeta({books: [], cur: null, at: {}, last: 'reels', place: {id: 'feed', arg: null, ...raw}});
      const h = await mount();
      expect(h.result.current.place, JSON.stringify(raw)).toEqual({id: 'feed', arg: null, ...want});
      h.unmount();
    }
  });
});

// Размонтирование спасает только в браузере: Android не закрывает WebView
// вежливо, а убивает процесс целиком — React об этом не узнаёт.
describe('сворачивание', () => {
  const hide = async () => {
    Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true});
    await act(async () => {document.dispatchEvent(new Event('visibilitychange'));});
  };

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true});
  });

  it('дописывает смещение, не дожидаясь дебаунса', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setOffset(12));
    expect(rawMeta().at[id]).toBe(0);           // дебаунс ещё не сработал

    await hide();
    expect(rawMeta().at[id]).toBe(12);
  });

  it('дописывает и место прокрутки', async () => {
    const h = await mount();
    await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setPlace({id: 'feed', arg: null}));
    act(() => h.result.current.setSeen(6, 24));
    expect(rawMeta().place).toBeNull();          // дебаунс ещё не сработал

    await hide();
    expect(rawMeta().place).toEqual({id: 'feed', arg: null, at: 6, y: 24});
  });

  it('видимый экран ничего не пишет', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setOffset(12));
    await act(async () => {document.dispatchEvent(new Event('visibilitychange'));});
    expect(rawMeta().at[id]).toBe(0);
  });

  // Отписка обязательна: иначе каждый перезапуск стора оставляет обработчик
  // на выброшенном состоянии — и он перезапишет мету старым значением.
  it('после размонтирования обработчик снят', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setOffset(12));
    h.unmount();
    expect(rawMeta().at[id]).toBe(12);

    localStorage.setItem('scroll.meta', JSON.stringify({...rawMeta(), at: {[id]: 3}}));
    await hide();
    expect(rawMeta().at[id]).toBe(3);           // мёртвый стор не вмешался
  });
});

describe('размонтирование', () => {
  it('дописывает несохранённое смещение и не оставляет висящий таймер', async () => {
    const h = await mount();
    const id = await add(h, 'Тест', 'Раз.\n\nДва.\n\nТри.');
    act(() => h.result.current.setOffset(12));
    expect(rawMeta().at[id]).toBe(0);            // дебаунс ещё не сработал

    h.unmount();
    expect(rawMeta().at[id]).toBe(12);           // сброшено при размонтировании

    const spy = vi.spyOn(Storage.prototype, 'setItem');
    await sleep(600);                            // дебаунс успел бы сработать
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useStore', () => {
  it('вне провайдера бросает понятную ошибку', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useStore())).toThrow(/StoreProvider/);
  });
});

describe('оглавление', () => {
  const book = 'Начало текста.\n\nГлава 1\n\nТело первой главы.\n\nГлава 2\n\nТело второй главы.';

  it('на пустом хранилище — пусто', async () => {
    const h = await mount();
    expect(h.result.current.chapters).toEqual([]);
  });

  // Главная проверка: смещение главы — та же координата, что и курсор чтения.
  it('распознаётся в обычном тексте при добавлении книги', async () => {
    const h = await mount();
    await act(async () => { await h.result.current.addBook('Книга', book); });
    const ch = h.result.current.chapters;
    expect(ch.map(c => c.title)).toEqual(['Глава 1', 'Глава 2']);
    expect(book.slice(ch[0].at, ch[0].at + 7)).toBe('Глава 1');
    expect(book.slice(ch[1].at, ch[1].at + 7)).toBe('Глава 2');
  });

  it('главы от парсера важнее распознанных', async () => {
    const h = await mount();
    const given = [{title: 'От парсера', at: 5}, {title: 'Вторая', at: 40}];
    await act(async () => { await h.result.current.addBook('Книга', book, given); });
    expect(h.result.current.chapters.map(c => c.title)).toEqual(['От парсера', 'Вторая']);
  });

  it('переживает перезапуск и не пересчитывается заново', async () => {
    const h = await mount();
    await act(async () => { await h.result.current.addBook('Книга', book); });
    h.unmount();

    const again = await mount();
    expect(again.result.current.chapters.map(c => c.title)).toEqual(['Глава 1', 'Глава 2']);
    expect(again.result.current.current.toc).toBe(1);   // флаг «уже считали» на месте
  });

  it('главы за пределами текста подрезаются, мусорные выбрасываются', async () => {
    const h = await mount();
    const junk = [
      {title: 'Нормальная', at: 3},
      {title: '', at: 10},                 // без названия — выбросить
      {title: 'За концом', at: 99999},     // подрезать по длине
      {title: 'Отрицательная', at: -5}
    ];
    await act(async () => { await h.result.current.addBook('Книга', book, junk); });
    const ch = h.result.current.chapters;
    expect(ch.map(c => c.title)).not.toContain('');
    for (const c of ch) {
      expect(c.at).toBeGreaterThanOrEqual(0);
      expect(c.at).toBeLessThan(book.length);
    }
    // отсортированы по возрастанию смещения
    for (let i = 1; i < ch.length; i++) expect(ch[i].at).toBeGreaterThan(ch[i - 1].at);
  });

  it('переключение книги подставляет её оглавление', async () => {
    const h = await mount();
    await act(async () => { await h.result.current.addBook('Первая', book); });
    const first = h.result.current.current.id;
    await act(async () => { await h.result.current.addBook('Вторая', 'Просто текст без глав вообще.'); });
    expect(h.result.current.chapters).toEqual([]);

    await act(async () => { await h.result.current.openBook(first); });
    expect(h.result.current.chapters.map(c => c.title)).toEqual(['Глава 1', 'Глава 2']);
  });

  it('удаление книги уносит и её оглавление', async () => {
    const h = await mount();
    await act(async () => { await h.result.current.addBook('Книга', book); });
    const id = h.result.current.current.id;
    await act(async () => { await h.result.current.deleteBook(id); });
    expect(h.result.current.chapters).toEqual([]);
    expect(localStorage.getItem('scroll.book.' + id + '.toc')).toBeNull();
  });
});

describe('оглавление и подрезка текста', () => {
  // Парсер считает смещения по своему тексту, стор перед сохранением делает
  // trim(). Без поправки на ведущие пробелы всё оглавление съезжает.
  it('ведущие пробелы не сдвигают главы от парсера', async () => {
    const body = '\n\n\n   Начало книги.\n\nГлава 1\n\nТело.';
    const lead = body.length - body.trimStart().length;
    const at = body.indexOf('Глава 1');

    const h = await mount();
    await act(async () => {
      await h.result.current.addBook('Книга', body, [{title: 'Глава 1', at}]);
    });

    const saved = h.result.current.text;
    const ch = h.result.current.chapters;
    expect(ch).toHaveLength(1);
    expect(ch[0].at).toBe(at - lead);
    expect(saved.slice(ch[0].at, ch[0].at + 7)).toBe('Глава 1');
  });
});

/* ===== картинки =====
   Стор держит их той же координатой, что и курсор: смещением в символах.
   Сами файлы лежат отдельно и читаются по одному — здесь проверяется и то,
   и другое, включая случай, когда картинка не легла. */

const TEXT_P = 'Раз, два.\n\nТри, четыре.\n\nПять, шесть.';
const DATA = 'AAAAAAAAAAAA';                       // содержимое парсер уже проверил
const png = at => ({at, type: 'image/png', data: DATA});

const addWith = async (h, text, images) => {
  let id;
  await act(async () => {id = await h.result.current.addBook('Книга', text, null, images);});
  return id;
};
const keys = () => Object.keys(localStorage);

describe('картинки', () => {
  it('кладутся в хранилище, а в сторе остаётся, где какая стоит', async () => {
    const h = await mount();
    const at = TEXT_P.indexOf('Три');
    await addWith(h, TEXT_P, [png(at)]);

    expect(h.result.current.pics).toEqual([{at, k: 0}]);
    let src;
    await act(async () => {src = await h.result.current.getPic(0);});
    expect(src).toBe('data:image/png;base64,' + DATA);
  });

  it('книга без картинок ничего лишнего в хранилище не пишет', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, []);
    expect(h.result.current.pics).toEqual([]);
    expect(keys().some(k => k.includes('.pic') || k.includes('.pix'))).toBe(false);
  });

  // Виньетка между сценами стоит в книге десятки раз — и это один файл.
  it('одинаковые данные на разных местах — один файл, две записи', async () => {
    const h = await mount();
    const a = TEXT_P.indexOf('Три');
    const b = TEXT_P.indexOf('Пять');
    await addWith(h, TEXT_P, [png(a), png(b)]);

    expect(h.result.current.pics).toEqual([{at: a, k: 0}, {at: b, k: 0}]);
    expect(keys().filter(k => k.includes('.pic.'))).toHaveLength(1);
  });

  it('смещение за концом текста подрезается по нему', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, [png(99999)]);
    expect(h.result.current.pics).toEqual([{at: TEXT_P.length - 1, k: 0}]);
  });

  // Парсер считал смещения по своему тексту, а хранится подрезанный — ровно
  // та же поправка, что у глав.
  it('ведущие пробелы не сдвигают картинку', async () => {
    const h = await mount();
    const lead = '\n\n   ';
    await addWith(h, lead + TEXT_P, [png(lead.length + TEXT_P.indexOf('Три'))]);
    expect(h.result.current.pics).toEqual([{at: TEXT_P.indexOf('Три'), k: 0}]);
  });

  it('картинка переживает перезапуск', async () => {
    const at = TEXT_P.indexOf('Три');
    let h = await mount();
    await addWith(h, TEXT_P, [png(at)]);
    h.unmount();

    h = await mount();
    expect(h.result.current.pics).toEqual([{at, k: 0}]);
    let src;
    await act(async () => {src = await h.result.current.getPic(0);});
    expect(src).toMatch(/^data:image\/png;base64,/);
  });

  it('испорченный список картинок книгу не ломает', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, [png(0)]);
    const id = h.result.current.current.id;
    h.unmount();

    localStorage.setItem('scroll.book.' + id + '.pix', 'не json');
    const again = await mount();
    expect(again.result.current.text).toBe(TEXT_P);
    expect(again.result.current.pics).toEqual([]);
  });

  it('мусор в списке отбрасывается, а годные записи остаются', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, [png(3)]);
    const id = h.result.current.current.id;
    h.unmount();

    localStorage.setItem('scroll.book.' + id + '.pix',
      JSON.stringify([{at: 3, k: 0}, {at: 5}, {at: 5, k: -1}, null, {at: 'нет', k: 0}]));
    const again = await mount();
    expect(again.result.current.pics).toEqual([{at: 0, k: 0}, {at: 3, k: 0}]);
  });

  it('удаление книги уносит и её картинки', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, [png(0)]);
    const id = h.result.current.current.id;
    expect(keys().filter(k => k.includes(id + '.pic'))).not.toHaveLength(0);

    await act(async () => {await h.result.current.deleteBook(id);});
    expect(keys().filter(k => k.includes(id + '.pic'))).toHaveLength(0);
    expect(keys().filter(k => k.includes(id + '.pix'))).toHaveLength(0);
    expect(h.result.current.pics).toEqual([]);
  });

  it('переключение книг меняет и список картинок', async () => {
    const h = await mount();
    const first = await addWith(h, TEXT_P, [png(0)]);
    await addWith(h, 'Другая книга без картинок совсем.', []);
    expect(h.result.current.pics).toEqual([]);

    await act(async () => {await h.result.current.openBook(first);});
    expect(h.result.current.pics).toEqual([{at: 0, k: 0}]);
  });

  // Текст важнее иллюстрации: место кончилось — книга всё равно должна лечь.
  it('картинка не влезла — книга всё равно сохраняется', async () => {
    const h = await mount();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (String(k).includes('.pic.')) throw new DOMException('quota', 'QuotaExceededError');
      return real.call(this, k, v);
    });

    const id = await addWith(h, TEXT_P, [png(0)]);
    expect(id).not.toBeNull();
    expect(h.result.current.text).toBe(TEXT_P);
    expect(h.result.current.pics).toEqual([]);
    expect(h.result.current.error).toBeNull();
  });

  it('getPic на пропавшем файле отдаёт пустую строку, а не бросает', async () => {
    const h = await mount();
    await addWith(h, TEXT_P, [png(0)]);
    let src;
    await act(async () => {src = await h.result.current.getPic(7);});
    expect(src).toBe('');
  });

  it('getPic без открытой книги ничего не читает', async () => {
    const h = await mount();
    let src;
    await act(async () => {src = await h.result.current.getPic(0);});
    expect(src).toBe('');
  });
});
