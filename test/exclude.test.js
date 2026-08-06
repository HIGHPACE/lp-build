const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveEntries } = require('../lib/scss-targets');
const { scssSrcWithExcludes } = require('../lib/css');
const { scssWatchGlobs } = require('../lib/watch');

const withFixture = (files, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-exclude-'));
  for (const rel of files) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '');
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

test('scssSrcWithExcludes は否定パターンを足す', () => {
  assert.deepStrictEqual(scssSrcWithExcludes(['納品/**']), [
    './**/*.scss',
    '!./**/_*.scss',
    '!./node_modules/**',
    '!./納品/**'
  ]);
});

test('scssSrcWithExcludes は先頭の ./ を重複させない', () => {
  assert.deepStrictEqual(scssSrcWithExcludes(['./lp02-b/**']).pop(), '!./lp02-b/**');
});

test('exclude 未指定なら SCSS_SRC のまま', () => {
  assert.deepStrictEqual(scssSrcWithExcludes(), [
    './**/*.scss',
    '!./**/_*.scss',
    '!./node_modules/**'
  ]);
});

test('resolveEntries は除外パターンに一致するエントリを落とす', () => {
  withFixture(['css/contents.scss', '納品/260603/css/contents.scss'], () => {
    const input = 'css/contents.scss\n納品/260603/css/contents.scss';
    assert.deepStrictEqual(resolveEntries(input, ['納品/**']), ['css/contents.scss']);
  });
});

test('resolveEntries はパーシャル経由でも除外を尊重する', () => {
  withFixture(['納品/260603/css/_vars.scss', '納品/260603/css/contents.scss'], () => {
    assert.deepStrictEqual(resolveEntries('納品/260603/css/_vars.scss', ['納品/**']), []);
  });
});

test('resolveEntries は除外なしなら従来どおり', () => {
  withFixture(['css/contents.scss'], () => {
    assert.deepStrictEqual(resolveEntries('css/contents.scss'), ['css/contents.scss']);
  });
});

test('scssWatchGlobs はパーシャルを含めつつ除外を足す', () => {
  assert.deepStrictEqual(scssWatchGlobs(['納品/**']), [
    './**/*.scss',
    '!./node_modules/**',
    '!./納品/**'
  ]);
});

test('scssWatchGlobs は除外なしならパーシャルを含む2件', () => {
  assert.deepStrictEqual(scssWatchGlobs(), ['./**/*.scss', '!./node_modules/**']);
});
