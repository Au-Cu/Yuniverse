'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, normalizeSettings } = require('../src/shared/settings');

test('smart follow is enabled by default', () => {
  assert.equal(DEFAULT_SETTINGS.smartFollow, true);
  assert.equal(normalizeSettings().smartFollow, true);
});

test('the former small size is the new original default', () => {
  assert.equal(DEFAULT_SETTINGS.scale, 0.75);
  assert.equal(normalizeSettings({ scale: 0.45 }).scale, 0.45);
  assert.equal(normalizeSettings({ scale: 1.05 }).scale, 1.05);
});

test('minbird is a valid pet selection', () => {
  assert.equal(normalizeSettings({ pet: 'minbird' }).pet, 'minbird');
});

test('legacy autoRoam preference migrates to smartFollow', () => {
  assert.equal(normalizeSettings({ autoRoam: false }).smartFollow, false);
  assert.equal(normalizeSettings({ autoRoam: true }).smartFollow, true);
});

test('new smartFollow preference takes priority over legacy data', () => {
  assert.equal(normalizeSettings({ smartFollow: false, autoRoam: true }).smartFollow, false);
});
