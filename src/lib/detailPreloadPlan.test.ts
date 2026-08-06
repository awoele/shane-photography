import assert from 'node:assert/strict';
import test from 'node:test';

import { createDetailImagePreloadLinks } from './detailPreloadPlan';

const photo = (src: string, thumbnail: string) => ({
  src,
  thumbnail,
});

test('createDetailImagePreloadLinks preloads only the current full image', () => {
  const links = createDetailImagePreloadLinks({
    nextPhoto: photo('/photos/three.jpg', '/thumbs/three.jpg'),
    photo: photo('/photos/two.jpg', '/thumbs/two.jpg'),
    previousPhoto: photo('/photos/one.jpg', '/thumbs/one.jpg'),
  });

  assert.deepEqual(links, [
    { href: '/photos/two.jpg', rel: 'preload' },
    { href: '/thumbs/two.jpg', rel: 'prefetch' },
    { href: '/thumbs/one.jpg', rel: 'prefetch' },
    { href: '/thumbs/three.jpg', rel: 'prefetch' },
  ]);
});

test('createDetailImagePreloadLinks does not duplicate matching sources', () => {
  const links = createDetailImagePreloadLinks({
    nextPhoto: photo('/photos/two.jpg', '/photos/two.jpg'),
    photo: photo('/photos/two.jpg', '/photos/two.jpg'),
    previousPhoto: null,
  });

  assert.deepEqual(links, [{ href: '/photos/two.jpg', rel: 'preload' }]);
});
