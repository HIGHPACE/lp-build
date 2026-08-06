const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertBrowserslist, resolveOptions } = require('..');

const withCwd = (files, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-build-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('browserslist があれば通る', () => {
  withCwd(
    { 'package.json': JSON.stringify({ name: 'x', browserslist: ['last 2 versions'] }) },
    () => assert.doesNotThrow(() => assertBrowserslist())
  );
});

test('.browserslistrc があれば通る', () => {
  withCwd(
    { 'package.json': JSON.stringify({ name: 'x' }), '.browserslistrc': 'last 2 versions\n' },
    () => assert.doesNotThrow(() => assertBrowserslist())
  );
});

test('browserslist が無ければエラーになる', () => {
  withCwd({ 'package.json': JSON.stringify({ name: 'x' }) }, () => {
    assert.throws(() => assertBrowserslist(), /browserslist/);
  });
});

test('browserslist が空配列でもエラーになる', () => {
  withCwd({ 'package.json': JSON.stringify({ name: 'x', browserslist: [] }) }, () => {
    assert.throws(() => assertBrowserslist(), /browserslist/);
  });
});

test('images の既定は flat', () => {
  assert.strictEqual(resolveOptions().images, 'flat');
  assert.strictEqual(resolveOptions({}).images, 'flat');
});

test('images は flat と perPage のみ許可される', () => {
  assert.strictEqual(resolveOptions({ images: 'perPage' }).images, 'perPage');
  assert.throws(() => resolveOptions({ images: 'per-page' }), /images/);
  assert.throws(() => resolveOptions({ images: 'nested' }), /images/);
});

test('exclude の既定は空配列', () => {
  assert.deepStrictEqual(resolveOptions().exclude, []);
  assert.deepStrictEqual(resolveOptions({}).exclude, []);
});

test('exclude は配列のみ許可される', () => {
  assert.deepStrictEqual(resolveOptions({ exclude: ['納品/**'] }).exclude, ['納品/**']);
  assert.throws(() => resolveOptions({ exclude: '納品/**' }), /exclude/);
  assert.throws(() => resolveOptions({ exclude: 42 }), /exclude/);
});
