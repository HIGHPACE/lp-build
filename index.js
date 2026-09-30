// 各プロジェクトの gulpfile.js から呼ばれる入口。
//
//   require('@highpace/lp-build')({ images: 'flat' });
//
// ここでオプションと browserslist を検証してから各タスクを登録する。
const fs = require('node:fs');
const path = require('node:path');

const css = require('./lib/css');
const images = require('./lib/images');
const { SCOPE_ENV, resolveScope } = require('./lib/scope');

const IMAGE_MODES = ['flat', 'perPage'];

const resolveOptions = (options = {}) => {
  const opts = { images: 'flat', exclude: [], proxy: null, ...options };

  if (!IMAGE_MODES.includes(opts.images)) {
    throw new Error(
      `lp-build: images オプションが不正です: ${JSON.stringify(opts.images)}\n` +
        `       指定できるのは ${IMAGE_MODES.join(' か ')} です。\n` +
        `       flat    … srcImg/sub/x.jpg → img/sub/x.jpg\n` +
        `       perPage … srcImg/<page>/<type>/x.jpg → <page>/<type>/img/x.jpg`
    );
  }

  if (!Array.isArray(opts.exclude)) {
    throw new Error(
      `lp-build: exclude オプションは配列で指定してください: ${JSON.stringify(opts.exclude)}\n` +
        `       例: exclude: ['納品/**', 'lp02-b/**']\n` +
        `       パーシャルが欠落してビルドできない過去の納品物を外す用途に限って使う。`
    );
  }

  // BrowserSync に渡す前に弾く。ホスト名だけを書いた場合 browser-sync は
  // 相対パスとして解釈してエラーにならず、繋がらない理由が分からなくなる。
  if (opts.proxy !== null && opts.proxy !== undefined) {
    if (typeof opts.proxy !== 'string' || !/^https?:\/\/.+/.test(opts.proxy)) {
      throw new Error(
        `lp-build: proxy オプションは http(s):// で始まるURLで指定してください: ${JSON.stringify(opts.proxy)}\n` +
          `       例: proxy: 'http://musashi-koyama.local'（Local のサイトURL）`
      );
    }
  }

  // { proxy: undefined } を渡された場合、スプレッドで既定の null が消えるため戻す。
  if (opts.proxy === undefined) {
    opts.proxy = null;
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

// この環境変数が立っている間は、オプションを解決したところで止めて
// タスクを登録しない。pre-commit の CLI が gulpfile.js から exclude を
// 読むための経路で、gulp も browser-sync も読み込まずに済ませるためにある
// （lib/project-options.js が使う）。
const OPTIONS_ONLY_ENV = 'LP_BUILD_OPTIONS_ONLY';

// 最後に解決したオプション。CLI は gulpfile.js を読み込んだ後にこれを取る。
//
// 置き場所を global にしているのは、シンボリックリンク経由の解決などで
// このファイルが二重に読み込まれても値を共有できるようにするため。
// resolveGulp が gulp の二重インスタンス化を避けているのと同じ理由で、
// パッケージ内の module スコープは同一性を前提にできない。
const LAST_OPTIONS = Symbol.for('@highpace/lp-build.lastResolvedOptions');

// 環境変数 LP_BUILD_SCOPE を読んで opts.scope（案件ディレクトリの配列か null）を足す。
// resolveOptions に入れないのは、pre-commit がオプションだけを読む経路
// （LP_BUILD_OPTIONS_ONLY）でスコープを検証させないため。打ち間違えた
// スコープのせいで SCSS をコミットできなくなるのを避ける。
const applyScope = (opts, env = process.env, cwd = process.cwd()) => {
  const scope = resolveScope(env[SCOPE_ENV], { images: opts.images, cwd });
  if (scope) console.log(`lp-build: ${SCOPE_ENV}=${scope.join(',')} のみビルド・監視します。`);
  return { ...opts, scope };
};

module.exports = function register(options) {
  const opts = resolveOptions(options);
  global[LAST_OPTIONS] = opts;

  if (process.env[OPTIONS_ONLY_ENV] === '1') return;

  assertBrowserslist();

  const scoped = applyScope(opts);
  const gulp = resolveGulp();

  css.register(gulp, scoped);
  images.register(gulp, scoped);
  require('./lib/watch').register(gulp, scoped);
};

module.exports.resolveOptions = resolveOptions;
module.exports.applyScope = applyScope;
module.exports.assertBrowserslist = assertBrowserslist;
module.exports.OPTIONS_ONLY_ENV = OPTIONS_ONLY_ENV;
module.exports.lastResolvedOptions = () => global[LAST_OPTIONS] || null;
