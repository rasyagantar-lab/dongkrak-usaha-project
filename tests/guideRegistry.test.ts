// Run: npm test
// The guide only helps if every marked element has words behind it, and the words stay
// short enough to read in a glance. Pinned here so a new tab or button cannot ship
// without its explanation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, guideIdFrom, NAV_IDS } from '../src/guide/guideRegistry';

test('every bottom-nav tab has a guide entry', () => {
  for (const id of NAV_IDS) assert.ok(GUIDE['nav.' + id], 'missing nav.' + id);
});

test('every canvas node has a guide entry', () => {
  for (const n of ['source', 'plan', 'strategy', 'keyword', 'content', 'audit', 'handoff', 'image', 'sink']) assert.ok(GUIDE['node.' + n], 'missing node.' + n);
});

test('entries are short: judul, fungsi <= 220 chars, fakta <= 200 chars', () => {
  for (const [id, e] of Object.entries(GUIDE)) {
    assert.ok(e.judul && e.judul.length <= 40, id + ' judul');
    assert.ok(e.fungsi && e.fungsi.length <= 220, id + ' fungsi too long: ' + e.fungsi.length);
    if (e.fakta) assert.ok(e.fakta.length <= 200, id + ' fakta too long: ' + e.fakta.length);
  }
  assert.ok(Object.keys(GUIDE).length >= 40, 'registry should cover the app: ' + Object.keys(GUIDE).length);
});

test('guideIdFrom reads data-guide first, then maps a canvas node to node.<id>', () => {
  assert.equal(guideIdFrom({ guide: 'publish.isi-form' }), 'publish.isi-form');
  assert.equal(guideIdFrom({ node: 'audit' }), 'node.audit');
  assert.equal(guideIdFrom({ guide: 'x', node: 'audit' }), 'x');
  assert.equal(guideIdFrom({}), null);
});
