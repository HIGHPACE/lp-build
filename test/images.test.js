const test = require('node:test');
const assert = require('node:assert');
const { toDestDir } = require('../lib/images');

test('flat は img/ の下に srcImg の相対パスをそのまま置く', () => {
  assert.strictEqual(toDestDir('.', 'flat'), 'img');
  assert.strictEqual(toDestDir('sub', 'flat'), 'img/sub');
  assert.strictEqual(toDestDir('a/b', 'flat'), 'img/a/b');
});

test('perPage はページディレクトリ配下の img/ に置く', () => {
  assert.strictEqual(toDestDir('.', 'perPage'), 'img');
  assert.strictEqual(toDestDir('mercurop/type_h_1', 'perPage'), 'mercurop/type_h_1/img');
  assert.strictEqual(toDestDir('careet/lp', 'perPage'), 'careet/lp/img');
});
