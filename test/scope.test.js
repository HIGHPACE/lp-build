const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveScope } = require('../lib/scope');
const { scssSrcWithExcludes } = require('../lib/css');
const images = require('../lib/images');
const { scssWatchGlobs, reloadGlobs } = require('../lib/watch');

const withDirs = (dirs, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-scope-'));
  for (const rel of dirs) fs.mkdirSync(path.join(dir, rel), { recursive: true });
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// ---- resolveScope ----

test('LP_BUILD_SCOPE が未指定・空なら null（全案件をビルドする）', () => {
  assert.strictEqual(resolveScope(undefined, { images: 'perPage' }), null);
  assert.strictEqual(resolveScope('', { images: 'perPage' }), null);
  assert.strictEqual(resolveScope(' , ', { images: 'perPage' }), null);
});

test('カンマ区切りで複数の案件を指定できる', () => {
  withDirs(['shutocari', 'shinshade'], (cwd) => {
    assert.deepStrictEqual(resolveScope('shutocari, shinshade', { images: 'perPage', cwd }), [
      'shutocari',
      'shinshade'
    ]);
  });
});

test('先頭の ./ と末尾の / は取り除く', () => {
  withDirs(['shutocari'], (cwd) => {
    assert.deepStrictEqual(resolveScope('./shutocari/', { images: 'perPage', cwd }), ['shutocari']);
  });
});

test('案件の下の階層も指定できる', () => {
  withDirs(['management-base/ops-lp01'], (cwd) => {
    assert.deepStrictEqual(resolveScope('management-base/ops-lp01', { images: 'perPage', cwd }), [
      'management-base/ops-lp01'
    ]);
  });
});

test('存在しないディレクトリはエラーになる（打ち間違いで何もビルドされないのを防ぐ）', () => {
  withDirs(['shutocari'], (cwd) => {
    assert.throws(
      () => resolveScope('shutokari', { images: 'perPage', cwd }),
      /LP_BUILD_SCOPE.*shutokari/
    );
  });
});

test('.. やグロブ文字を含む値はエラーになる', () => {
  withDirs(['shutocari'], (cwd) => {
    for (const bad of ['../shutocari', 'shutocari/..', 'shuto*', '{a,b}', '!shutocari', '/shutocari']) {
      assert.throws(() => resolveScope(bad, { images: 'perPage', cwd }), /LP_BUILD_SCOPE/, bad);
    }
  });
});

test("images: 'flat' のプロジェクトで指定するとエラーになる", () => {
  withDirs(['shutocari'], (cwd) => {
    assert.throws(() => resolveScope('shutocari', { images: 'flat', cwd }), /perPage/);
  });
});

// ---- グロブの組み立て ----

test('スコープ指定時の SCSS グロブは指定ディレクトリだけを見る', () => {
  assert.deepStrictEqual(scssSrcWithExcludes([], ['shutocari', 'shinshade']), [
    './shutocari/**/*.scss',
    './shinshade/**/*.scss',
    '!./**/_*.scss',
    '!./node_modules/**'
  ]);
});

test('スコープ指定時も exclude は効く', () => {
  assert.deepStrictEqual(scssSrcWithExcludes(['shutocari/old/**'], ['shutocari']), [
    './shutocari/**/*.scss',
    '!./**/_*.scss',
    '!./node_modules/**',
    '!./shutocari/old/**'
  ]);
});

test('スコープ指定時の画像グロブは srcImg/<案件> だけを見る', () => {
  assert.deepStrictEqual(images.imageGlobs(['shutocari']), ['./srcImg/shutocari/**/*.{png,jpg,jpeg}']);
  assert.deepStrictEqual(images.svgGlobs(['shutocari']), ['./srcImg/shutocari/**/*.svg']);
  assert.deepStrictEqual(images.imageGlobs(null), [images.IMAGES_SRC]);
  assert.deepStrictEqual(images.svgGlobs(null), [images.SVG_SRC]);
});

test('webp の対象は srcImg 内の指定案件のファイルだけに絞られる', () => {
  const files = [
    'shutocari/type_h_1/fv.jpg',
    'shinshade/quiz_1/fv.png',
    'shutocari-old/x.jpg',
    'shutocari/type_h_1/logo.svg'
  ];
  assert.deepStrictEqual(images.webpSources(files, ['shutocari']), ['shutocari/type_h_1/fv.jpg']);
  assert.deepStrictEqual(images.webpSources(files, null), [
    'shutocari/type_h_1/fv.jpg',
    'shinshade/quiz_1/fv.png',
    'shutocari-old/x.jpg'
  ]);
});

// srcImg/shutocari/** を glob にすると、gulp の base が srcImg/shutocari になり
// 出力先から shutocari/ が抜ける。base を srcImg に固定していることを確かめる。
test('スコープ指定時も画像の出力先は <案件>/<type>/img/ になる', () => {
  const calls = [];
  const stream = { pipe: () => stream };
  const fakeGulp = {
    task: (name, fn) => {
      if (name === 'images' || name === 'svgs') fn();
    },
    src: (globs, opts) => {
      calls.push(opts);
      return stream;
    },
    dest: () => stream
  };
  images.register(fakeGulp, { images: 'perPage', scope: ['shutocari'] });
  assert.strictEqual(calls.length, 2);
  for (const opts of calls) assert.strictEqual(opts.base, './srcImg');
});

test('スコープ指定時の SCSS 監視グロブはパーシャルも含めて指定ディレクトリだけを見る', () => {
  assert.deepStrictEqual(scssWatchGlobs([], ['shutocari']), [
    './shutocari/**/*.scss',
    '!./node_modules/**'
  ]);
});

test('リロード監視グロブもスコープで絞られる', () => {
  assert.deepStrictEqual(reloadGlobs('php', null), ['./**/*.php', '!./node_modules/**']);
  assert.deepStrictEqual(reloadGlobs('php', ['shutocari']), [
    './shutocari/**/*.php',
    '!./node_modules/**'
  ]);
});

// ---- index.js の配線 ----

const lpBuild = require('../index');

test('applyScope は環境変数を読んで opts.scope に入れる', () => {
  withDirs(['shutocari'], (cwd) => {
    const opts = lpBuild.applyScope({ images: 'perPage' }, { LP_BUILD_SCOPE: 'shutocari' }, cwd);
    assert.deepStrictEqual(opts.scope, ['shutocari']);
  });
});

test('applyScope は環境変数が無ければ scope を null にする', () => {
  const opts = lpBuild.applyScope({ images: 'perPage' }, {}, process.cwd());
  assert.strictEqual(opts.scope, null);
});

// pre-commit は gulpfile.js からオプションだけを読む（LP_BUILD_OPTIONS_ONLY）。
// スコープの打ち間違いで SCSS をコミットできなくなってはいけない。
test('オプションだけを読む経路では LP_BUILD_SCOPE を検証しない', () => {
  const prevOnly = process.env.LP_BUILD_OPTIONS_ONLY;
  const prevScope = process.env.LP_BUILD_SCOPE;
  process.env.LP_BUILD_OPTIONS_ONLY = '1';
  process.env.LP_BUILD_SCOPE = 'no-such-dir';
  try {
    assert.doesNotThrow(() => lpBuild({ images: 'perPage' }));
  } finally {
    if (prevOnly === undefined) delete process.env.LP_BUILD_OPTIONS_ONLY;
    else process.env.LP_BUILD_OPTIONS_ONLY = prevOnly;
    if (prevScope === undefined) delete process.env.LP_BUILD_SCOPE;
    else process.env.LP_BUILD_SCOPE = prevScope;
  }
});
