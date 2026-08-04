// SCSS → CSS の共通パイプライン。
// css / css:min / css:staged と lib/watch.js の部分コンパイルが
// すべて compileCss() を通るので、経路によって出力が食い違うことがない。
const sass = require('gulp-sass')(require('sass'));
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const rename = require('gulp-rename');
const { Transform } = require('node:stream');
const fs = require('node:fs');

const scssTargets = require('./scss-targets');

// 全レイアウト（css/ · assets/css/ · lp01/assets/css/ · <page>/<type>/css/）を
// この1本で賄う。プロジェクト単位の除外は置かない。
const SCSS_SRC = ['./**/*.scss', '!./**/_*.scss', '!./node_modules/**'];

// .min.css が既に存在する SCSS だけを通すフィルタ。
// .min.css を参照している HTML があるため生成は必須だが、
// 存在しないページに新規で作り出すことはしない。
const onlyExistingMin = () =>
  new Transform({
    objectMode: true,
    transform(file, enc, cb) {
      const minPath = file.path.replace(/\.scss$/, '.min.css');
      cb(null, fs.existsSync(minPath) ? file : undefined);
    }
  });

// autoprefixer は各プロジェクトの package.json の "browserslist" を自動参照する。
// （index.js が起動時に存在を検証している）
//
// gulp はインスタンスを引数で受け取る。パッケージ内で require('gulp') すると
// 入れ子の node_modules を引いてプロジェクト側と別インスタンスになり、
// 登録したタスクが gulp CLI から見えなくなる恐れがある。
const compileCss = (gulp, srcGlobs, { min = false } = {}) => {
  let stream = gulp.src(srcGlobs, { base: '.', allowEmpty: true });

  if (min) stream = stream.pipe(onlyExistingMin());

  stream = stream
    .pipe(sass({ style: min ? 'compressed' : 'expanded' }).on('error', sass.logError))
    .pipe(postcss([autoprefixer()]));

  if (min) stream = stream.pipe(rename({ suffix: '.min' }));

  return stream.pipe(gulp.dest('.', { mode: 0o644 }));
};

const register = (gulp) => {
  gulp.task('css', () => compileCss(gulp, SCSS_SRC));
  gulp.task('css:min', () => compileCss(gulp, SCSS_SRC, { min: true }));
  gulp.task('css:all', gulp.parallel('css', 'css:min'));

  // 環境変数 SCSS_FILES で渡された SCSS だけをコンパイルする（pre-commit 用）
  gulp.task('css:staged', function (done) {
    const entries = scssTargets.resolveEntries(process.env.SCSS_FILES);

    if (entries.length === 0) {
      console.log('コンパイル対象の SCSS はありません。');
      return done();
    }

    console.log('コンパイル対象:\n  ' + entries.join('\n  '));

    gulp.parallel(
      function cssStagedExpanded() {
        return compileCss(gulp, entries);
      },
      function cssStagedMin() {
        return compileCss(gulp, entries, { min: true });
      }
    )(done);
  });
};

module.exports = { SCSS_SRC, compileCss, register };
