import {describe, it, expect} from 'vitest';
import {mailto} from './feedback.js';
import {FEEDBACK_EMAIL} from './name.js';

describe('mailto', () => {
  const href = mailto('Scroll Book 1.0.2 — отзыв', 'Что случилось:', 'Android 14\nbook 12 chars');
  const url = new URL(href);

  it('адресовано разработчику', () => {
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(FEEDBACK_EMAIL);
  });

  // Почтовые приложения разбирают ссылку по-разному, но «+» вместо пробела
  // и голые переводы строк ломают её почти везде — только %20 и %0A.
  it('тема и тело закодированы целиком', () => {
    const query = href.split('?')[1];
    expect(query).not.toMatch(/[\s+]/);
    expect(url.searchParams.get('subject')).toBe('Scroll Book 1.0.2 — отзыв');
  });

  it('сведения — в теле, под чертой, после места для своих слов', () => {
    const body = url.searchParams.get('body');
    expect(body.startsWith('Что случилось:\n')).toBe(true);
    expect(body.endsWith('—\nAndroid 14\nbook 12 chars')).toBe(true);
  });
});
