import {describe, it, expect} from 'vitest';
import {APP_NAMES, SKINS} from './skins.js';

// Имена «приложений» — свои. Чужой корень с одной ошибкой («Telegran»)
// Google Play считает подражанием, и на глаз его легко вернуть обратно:
// «TikTak» выглядит как шутка, а не как нарушение.
// Корни и их «опечатки»: старое «Whhatsapp» не содержит «whats», а «Tvitter» — «twit».
const FOREIGN = ['gram', 'tele', 'whats', 'atsap', 'messeng', 'senger', 'insta', 'tok', 'tik', 'tube', 'you',
  'yuo', 'snap', 'tweet', 'twit', 'tvit', 'itter', 'face', 'viber', 'vk'];

describe('имена «приложений»', () => {
  const names = Object.values(APP_NAMES);

  it('без чужих корней', () => {
    for (const name of names) {
      for (const root of FOREIGN) expect(name.toLowerCase(), name).not.toContain(root);
    }
  });

  it('все разные и помещаются под плиткой', () => {
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(names.length);
    for (const name of names) expect(name.length, name).toBeLessThanOrEqual(9);
  });

  it('мессенджер в шапке называется так же, как на плитке', () => {
    for (const id of Object.keys(SKINS)) expect(SKINS[id].name).toBe(APP_NAMES[id]);
  });
});
