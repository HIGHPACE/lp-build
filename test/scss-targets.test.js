const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveEntries, cssOutputsFor } = require('../lib/scss-targets');

// 一時ディレクトリに擬似プロジェクトを作る。
// resolveEntries は process.cwd() 基準の相対パスを扱うため cwd を移動する。
const withFixture = (files, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scss-targets-'));
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

test('エントリSCSSはそのまま対象になる', () => {
  withFixture({ 'css/contents.scss': '' }, () => {
    assert.deepStrictEqual(resolveEntries('css/contents.scss'), ['css/contents.scss']);
  });
});

test('パーシャルは同一ディレクトリのエントリに読み替わる', () => {
  withFixture(
    { 'css/_vars.scss': '', 'css/common.scss': '', 'css/contents.scss': '' },
    () => {
      assert.deepStrictEqual(resolveEntries('css/_vars.scss'), [
        'css/common.scss',
        'css/contents.scss'
      ]);
    }
  );
});

test('存在しないSCSSと非SCSSは無視される', () => {
  withFixture({ 'css/contents.scss': '' }, () => {
    assert.deepStrictEqual(resolveEntries('css/gone.scss\ngulpfile.js\n'), []);
  });
});

test('重複は排除されソートされる', () => {
  withFixture({ 'css/b.scss': '', 'css/a.scss': '' }, () => {
    assert.deepStrictEqual(resolveEntries('css/b.scss\ncss/a.scss\ncss/b.scss'), [
      'css/a.scss',
      'css/b.scss'
    ]);
  });
});

test('空・未定義の入力で例外にならない', () => {
  assert.deepStrictEqual(resolveEntries(''), []);
  assert.deepStrictEqual(resolveEntries(undefined), []);
});

test('cssOutputsFor は .css を常に含め .min.css は既存のみ含める', () => {
  withFixture(
    { 'css/a.scss': '', 'css/a.min.css': '', 'css/b.scss': '' },
    () => {
      assert.deepStrictEqual(cssOutputsFor(['css/a.scss', 'css/b.scss']), [
        'css/a.css',
        'css/a.min.css',
        'css/b.css'
      ]);
    }
  );
});
