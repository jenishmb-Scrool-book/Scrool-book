import {describe, it, expect} from 'vitest';
import {NAMES, contactAt, msgTime} from './fake.js';

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
