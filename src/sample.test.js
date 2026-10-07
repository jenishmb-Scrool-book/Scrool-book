import {describe, it, expect} from 'vitest';
import {sampleOf, loadSample} from './sample.js';
import {detect} from './lib/toc.js';
import {DICT} from './i18n.js';

// Оглавление у рассказа распознаётся из самого текста, как у вставленной
// книги, — и лишняя строка капсом или короткая реплика стала бы в нём главой.
describe.each([
  ['ru', 'Глава 1. Письмо', 'Глава 3. Свет'],
  ['en', 'Chapter 1. The Letter', 'Chapter 3. The Light']
])('рассказ-пример: %s', (lang, first, last) => {
  it('главы распознаются все и только они', async () => {
    const chapters = detect(await loadSample(lang));
    expect(chapters.map(c => c.title)).toEqual([first, expect.any(String), last]);
  });

  it('без остатков разметки и без CR', async () => {
    const text = await loadSample(lang);
    expect(text).not.toMatch(/\{\{|\}\}|\[\[|<\/?\w|__|''|&nbsp;|\r/);
  });

  it('начинается с названия, под которым ляжет в библиотеку', async () => {
    expect((await loadSample(lang)).split('\n')[0]).toBe(sampleOf(lang).title);
  });

  // Рассказ — своё, нейтральное: из-за этого ответ в анкете возрастного
  // рейтинга «в пакете нет содержимого с ограничениями» остаётся правдивым.
  // Тест не пускает обратно слова, ради которых анкету пришлось бы менять.
  it('без насилия, секса и грубых слов', async () => {
    const text = (await loadSample(lang)).toLowerCase();
    const bad = lang === 'ru'
      ? /убий|казн|кровь|труп|оружи|пытк|секс|голый|матер|бля|хуй|пизд/
      : /kill|murder|execut|blood|corpse|weapon|torture|sex|naked|fuck|shit/;
    expect(text).not.toMatch(bad);
  });

  // Подпись кнопки и текст связаны только словами: смени рассказ — кнопка
  // продолжит звать прежний.
  it('кнопка называет именно этот текст', () => {
    expect(DICT[lang]['lib.sample_hint']).toMatch(lang === 'ru' ? /три главы|трёх глав/ : /three chapters/);
  });
});
