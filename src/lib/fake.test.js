import {describe, it, expect} from 'vitest';
import {GROUPS, NAMES, callAt, contactAt, groupAt, msgTime} from './fake.js';

describe('contactAt()', () => {
  // Это главное свойство всей бутафории: имя, меняющееся при перерендере,
  // читается не как жизнь, а как поломка.
  it('детерминирован — два вызова дают одно и то же', () => {
    expect(contactAt(5)).toEqual(contactAt(5));
    expect(contactAt(0)).toEqual(contactAt(0));
  });

  it('имена идут по кругу и не повторяются, пока хватает списка', () => {
    const names = Array.from({length: NAMES.length}, (unused, i) => contactAt(i).name);
    expect(new Set(names).size).toBe(NAMES.length);
    expect(contactAt(NAMES.length).name).toBe(contactAt(0).name);
  });

  it('несёт всё, что нужно строке списка', () => {
    for (let i = 0; i < 12; i++) {
      const c = contactAt(i);
      expect(typeof c.id).toBe('string');
      expect(c.name).toBeTruthy();
      expect(Number.isFinite(c.seed)).toBe(true);
    }
  });

  it('мусор на входе не роняет — отдаёт первого', () => {
    expect(contactAt(-3).name).toBe(NAMES[0]);
    expect(contactAt(NaN).name).toBe(NAMES[0]);
    expect(contactAt(undefined).name).toBe(NAMES[0]);
  });
});

describe('msgTime()', () => {
  it('формат ЧЧ:ММ с ведущим нулём', () => {
    expect(msgTime(0)).toMatch(/^\d{2}:\d{2}$/);
    expect(msgTime(0)).toBe('09:00');
  });

  it('время идёт вперёд от сообщения к сообщению', () => {
    expect(msgTime(1) > msgTime(0)).toBe(true);
    expect(msgTime(10) > msgTime(9)).toBe(true);
  });

  it('не вылезает за пределы суток даже на длинной книге', () => {
    for (const i of [0, 1, 500, 5000, 100000]) {
      const [h, m] = msgTime(i).split(':').map(Number);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(60);
    }
  });

  it('мусор на входе не роняет — отдаёт начало дня', () => {
    expect(msgTime(-5)).toBe('09:00');
    expect(msgTime(NaN)).toBe('09:00');
    expect(msgTime(undefined)).toBe('09:00');
  });
});

describe('groupAt()', () => {
  it('несёт имя группы и отправителя — без второго вкладка «Группы» копия «Чатов»', () => {
    const g = groupAt(3);
    expect(GROUPS).toContain(g.name);
    expect(NAMES).toContain(g.from);
    expect(g.from).toBe(contactAt(3).name);
    expect(typeof g.seed).toBe('number');
  });

  it('детерминирован и идёт по кругу', () => {
    expect(groupAt(2)).toEqual(groupAt(2));
    expect(groupAt(GROUPS.length).name).toBe(groupAt(0).name);
  });

  it('группа и отправитель меняются с разным шагом', () => {
    // Иначе за каждой группой всегда стоял бы один и тот же человек, и список
    // читался бы как восемь одинаковых строк.
    const pairs = new Set();
    for (let i = 0; i < 40; i++) pairs.add(groupAt(i).name + '/' + groupAt(i).from);
    expect(pairs.size).toBeGreaterThan(GROUPS.length);
  });

  it('мусор на входе не роняет', () => {
    for (const bad of [undefined, null, NaN, -5, 'что-то']) {
      expect(GROUPS).toContain(groupAt(bad).name);
    }
  });
});

describe('callAt()', () => {
  it('несёт всё, из чего состоит строка журнала', () => {
    const c = callAt(1);
    expect(NAMES).toContain(c.name);
    expect(['in', 'out', 'missed']).toContain(c.kind);
    expect(typeof c.video).toBe('boolean');
    expect(c.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('встречаются все три вида вызова', () => {
    // Журнал, где всё пропущено или не пропущено ничего, выглядит нарисованным.
    const kinds = new Set();
    for (let i = 0; i < 12; i++) kinds.add(callAt(i).kind);
    expect(kinds).toEqual(new Set(['in', 'out', 'missed']));
  });

  it('детерминирован', () => {
    expect(callAt(7)).toEqual(callAt(7));
  });

  it('мусор на входе не роняет', () => {
    for (const bad of [undefined, null, NaN, -3, {}]) {
      expect(NAMES).toContain(callAt(bad).name);
    }
  });
});
