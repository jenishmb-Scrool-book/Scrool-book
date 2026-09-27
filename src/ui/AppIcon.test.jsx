import React from 'react';
import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import AppIcon, {GLYPHS} from './AppIcon.jsx';
import {APPS} from '../screens/Home.jsx';

// Фигуры, которые повторяли чужие логотипы: самолётик на голубом круге,
// трубка и молния в пузыре, контурный фотоаппарат, нота, красная плашка с
// треугольником, птица. Вернуть любую из них — вернуть и риск снятия с Play.
const BORROWED = ['plane', 'phone', 'bolt', 'camera', 'note', 'play', 'snap', 'bird'];

describe('значки «приложений»', () => {
  it('у каждой плитки свой нарисованный значок, без подмены запасным', () => {
    const names = APPS.map(([glyph]) => glyph);
    for (const name of names) expect(GLYPHS, name).toHaveProperty(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ни одной фигуры с чужого логотипа', () => {
    for (const [glyph] of APPS) expect(BORROWED, glyph).not.toContain(glyph);
    for (const name of BORROWED) expect(GLYPHS, name).not.toHaveProperty(name);
  });

  it('рисуется в плитке цвета приложения', () => {
    const {container} = render(<AppIcon name="tv" background="red" />);
    expect(container.querySelector('b').style.background).toBe('red');
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
  });
});
