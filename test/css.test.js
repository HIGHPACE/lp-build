const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const css = require('../lib/css');

// 一時ディレクトリに擬似プロジェクトを作り、cwd を移して検証する。
// compileOne は cwd 基準の相対パスを扱う。
const withFixture = async (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-css-'));
  fs.mkdirSync(path.join(dir, 'css'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'css', '_vars.scss'), '$c: #123456;\n');
  fs.writeFileSync(
    path.join(dir, 'css', 'contents.scss'),
    '@use "vars" as *;\n.a { color: $c; display: flex; }\n'
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', browserslist: ['last 2 versions', 'ie >= 11'] })
  );
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('展開形は .css と .css.map を書き出す', async () => {
  await withFixture(async () => {
    const written = await css.compileOne('css/contents.scss');
    assert.deepStrictEqual(written, ['css/contents.css', 'css/contents.css.map']);
    assert.ok(fs.existsSync('css/contents.css'));
    assert.ok(fs.existsSync('css/contents.css.map'));
  });
});

test('CSS の末尾に sourceMappingURL コメントが入る', async () => {
  await withFixture(async () => {
    await css.compileOne('css/contents.scss');
    const out = fs.readFileSync('css/contents.css', 'utf8');
    assert.match(out.trim().split('\n').pop(), /sourceMappingURL=contents\.css\.map/);
  });
});

test('マップの sources は相対パスで絶対パスを含まない', async () => {
  await withFixture(async () => {
    await css.compileOne('css/contents.scss');
    const map = JSON.parse(fs.readFileSync('css/contents.css.map', 'utf8'));
    assert.ok(Array.isArray(map.sources));
    for (const s of map.sources) {
      assert.ok(!s.startsWith('file://'), `file:// URL が残っている: ${s}`);
      assert.ok(!path.isAbsolute(s), `絶対パスが残っている: ${s}`);
    }
    assert.ok(map.sources.includes('css/contents.scss'), 'エントリが sources に含まれる');
  });
});

test('マップに SCSS の中身を埋め込まない', async () => {
  await withFixture(async () => {
    await css.compileOne('css/contents.scss');
    const map = JSON.parse(fs.readFileSync('css/contents.css.map', 'utf8'));
    assert.strictEqual(map.sourcesContent, undefined);
  });
});

test('圧縮形は .min.css のみでマップを作らない', async () => {
  await withFixture(async () => {
    // .min.css が既に存在する場合のみ更新する仕様
    fs.writeFileSync('css/contents.min.css', '');
    const written = await css.compileOne('css/contents.scss', { min: true });
    assert.deepStrictEqual(written, ['css/contents.min.css']);
    assert.ok(!fs.existsSync('css/contents.min.css.map'));
    const out = fs.readFileSync('css/contents.min.css', 'utf8');
    assert.ok(!/sourceMappingURL/.test(out), 'min には sourceMappingURL を付けない');
  });
});

test('.min.css が無ければ圧縮形は何も書き出さない', async () => {
  await withFixture(async () => {
    const written = await css.compileOne('css/contents.scss', { min: true });
    assert.deepStrictEqual(written, []);
    assert.ok(!fs.existsSync('css/contents.min.css'));
  });
});

test('別ディレクトリでビルドしても .css と .css.map が一致する（決定性）', async () => {
  const read = async () => {
    let out;
    await withFixture(async () => {
      await css.compileOne('css/contents.scss');
      out = {
        css: fs.readFileSync('css/contents.css', 'utf8'),
        map: fs.readFileSync('css/contents.css.map', 'utf8')
      };
    });
    return out;
  };
  const a = await read();
  const b = await read();
  assert.strictEqual(a.css, b.css, 'CSS が一致する');
  assert.strictEqual(a.map, b.map, 'マップが一致する');
});
