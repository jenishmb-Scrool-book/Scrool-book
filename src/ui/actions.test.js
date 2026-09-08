import {afterEach, describe, expect, it, vi} from 'vitest';
import {LOCAL, TAB, run} from './actions.js';

// Прокручиваемое тело экрана. `scrollTo` в jsdom не реализован, поэтому
// подменяем его сами и заодно смотрим, ЧТО именно попросили прокрутить.
function body({cards = []} = {}) {
  const box = document.createElement('div');
  box.className = 'body';
  for (const [i, top] of cards.entries()) {
    const el = document.createElement('div');
    el.dataset.i = String(i);
    Object.defineProperty(el, 'offsetTop', {value: top, configurable: true});
    box.appendChild(el);
  }
  box.scrollTo = vi.fn();
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.appendChild(box);
  document.body.appendChild(screen);
  return box;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('run()', () => {
  it('всё, что не местное действие, — это переход', () => {
    const go = vi.fn();
    run('toc', {go});
    run('library', {go});
    expect(go.mock.calls).toEqual([['toc'], ['library']]);
  });

  it('«top» и «here» никуда не уводят', () => {
    const go = vi.fn();
    const box = body({cards: [0, 400, 800]});
    for (const a of LOCAL) run(a, {go, boxRef: {current: box}, pos: 1});
    expect(go).not.toHaveBeenCalled();
  });

  it('«top» прокручивает к началу списка', () => {
    const box = body({cards: [0, 400]});
    run('top', {go: vi.fn(), boxRef: {current: box}});
    expect(box.scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
  });

  it('«here» прокручивает к карточке, на которой стоит курсор', () => {
    const box = body({cards: [0, 400, 800]});
    run('here', {go: vi.fn(), boxRef: {current: box}, pos: 2});
    expect(box.scrollTo).toHaveBeenCalledWith({top: 792, behavior: 'smooth'});
  });

  it('«here» без такой карточки молчит, а не роняет экран', () => {
    // Окно рендера показывает не всю книгу: карточки под курсором может не
    // быть в DOM, если человек ушёл прокруткой далеко вперёд.
    const box = body({cards: [0, 400]});
    expect(() => run('here', {go: vi.fn(), boxRef: {current: box}, pos: 99})).not.toThrow();
    expect(box.scrollTo).not.toHaveBeenCalled();
  });

  it('находит тело экрана сам, когда ref не передали', () => {
    const box = body({cards: [0, 400]});
    run('top', {go: vi.fn()});
    expect(box.scrollTo).toHaveBeenCalled();
  });

  it('пустое действие не делает ничего', () => {
    const go = vi.fn();
    run('', {go});
    run(undefined, {go});
    expect(go).not.toHaveBeenCalled();
  });

  it('без тела экрана местные действия не роняют', () => {
    expect(() => run('top', {go: vi.fn()})).not.toThrow();
    expect(() => run('here', {go: vi.fn(), pos: 0})).not.toThrow();
  });
});

describe('TAB', () => {
  it('вкладки разбирает экран, а не переход', () => {
    // `run` вкладку не знает: она значит «переключись внутри себя», и вести
    // её наружу было бы уходом с экрана вместо смены вкладки.
    expect(TAB).toBe('tab:');
    const go = vi.fn();
    run('tab:calls', {go});
    expect(go).toHaveBeenCalledWith('tab:calls');   // сюда такие не доходят
  });
});
