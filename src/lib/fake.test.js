import {describe, it, expect} from 'vitest';
import {NAMES, contacts, msgTime, unread} from './fake.js';

describe('contacts()', () => {
  it('отдаёт запрошенное количество', () => {
    expect(contacts(5)).toHaveLength(5);
    expect(contacts(0)).toHaveLength(0);
  });

  // Это главное свойство всей бутафории: числа, меняющиеся при перерендере,
  // читаются не как жизнь, а как поломка.
  it('детерминированы — два вызова дают одно и то же', () => {
    expect(contacts(6)).toEqual(contacts(6));
  });

  it('имена не повторяются, пока хватает списка', () => {
    const names = contacts(NAMES.length).map(c => c.name);
    expect(new Set(names).size).toBe(NAMES.length);
  });

  it('список кончился — имена идут по кругу, без падения', () => {
    const many = contacts(NAMES.length + 3);
    expect(many).toHaveLength(NAMES.length + 3);
    expect(many[NAMES.length].name).toBe(many[0].name);
  });

  it('каждый чат несёт всё, что нужно строке списка', () => {
    for (const c of contacts(6)) {
      expect(typeof c.id).toBe('string');
      expect(c.name).toBeTruthy();
      expect(Number.isFinite(c.seed)).toBe(true);
      expect(c.stub).toBeGreaterThanOrEqual(0);
      expect(c.stub).toBeLessThan(3);          // ровно три заготовленных реплики
      expect(c.time).toMatch(/^\d{2}:\d{2}$/);
      expect(c.unread).toBeGreaterThanOrEqual(0);
    }
  });

  it('id уникальны — иначе React перепутает строки при перерисовке', () => {
    const ids = contacts(8).map(c => c.id);
    expect(new Set(ids).size).toBe(8);
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

describe('unread()', () => {
  it('никогда не отрицательный и не дробный', () => {
    for (let i = 0; i < 30; i++) {
      expect(unread(i)).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(unread(i))).toBe(true);
    }
  });

  it('детерминирован', () => {
    expect(unread(7)).toBe(unread(7));
  });
});
