const test = require('node:test');
const assert = require('node:assert');

const lpBuild = require('../index');
const watch = require('../lib/watch');

// 環境変数を汚さずに検証する。
const withEnv = (value, fn) => {
  const prev = process.env.LP_BUILD_PROXY;
  if (value === undefined) {
    delete process.env.LP_BUILD_PROXY;
  } else {
    process.env.LP_BUILD_PROXY = value;
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.LP_BUILD_PROXY;
    } else {
      process.env.LP_BUILD_PROXY = prev;
    }
  }
};

test('proxy を指定しなければ既定の localhost:8000 になる', () => {
  withEnv(undefined, () => {
    assert.strictEqual(watch.resolveProxy({}), 'http://localhost:8000');
  });
});

test('proxy オプションが既定値を上書きする', () => {
  withEnv(undefined, () => {
    assert.strictEqual(
      watch.resolveProxy({ proxy: 'http://musashi-koyama.local' }),
      'http://musashi-koyama.local'
    );
  });
});

test('環境変数 LP_BUILD_PROXY が proxy オプションより優先される', () => {
  withEnv('http://from-env.local', () => {
    assert.strictEqual(
      watch.resolveProxy({ proxy: 'http://from-option.local' }),
      'http://from-env.local'
    );
  });
});

test('resolveOptions は proxy の既定値を null にする', () => {
  assert.strictEqual(lpBuild.resolveOptions({}).proxy, null);
});

test('resolveOptions は proxy をそのまま通す', () => {
  assert.strictEqual(
    lpBuild.resolveOptions({ proxy: 'https://example.test' }).proxy,
    'https://example.test'
  );
});

test('http(s):// で始まらない proxy はエラーになる', () => {
  assert.throws(
    () => lpBuild.resolveOptions({ proxy: 'musashi-koyama.local' }),
    /proxy オプションは http\(s\):\/\/ で始まるURL/
  );
});

test('proxy に文字列以外を渡すとエラーになる', () => {
  assert.throws(() => lpBuild.resolveOptions({ proxy: 8000 }), /proxy オプション/);
});
