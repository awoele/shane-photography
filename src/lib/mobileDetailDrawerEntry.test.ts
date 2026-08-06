import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMobileDetailDrawerButtonBottom,
  shouldShowMobileDetailDrawerButton,
} from './mobileDetailDrawerEntry';

test('shouldShowMobileDetailDrawerButton hides the entry while the drawer is open', () => {
  assert.equal(shouldShowMobileDetailDrawerButton(false), true);
  assert.equal(shouldShowMobileDetailDrawerButton(true), false);
});

test('getMobileDetailDrawerButtonBottom keeps the entry above the filmstrip', () => {
  assert.equal(getMobileDetailDrawerButtonBottom(72), 86);
  assert.equal(getMobileDetailDrawerButtonBottom(72, 10), 82);
});
