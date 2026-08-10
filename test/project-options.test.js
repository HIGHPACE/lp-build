// pre-commit の CLI が gulpfile.js の exclude を読めることを固定する。
//
// v1.2.0 では CLI が exclude を知らず、除外したはずのディレクトリの SCSS を
// コミットすると、存在しない .css.map を git add しようとして pre-commit が
// 失敗しコミットできなくなっていた（sbivc の lp02-b/ で実測）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { readOptions, readExcludes } = require('../lib/project-options');

const PKG_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(PKG_ROOT, 'bin', 'scss-targets.js');

// gulpfile.js と SCSS を持つプロジェクトを一時ディレクトリに作る。
// node_modules は作らない。オプションだけを読む経路では gulp も
// browser-sync も要らないことを、これで同時に固定している。
const withProject = (gulpfileBody, files, fn) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-proj-')));

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', browserslist: ['last 2 versions'] })
  );
  fs.writeFileSync(path.join(dir, 'gulpfile.js'), gulpfileBody);

  for (const rel of files) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '');
  }

  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn(dir);
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// gulpfile が実プロジェクトと同じ書き方でこのパッケージを読み込むようにする。
// 一時ディレクトリには node_modules が無いので絶対パスで指す。
const gulpfile = (optionsLiteral) =>
  `require(${JSON.stringify(PKG_ROOT)})(${optionsLiteral});\n`;

test('readOptions は gulpfile.js に渡された exclude を返す', () => {
  withProject(gulpfile("{ images: 'flat', exclude: ['lp02-b/**'] }"), [], () => {
    assert.deepStrictEqual(readOptions().exclude, ['lp02-b/**']);
  });
});

test('readOptions は images も読める', () => {
  withProject(gulpfile("{ images: 'perPage' }"), [], () => {
    assert.strictEqual(readOptions().images, 'perPage');
  });
});

test('readExcludes は exclude 未指定なら空配列', () => {
  withProject(gulpfile("{ images: 'flat' }"), [], () => {
    assert.deepStrictEqual(readExcludes(), []);
  });
});

test('readExcludes は gulpfile.js が無ければ空配列', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-nogulp-')));
  const prev = process.cwd();
  process.chdir(dir);
  try {
    assert.deepStrictEqual(readExcludes(), []);
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// オプションを読むだけのときは gulp を解決しない。
// pre-commit は SCSS を保存するたびに通る経路なので、
// browser-sync まで読み込むと体感に出る。
test('オプションを読むだけなら gulp が無くても失敗しない', () => {
  withProject(gulpfile("{ exclude: ['x/**'] }"), [], (dir) => {
    assert.ok(!fs.existsSync(path.join(dir, 'node_modules')));
    assert.deepStrictEqual(readExcludes(), ['x/**']);
  });
});

const runBin = (args) =>
  execFileSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCSS_FILES: 'lp02-b/assets/css/contents.scss\ncss/contents.scss'
    }
  })
    .split('\n')
    .filter(Boolean);

test('CLI は gulpfile.js の exclude を反映してエントリを落とす', () => {
  withProject(
    gulpfile("{ exclude: ['lp02-b/**'] }"),
    ['lp02-b/assets/css/contents.scss', 'css/contents.scss'],
    () => {
      assert.deepStrictEqual(runBin([]), ['css/contents.scss']);
    }
  );
});

// これが v1.2.0 の実害そのもの。除外したディレクトリの .css.map は
// 生成されないため、CLI が出したパスを git add した pre-commit が
// pathspec エラーで失敗し、コミットできなくなっていた。
test('CLI --outputs は除外したディレクトリの出力を含めない', () => {
  withProject(
    gulpfile("{ exclude: ['lp02-b/**'] }"),
    ['lp02-b/assets/css/contents.scss', 'css/contents.scss'],
    () => {
      const outputs = runBin(['--outputs']);
      assert.deepStrictEqual(outputs, [
        'css/contents.css',
        'css/contents.css.map',
        'css/contents.min.css',
        'css/contents.min.css.map'
      ]);
      assert.ok(!outputs.some((p) => p.startsWith('lp02-b/')));
    }
  );
});

test('CLI は exclude 未指定なら従来どおり全エントリを出す', () => {
  withProject(gulpfile('{}'), ['lp02-b/assets/css/contents.scss', 'css/contents.scss'], () => {
    assert.deepStrictEqual(runBin([]), [
      'css/contents.scss',
      'lp02-b/assets/css/contents.scss'
    ]);
  });
});
