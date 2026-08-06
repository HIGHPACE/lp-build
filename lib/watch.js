// BrowserSync とファイル監視。
//
// SCSS は保存されたファイルに対応するエントリだけをコンパイルする。
// 全件（css:all）は104エントリで数秒かかるが、1ファイルなら0.5秒台で済む。
//
// 監視対象にはパーシャル（_*.scss）も含める。lib/css.js の SCSS_SRC は
// "!./**/_*.scss" でパーシャルを除外しているため、これを監視グロブに使うと
// パーシャルを保存しても何も起きない。
const browserSync = require('browser-sync').create();
const path = require('node:path');

const css = require('./css');
const images = require('./images');
const scssTargets = require('./scss-targets');

const NOT_NODE_MODULES = '!./node_modules/**';

// 監視グロブ。パーシャルを含み、exclude で外したディレクトリは監視しない。
const scssWatchGlobs = (excludes = []) => [
  './**/*.scss',
  NOT_NODE_MODULES,
  ...excludes.map((p) => '!./' + String(p).replace(/^\.?\//, ''))
];

const browserSyncOption = {
  proxy: 'http://localhost:8000',
  open: true
};

const register = (gulp, options = {}) => {
  gulp.task('serve', (done) => {
    browserSync.init(browserSyncOption);
    done();
  });

  gulp.task('watch', (done) => {
    const browserReload = (done) => {
      browserSync.reload();
      done();
    };

    // node_modules を除外する。除外しないと './**/*.js' だけで
    // node_modules 配下の2000超のディレクトリを監視してしまう。
    gulp.watch(['./**/*.php', NOT_NODE_MODULES], browserReload);
    gulp.watch(['./**/*.html', NOT_NODE_MODULES], browserReload);
    gulp.watch(['./**/*.css', NOT_NODE_MODULES], browserReload);
    gulp.watch(['./**/*.js', NOT_NODE_MODULES], browserReload);

    const excludes = options.exclude || [];
    const scssWatcher = gulp.watch(scssWatchGlobs(excludes));

    const compileChangedScss = (changedPath) => {
      const rel = path.relative(process.cwd(), changedPath);
      const entries = scssTargets.resolveEntries(rel, excludes);

      if (entries.length === 0) return;

      // パーシャルの場合は読み替え先を表示する
      const isPartial = path.basename(rel).startsWith('_');
      console.log('[scss] ' + rel + (isPartial ? ' → ' + entries.join(', ') : ''));

      // リロードは上の './**/*.css' 監視が拾う（ここで reload すると二重になる）
      (async () => {
        for (const e of entries) {
          await css.compileOne(e);
          await css.compileOne(e, { min: true });
        }
      })().catch((err) => console.log('[scss] コンパイル失敗:', err.message));
    };

    scssWatcher.on('change', compileChangedScss);
    scssWatcher.on('add', compileChangedScss);

    gulp.watch(images.IMAGES_SRC, gulp.series('images', 'webp', browserReload));
    gulp.watch(images.SVG_SRC, gulp.series('svgs', browserReload));

    done();
  });

  // 最初に一括ビルド → サーバー起動 → 監視
  gulp.task(
    'default',
    gulp.series(gulp.parallel('css:all', 'images', 'webp', 'svgs'), 'serve', 'watch')
  );
};

module.exports = { register, scssWatchGlobs };
