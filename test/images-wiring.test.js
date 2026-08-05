const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const images = require('../lib/images');

// gulp-changed 5.x は ESM 専用。Node の require(ESM) は名前空間オブジェクトを
// 返すため、そのまま呼ぶと "changed is not a function" になる。
// 将来 gulp-changed を上げたときにこの前提が崩れたら気付けるようにしておく。
test('gulp-changed は .default に関数を持つ（ESM interop）', () => {
  const m = require('gulp-changed');
  const fn = m.default || m;
  assert.strictEqual(typeof fn, 'function', 'gulp-changed の実体が関数として取り出せること');
});

// register が実際に必要なタスク名を登録することを、最小のダミー gulp で確認する。
// タスク本体の挙動ではなく「配線」を守るためのテスト。
test('register は images / webp / svgs を登録する', () => {
  const registered = {};
  const fakeGulp = {
    task: (name, fn) => {
      registered[name] = fn;
    },
    src: () => {
      throw new Error('このテストではタスクを実行しない');
    },
    dest: () => {},
    parallel: () => () => {},
    series: () => () => {},
    watch: () => ({ on: () => {} })
  };

  images.register(fakeGulp, { images: 'flat' });

  assert.deepStrictEqual(Object.keys(registered).sort(), ['images', 'svgs', 'webp']);
  for (const name of ['images', 'webp', 'svgs']) {
    assert.strictEqual(typeof registered[name], 'function', `${name} が関数として登録される`);
  }
});

// gulp-changed の transformPath には「dest + file.relative」が渡る。
// srcImg 配下のパスではないため、出力先への読み替えを間違えると比較先が
// 存在しないパスになり、毎回再圧縮されてしまう。
test('toDestDir は srcImg 内の相対ディレクトリを出力先へ読み替える', () => {
  assert.strictEqual(
    path.join(images.toDestDir('testpage/type_a', 'perPage'), 'sample.png'),
    'testpage/type_a/img/sample.png'
  );
  assert.strictEqual(
    path.join(images.toDestDir('testpage/type_a', 'flat'), 'sample.png'),
    'img/testpage/type_a/sample.png'
  );
});
