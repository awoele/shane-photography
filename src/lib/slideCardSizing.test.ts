import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlideCardAspectStyle,
  getSlideFlipCardAspectStyle,
} from './slideCardSizing';

test('getSlideFlipCardAspectStyle rotates wide mobile portrait cards into portrait ratio', () => {
  const style = getSlideFlipCardAspectStyle({
    height: 3000,
    width: 4000,
  });

  assert.equal(style['--slide-flip-aspect-mobile-portrait'], '0.75');
  assert.match(style['--slide-flip-card-width-mobile-portrait'], /92\.00vw/);
});

test('getSlideFlipCardAspectStyle keeps portrait photos in their original ratio', () => {
  const style = getSlideFlipCardAspectStyle({
    height: 4000,
    width: 3000,
  });

  assert.equal(style['--slide-flip-aspect-mobile-portrait'], '0.75');
});

test('getSlideFlipCardAspectStyle makes desktop flip cards larger than base slide cards', () => {
  const base = getSlideCardAspectStyle({
    height: 3000,
    width: 4000,
  });
  const flipped = getSlideFlipCardAspectStyle({
    height: 3000,
    width: 4000,
  });
  const getMaxPixelWidth = (value: string) => {
    const match = value.match(/,\s*([0-9.]+)px\)$/);

    return Number.parseFloat(match?.[1] ?? '0');
  };

  assert.ok(
    getMaxPixelWidth(flipped['--slide-flip-card-width-default']) >
      getMaxPixelWidth(base['--slide-card-width-default']),
  );
});

test('getSlideCardAspectStyle keeps inactive slide cards at the original size', () => {
  const style = getSlideCardAspectStyle({
    height: 3000,
    width: 3000,
  });

  assert.equal(
    style['--slide-card-width-default'],
    'clamp(250.00px, 57.00vh, 520.00px)',
  );
  assert.equal(
    style['--slide-card-width-desktop-portrait'],
    'min(56.00vh, 680.00px)',
  );
  assert.equal(
    style['--slide-card-width-landscape'],
    'min(72.00svh, 360.00px)',
  );
  assert.equal(
    style['--slide-card-width-mobile-portrait'],
    'min(108.00vw, 420.00px)',
  );
});

test('getSlideCardAspectStyle gives the active slide a larger layout box', () => {
  const style = getSlideCardAspectStyle({
    height: 3000,
    width: 3000,
  });

  assert.equal(
    style['--slide-card-width-active-default'],
    'clamp(295.00px, 67.00vh, 610.00px)',
  );
  assert.equal(
    style['--slide-card-width-active-landscape'],
    'min(84.00svh, 430.00px)',
  );
  assert.equal(
    style['--slide-card-width-active-mobile-portrait'],
    'min(124.00vw, 480.00px)',
  );
});

test('getSlideFlipCardAspectStyle gives landscape flip cards a larger height budget', () => {
  const style = getSlideFlipCardAspectStyle({
    height: 3000,
    width: 4000,
  });

  assert.equal(
    style['--slide-flip-card-height-landscape'],
    'min(92svh, 520px)',
  );
});
