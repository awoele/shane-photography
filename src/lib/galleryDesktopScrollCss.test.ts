import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const globalCssPath = resolve(process.cwd(), 'src/styles/global.css');

test('desktop proof photo cards disable content-visibility for wheel scrolling', () => {
  const globalCss = readFileSync(globalCssPath, 'utf8');
  const desktopOverride = globalCss.match(
    /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*{(?<body>[\s\S]*?)\n}/,
  )?.groups?.body;

  assert.ok(desktopOverride);
  assert.match(desktopOverride, /\.proof-photo-card\s*{/);
  assert.match(desktopOverride, /content-visibility:\s*visible;/);
});

test('proof photo cards keep images paintable while browser load events settle', () => {
  const globalCss = readFileSync(globalCssPath, 'utf8');
  const baseRule = globalCss.match(/\.proof-photo-card\s*{(?<body>[\s\S]*?)\n}/)
    ?.groups?.body;

  assert.ok(baseRule);
  assert.match(baseRule, /content-visibility:\s*visible;/);

  const indexPage = readFileSync(
    resolve(process.cwd(), 'src/pages/index.tsx'),
    'utf8',
  );

  assert.doesNotMatch(
    indexPage,
    /loaded\s*\?\s*'opacity-100 blur-0'\s*:\s*'[^']*opacity-0/,
  );
});

test('gallery page clips horizontal overflow without becoming a wheel target', () => {
  const globalCss = readFileSync(globalCssPath, 'utf8');
  const galleryPageRule = globalCss.match(
    /\.gallery-page\s*{(?<body>[\s\S]*?)\n}/,
  )?.groups?.body;

  assert.ok(galleryPageRule);
  assert.match(galleryPageRule, /overflow-x:\s*clip;/);
  assert.match(galleryPageRule, /overflow-y:\s*visible;/);

  const indexPage = readFileSync(
    resolve(process.cwd(), 'src/pages/index.tsx'),
    'utf8',
  );

  assert.doesNotMatch(indexPage, /gallery-page[^"]*overflow-x-hidden/);
});
