const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const css = require('../lib/css');

// 一時ディレクトリに擬似プロジェクトを作り、cwd を移して検証する。
// compileOne は cwd 基準の相対パスを扱う。
// SCSS をリポジトリルート直下ではなく深い階層に置く。
// cwd 基準とマップ基準の相対パスが一致してしまう浅い構成では、
// sources の基準を間違えるバグを検出できない。
const SCSS_DIR = 'pages/lp01/css';
const SCSS = SCSS_DIR + '/contents.scss';

const withFixture = async (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-css-'));
  fs.mkdirSync(path.join(dir, SCSS_DIR), { recursive: true });
  fs.writeFileSync(path.join(dir, SCSS_DIR, '_vars.scss'), '$c: #123456;\n');
  fs.writeFileSync(
    path.join(dir, SCSS),
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
    const written = await css.compileOne(SCSS);
    assert.deepStrictEqual(written, [SCSS_DIR + '/contents.css', SCSS_DIR + '/contents.css.map']);
    assert.ok(fs.existsSync(SCSS_DIR + '/contents.css'));
    assert.ok(fs.existsSync(SCSS_DIR + '/contents.css.map'));
  });
});

test('CSS の末尾に sourceMappingURL コメントが入る', async () => {
  await withFixture(async () => {
    await css.compileOne(SCSS);
    const out = fs.readFileSync(SCSS_DIR + '/contents.css', 'utf8');
    assert.match(out.trim().split('\n').pop(), /sourceMappingURL=contents\.css\.map/);
  });
});

test('マップの sources は相対パスで絶対パスを含まない', async () => {
  await withFixture(async () => {
    await css.compileOne(SCSS);
    const map = JSON.parse(fs.readFileSync(SCSS_DIR + '/contents.css.map', 'utf8'));
    assert.ok(Array.isArray(map.sources));
    for (const s of map.sources) {
      assert.ok(!s.startsWith('file://'), `file:// URL が残っている: ${s}`);
      assert.ok(!path.isAbsolute(s), `絶対パスが残っている: ${s}`);
    }
    assert.ok(map.sources.includes('contents.scss'), 'エントリが sources に含まれる');
  });
});

test('マップに SCSS の中身を埋め込まない', async () => {
  await withFixture(async () => {
    await css.compileOne(SCSS);
    const map = JSON.parse(fs.readFileSync(SCSS_DIR + '/contents.css.map', 'utf8'));
    assert.strictEqual(map.sourcesContent, undefined);
  });
});

test('圧縮形も .min.css と .min.css.map を書き出す', async () => {
  await withFixture(async () => {
    const written = await css.compileOne(SCSS, { min: true });
    assert.deepStrictEqual(written, [
      SCSS_DIR + '/contents.min.css',
      SCSS_DIR + '/contents.min.css.map'
    ]);
    assert.ok(fs.existsSync(SCSS_DIR + '/contents.min.css.map'));
    const out = fs.readFileSync(SCSS_DIR + '/contents.min.css', 'utf8');
    assert.match(out.trim().split('\n').pop(), /sourceMappingURL=contents\.min\.css\.map/);
  });
});

test('圧縮形のマップも解決できる相対パスになる', async () => {
  await withFixture(async () => {
    const mapPath = SCSS_DIR + '/contents.min.css.map';
    await css.compileOne(SCSS, { min: true });
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const mapDir = path.dirname(mapPath);
    for (const s of map.sources) {
      assert.ok(!path.isAbsolute(s), `絶対パスが残っている: ${s}`);
      assert.ok(
        fs.existsSync(path.normalize(path.join(mapDir, s))),
        `sources "${s}" がマップ位置から解決できない`
      );
    }
  });
});

// v1.2.x までは .min.css が既に存在するページだけを更新していた。
// 新規ページでは空の .min.css を手で置くまで生成されず、圧縮形が欠けたまま
// 気付かれない事故になっていたため、存在しなくても必ず作るようにした。
test('.min.css が無くても圧縮形を新規に書き出す', async () => {
  await withFixture(async () => {
    assert.ok(!fs.existsSync(SCSS_DIR + '/contents.min.css'));
    const written = await css.compileOne(SCSS, { min: true });
    assert.deepStrictEqual(written, [
      SCSS_DIR + '/contents.min.css',
      SCSS_DIR + '/contents.min.css.map'
    ]);
    assert.ok(fs.existsSync(SCSS_DIR + '/contents.min.css'));
    assert.ok(fs.existsSync(SCSS_DIR + '/contents.min.css.map'));
  });
});

test('別ディレクトリでビルドしても .css と .css.map が一致する（決定性）', async () => {
  const read = async () => {
    let out;
    await withFixture(async () => {
      await css.compileOne(SCSS);
      out = {
        css: fs.readFileSync(SCSS_DIR + '/contents.css', 'utf8'),
        map: fs.readFileSync(SCSS_DIR + '/contents.css.map', 'utf8')
      };
    });
    return out;
  };
  const a = await read();
  const b = await read();
  assert.strictEqual(a.css, b.css, 'CSS が一致する');
  assert.strictEqual(a.map, b.map, 'マップが一致する');
});

// ブラウザは sources を「マップの URL からの相対」として解決する。
// cwd 基準にすると /a/b/css/a/b/css/style.scss のような存在しないパスを
// 取りに行って 404 になり、devtools に架空のフォルダが並んで SCSS を開けない。
// 実際に起きたバグなので、解決先が実在することをテストで固定する。
test('sources はマップの位置から解決して実在するパスになる', async () => {
  await withFixture(async () => {
    const mapPath = SCSS_DIR + '/contents.css.map';
    await css.compileOne(SCSS);
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const mapDir = path.dirname(mapPath);

    for (const s of map.sources) {
      const resolved = path.normalize(path.join(mapDir, s));
      assert.ok(
        fs.existsSync(resolved),
        `sources "${s}" がマップ位置から解決できない（→ ${resolved}）`
      );
    }
  });
});

test('sources は入れ子のディレクトリ名を重複させない', async () => {
  await withFixture(async () => {
    await css.compileOne(SCSS);
    const map = JSON.parse(fs.readFileSync(SCSS_DIR + '/contents.css.map', 'utf8'));
    for (const s of map.sources) {
      assert.ok(
        !s.includes(SCSS_DIR),
        `sources "${s}" にマップ自身のディレクトリが含まれている（cwd基準になっている）`
      );
    }
    // 同じディレクトリのパーシャルは basename だけになる
    assert.ok(map.sources.includes('_vars.scss'), 'パーシャルが basename で入る');
  });
});
