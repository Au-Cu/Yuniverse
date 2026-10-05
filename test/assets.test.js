'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const file of ['just-big-cat.png', 'just-alien-cat.png', 'just-minbird.png']) {
  test(`${file} is a 1536x2288 PNG`, () => {
    const buffer = fs.readFileSync(path.join(__dirname, '..', 'assets', file));
    assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(buffer.readUInt32BE(16), 1536);
    assert.equal(buffer.readUInt32BE(20), 2288);
  });
}

for (const file of ['just-big-look-up.png', 'just-alien-look-up.png', 'just-minbird-look-up.png']) {
  test(`${file} contains seven corrected 192x208 upper-look frames`, () => {
    const buffer = fs.readFileSync(path.join(__dirname, '..', 'assets', file));
    assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(buffer.readUInt32BE(16), 192 * 7);
    assert.equal(buffer.readUInt32BE(20), 208);
  });
}


test('just-minbird-rest.png is a 192x208 PNG', () => {
  const buffer = fs.readFileSync(path.join(__dirname, '..', 'assets', 'just-minbird-rest.png'));
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.readUInt32BE(16), 192);
  assert.equal(buffer.readUInt32BE(20), 208);
});
