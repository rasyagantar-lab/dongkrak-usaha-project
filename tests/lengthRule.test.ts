// Run: npx tsx tests/lengthRule.test.ts
// The parser and the measurer are the single source of truth for "how long should the
// description be" -- server and UI both import them -- so their behaviour is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLengthRule, measure, inRange, describe, DEFAULT_LENGTH } from '../src/lib/lengthRule';

test('empty instruction falls back to the supervisor default', () => {
  const r = parseLengthRule('');
  assert.deepEqual({ unit: r.unit, min: r.min, max: r.max, source: r.source }, { unit: 'kata', min: 500, max: 1000, source: 'default' });
  assert.equal(r.clamped, undefined);
});

test('instruction without a length keeps the default', () => {
  const r = parseLengthRule('Meningkatkan penjualan dan visibilitas lokal');
  assert.equal(r.source, 'default');
  assert.equal(r.min, DEFAULT_LENGTH.min);
});

test('a range in kalimat is honoured but clamped to the sentence ceiling, and says so', () => {
  const r = parseLengthRule('format SEO 500 - 1000 kalimat');
  assert.equal(r.unit, 'kalimat');
  assert.equal(r.source, 'operator');
  assert.deepEqual(r.requested, { unit: 'kalimat', min: 500, max: 1000 });
  assert.equal(r.max, 120);
  assert.ok(r.min >= 5 && r.min < r.max);
  assert.match(r.clamped || '', /500–1.000 kalimat/);
  assert.match(r.clamped || '', /plafon/);
});

test('a range in kata inside the limits is used as-is', () => {
  const r = parseLengthRule('tulis 950–1000 kata, tonjolkan garansi');
  assert.deepEqual({ unit: r.unit, min: r.min, max: r.max, target: r.target, source: r.source }, { unit: 'kata', min: 950, max: 1000, target: 975, source: 'operator' });
  assert.equal(r.clamped, undefined);
});

test('"sekitar N" becomes a +-10% window around N', () => {
  const r = parseLengthRule('sekitar 700 kata');
  assert.deepEqual({ min: r.min, max: r.max, target: r.target }, { min: 630, max: 770, target: 700 });
});

test('"maksimal N karakter" sets the ceiling in characters', () => {
  const r = parseLengthRule('maksimal 2000 karakter');
  assert.equal(r.unit, 'karakter');
  assert.equal(r.max, 2000);
  assert.ok(r.min >= 500 && r.min < 2000);
  assert.ok(r.target > r.min && r.target <= r.max);
});

test('"minimal N kata" raises the floor and keeps a sensible max', () => {
  const r = parseLengthRule('minimal 500 kata');
  assert.equal(r.min, 500);
  assert.ok(r.max > 500 && r.max <= 1500);
});

test('a bare number with a unit is a +-10% window', () => {
  const r = parseLengthRule('1000 kata');
  assert.deepEqual({ min: r.min, max: r.max, target: r.target }, { min: 900, max: 1100, target: 1000 });
});

test('"A sampai B kalimat" is a range', () => {
  const r = parseLengthRule('40 sampai 60 kalimat');
  assert.deepEqual({ unit: r.unit, min: r.min, max: r.max }, { unit: 'kalimat', min: 40, max: 60 });
  assert.equal(r.clamped, undefined);
});

test('6000 kata is clamped to the word ceiling with an explanation', () => {
  const r = parseLengthRule('6000 kata');
  assert.equal(r.max, 1500);
  assert.ok(r.min < r.max && r.min >= 100);
  assert.match(r.clamped || '', /6\.000 kata/);
});

test('numbers without a unit (years, brand names) do not count as a length', () => {
  const r = parseLengthRule('Sebut IKEA 2024 dan Informa 3 kali');
  assert.equal(r.source, 'default');
});

test('thousand separators and the k suffix are understood', () => {
  assert.equal(parseLengthRule('2.000 karakter').target, 2000);
  assert.equal(parseLengthRule('1k kata').target, 1000);
});

test('measure counts words, sentences (abbreviations excluded) and characters', () => {
  const m = measure('Halo dunia. Ini kalimat kedua! Harga Rp. 50.000 per unit.');
  assert.equal(m.kata, 10);
  assert.equal(m.kalimat, 3);
  assert.equal(m.karakter, 'Halo dunia. Ini kalimat kedua! Harga Rp. 50.000 per unit.'.length);
});

test('measure treats a heading on its own line as a sentence', () => {
  assert.equal(measure('Judul Bagian\nKalimat satu. Kalimat dua.').kalimat, 3);
  assert.deepEqual(measure(''), { kata: 0, kalimat: 0, karakter: 0 });
});

test('inRange checks the unit the rule is expressed in', () => {
  const words = parseLengthRule('');
  assert.equal(inRange(words, { kata: 589, kalimat: 59, karakter: 4000 }), true);
  assert.equal(inRange(words, { kata: 493, kalimat: 59, karakter: 4000 }), false);
  const sentences = parseLengthRule('40 sampai 60 kalimat');
  assert.equal(inRange(sentences, { kata: 2000, kalimat: 45, karakter: 9000 }), true);
});

test('describe names the range, the unit and where the rule came from', () => {
  assert.equal(describe(parseLengthRule('')), '500–1.000 kata (default pembimbing)');
  assert.equal(describe(parseLengthRule('40 sampai 60 kalimat')), '40–60 kalimat (instruksi operator)');
});
