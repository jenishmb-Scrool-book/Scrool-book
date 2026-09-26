import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import Hit, {HitProvider} from './Hit.jsx';

// Маркер на найденном слове. Кусок подсвечивается, только если находка лежит
// в нём: у соседних карточек то же слово может встречаться, но привели не к ним.

const show = (hit, props) => render(
  <HitProvider value={hit}><p><Hit {...props} /></p></HitProvider>
).container.querySelector('p');

describe('<Hit>', () => {
  const card = {text: 'Пришёл Ёжик и ушёл ёжик.', at: 1000, end: 1026};
  // Книга вокруг куска: тысяча знаков до него, сам кусок, хвост после.
  const src = 'х'.repeat(1000) + 'Пришёл Ёжик и ушёл ёжик.' + ' хвост';
  const first = 1000 + 'Пришёл '.length;
  const second = 1000 + 'Пришёл Ёжик и ушёл '.length;

  it('без поиска — просто текст', () => {
    const p = show(null, card);
    expect(p.textContent).toBe(card.text);
    expect(p.querySelector('mark')).toBeNull();
  });

  it('маркер горит на том вхождении, к которому привёл поиск, — и только на нём', () => {
    // «он» в куске на 600 знаков — десяток совпадений, и десять пятен не
    // говорят «вот оно». Какое по счёту — считается по книге.
    const a = show({q: 'ежик', at: first, src}, card);
    expect([...a.querySelectorAll('mark.hit')].map(m => m.textContent)).toEqual(['Ёжик']);
    expect(a.textContent).toBe(card.text);
    const b = show({q: 'ежик', at: second, src}, card);
    const marks = [...b.querySelectorAll('mark.hit')];
    expect(marks.map(m => m.textContent)).toEqual(['ёжик']);
    expect(b.textContent).toBe(card.text);
  });

  it('без текста книги — первое вхождение', () => {
    const p = show({q: 'ежик', at: 1007}, card);
    expect([...p.querySelectorAll('mark.hit')].map(m => m.textContent)).toEqual(['Ёжик']);
  });

  it('находка в соседнем куске — здесь ничего не подсвечено', () => {
    expect(show({q: 'ежик', at: 999}, card).querySelector('mark')).toBeNull();
    expect(show({q: 'ежик', at: 1026}, card).querySelector('mark')).toBeNull();
  });

  it('пробел запроса совпадает со схлопнутым переводом строки', () => {
    // В книге между словами был перевод строки, а кусок показывает пробел.
    const p = show({q: 'ёжик и', at: 1007}, card);
    expect(p.querySelector('mark.hit').textContent).toBe('Ёжик и');
  });

  it('слова в куске нет (запрос не тот) — текст без изменений', () => {
    expect(show({q: 'заяц', at: 1007}, card).textContent).toBe(card.text);
  });
});
