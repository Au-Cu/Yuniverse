'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ANIMATIONS,
  vectorToDirectionIndex,
  directionToCell,
  correctedLookColumn,
  horizontalDirection,
  reachableTargetCenterX
} = require('../src/renderer/pet-core');

test('every standard animation has one duration per frame', () => {
  for (const [name, animation] of Object.entries(ANIMATIONS)) {
    assert.equal(animation.durations.length, animation.frames, name);
    assert.ok(animation.durations.every((duration) => duration > 0), name);
  }
});

test('only the retained actions are exposed', () => {
  assert.deepEqual(Object.keys(ANIMATIONS), ['idle', 'walking', 'waving', 'sleeping']);
});

test('cursor vectors map clockwise into sixteen genuine turn directions', () => {
  assert.equal(vectorToDirectionIndex(0, -1), 0);
  assert.equal(vectorToDirectionIndex(1, -1), 2);
  assert.equal(vectorToDirectionIndex(1, 0), 4);
  assert.equal(vectorToDirectionIndex(1, 1), 6);
  assert.equal(vectorToDirectionIndex(0, 1), 8);
  assert.equal(vectorToDirectionIndex(-1, 1), 10);
  assert.equal(vectorToDirectionIndex(-1, 0), 12);
  assert.equal(vectorToDirectionIndex(-1, -1), 14);
  assert.equal(vectorToDirectionIndex(0, 0), null);
  assert.equal(vectorToDirectionIndex(Number.NaN, 1), null);
});

test('direction indices address the two original look rows', () => {
  assert.deepEqual(directionToCell(0), { row: 9, column: 0 });
  assert.deepEqual(directionToCell(7), { row: 9, column: 7 });
  assert.deepEqual(directionToCell(8), { row: 10, column: 0 });
  assert.deepEqual(directionToCell(15), { row: 10, column: 7 });
  assert.equal(directionToCell(-1), null);
  assert.equal(directionToCell(16), null);
  assert.equal(directionToCell(null), null);
  assert.equal(directionToCell('0'), null);
});

test('the seven upper directions address one continuous corrected strip', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 13, 14, 15].map(correctedLookColumn),
    [0, 1, 2, 3, 4, 5, 6]
  );
  assert.equal(correctedLookColumn(4), null);
  assert.equal(correctedLookColumn(12), null);
  assert.equal(correctedLookColumn(null), null);
});

test('legacy cat upper turns reverse screen-left and screen-right without changing up', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 13, 14, 15].map((index) => correctedLookColumn(index, true)),
    [0, 6, 5, 4, 3, 2, 1]
  );
});

test('horizontal walking stops inside the alignment tolerance', () => {
  assert.equal(horizontalDirection(100, 89, 10), -1);
  assert.equal(horizontalDirection(100, 90, 10), 0);
  assert.equal(horizontalDirection(100, 110, 10), 0);
  assert.equal(horizontalDirection(100, 111, 10), 1);
});

test('cursor target is clamped by the pet collision width at screen edges', () => {
  const bounds = { x: 0, y: 0, width: 144, height: 156 };
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.equal(reachableTargetCenterX(-40, bounds, workArea), 72);
  assert.equal(reachableTargetCenterX(15, bounds, workArea), 72);
  assert.equal(reachableTargetCenterX(960, bounds, workArea), 960);
  assert.equal(reachableTargetCenterX(1919, bounds, workArea), 1848);
});

test('edge clamp supports monitors with negative desktop coordinates', () => {
  const bounds = { x: -1920, y: 0, width: 90, height: 94 };
  const workArea = { x: -1920, y: 0, width: 1920, height: 1040 };
  assert.equal(reachableTargetCenterX(-2500, bounds, workArea), -1875);
  assert.equal(reachableTargetCenterX(10, bounds, workArea), -45);
});
