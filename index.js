// 各プロジェクトの gulpfile.js から呼ばれる入口。
//
//   require('@highpace/lp-build')({ images: 'flat' });
//
// ここでオプションと browserslist を検証してから各タスクを登録する。
const fs = require('node:fs');
const path = require('node:path');

const css = require('./lib/css');
const images = require('./lib/images');

const IMAGE_MODES = ['flat', 'perPage'];

const resolveOptions = (options = {}) => {
  const opts = { images: 'flat', ...options };

  if (!IMAGE_MODES.includes(opts.images)) {
    throw new Error(
      `lp-build: images オプションが不正です: ${JSON.stringify(opts.images)}\n` +
        `       指定できるのは ${IMAGE_MODES.join(' か ')} です。\n` +
        `       flat    … srcImg/sub/x.jpg → img/sub/x.jpg\n` +
        `       perPage … srcImg/<page>/<type>/x.jpg → <page>/<type>/img/x.jpg`
    );
  }

  return opts;
};

// autoprefixer は CSS ファイルのパスから上方向に package.json / .browserslistrc を
// 探索してターゲットを決める。つまり browserslist はプロジェクト側に無いと効かず、
// このパッケージに既定を置いても読まれない。
// 書き忘れると autoprefixer 自身の既定値 defaults で動き、気付かないまま
// 別の出力になるため、ここで止める。
const assertBrowserslist = () => {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, '.browserslistrc'))) return;

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch (e) {
    throw new Error(`lp-build: package.json を読めませんでした: ${e.message}`);
  }

  const bl = pkg.browserslist;
  const isEmpty =
    bl === undefined ||
    bl === null ||
    (Array.isArray(bl) && bl.length === 0) ||
    (typeof bl === 'object' && !Array.isArray(bl) && Object.keys(bl).length === 0);

  if (isEmpty) {
    throw new Error(
      'lp-build: package.json に "browserslist" がありません。\n' +
        '       autoprefixer が既定値(defaults)で動作してしまうため、明示的に指定してください。\n' +
        '       通常のLP: ["last 2 versions", "ios_saf >= 12", "Android >= 5", "not dead"]'
    );
  }
};

// プロジェクト側の gulp を使う。パッケージ内で require('gulp') すると
// 入れ子の node_modules を引いてプロジェクトと別インスタンスになり、
// 登録したタスクが gulp CLI から見えなくなる恐れがあるため、cwd 起点で解決する。
const resolveGulp = () => {
  const resolved = require.resolve('gulp', { paths: [process.cwd()] });
  return require(resolved);
};

module.exports = function register(options) {
  const opts = resolveOptions(options);
  assertBrowserslist();

  const gulp = resolveGulp();

  css.register(gulp);
  images.register(gulp, opts);
  require('./lib/watch').register(gulp, opts);
};

module.exports.resolveOptions = resolveOptions;
module.exports.assertBrowserslist = assertBrowserslist;
