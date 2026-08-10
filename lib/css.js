// SCSS → CSS の共通パイプライン。
//
// gulp-sass / gulp-postcss は使わず sass と postcss を直接呼ぶ。
// 1つの SCSS から .css と .css.map の2ファイルを書き出す必要があり、
// ストリーム経由では扱いにくいため。
// ファイル列挙だけは gulp.src({read:false}) を使い、既存のグロブ
// （否定パターンを含む）の解釈を変えないようにしている。
const sass = require('sass');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const scssTargets = require('./scss-targets');

// 全レイアウト（css/ · assets/css/ · lp01/assets/css/ · <page>/<type>/css/）を
// この1本で賄う。プロジェクト単位の除外は置かない。
const SCSS_SRC = ['./**/*.scss', '!./**/_*.scss', '!./node_modules/**'];

// exclude オプションを否定パターンとして足したグロブを返す
const scssSrcWithExcludes = (excludes = []) => [
  ...SCSS_SRC,
  ...excludes.map((p) => '!./' + String(p).replace(/^\.?\//, ''))
];

// dart-sass は sources に絶対 file:// URL を入れる。
// そのままコミットすると環境依存になり CI が全員で落ちるため相対パスへ書き換える。
//
// 基準は「マップファイルのあるディレクトリ」。ブラウザは sources を
// マップの URL からの相対として解決するため、cwd 基準にすると
//   css/style.css.map の sources が "a/b/css/style.scss"
//   → /a/b/css/a/b/css/style.scss を取りに行って 404
// となり、devtools に架空のフォルダが並んで SCSS を開けない。
// マップのディレクトリ基準なら "style.scss" になり正しく解決できる。
// 出力先からの相対位置は環境によらないため決定性も保たれる。
const toRelativeSource = (mapDir) => (s) =>
  s.startsWith('file://') ? path.relative(mapDir, url.fileURLToPath(s)) : s;

const writeFile = (rel, content) => {
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, content);
  fs.chmodSync(rel, 0o644);
};

// 1ファイルをコンパイルして書き出し、書き出したパスの配列を返す。
// 展開形 … ['x.css', 'x.css.map']
// 圧縮形 … ['x.min.css', 'x.min.css.map']
//
// 圧縮形は出力の有無にかかわらず必ず生成する。
// v1.2.x までは「.min.css が既に存在するページだけ更新する」仕様で、
// 新規ページでは空の .min.css を手で置かないと生成されなかった。
//
// 展開形と圧縮形の両方にソースマップを付ける。
// 圧縮形を参照しているページ（careet / fudousan / mercurop の12ファイル）でも
// devtools から SCSS を追えるようにするため。
const compileOne = async (scss, { min = false } = {}) => {
  const out = scss.replace(/\.scss$/, min ? '.min.css' : '.css');

  const r = sass.compile(scss, {
    style: min ? 'compressed' : 'expanded',
    sourceMap: true,
    sourceMapIncludeSources: false
  });

  const mapOut = out + '.map';
  const toRel = toRelativeSource(path.dirname(mapOut));

  const prev = { ...r.sourceMap, sources: r.sourceMap.sources.map(toRel) };

  const res = await postcss([autoprefixer()]).process(r.css, {
    from: out,
    to: out,
    map: { prev, inline: false, annotation: path.basename(mapOut) }
  });

  // postcss が prev を引き継いだ後にも絶対パスが残るため、ここでも書き換える
  const map = JSON.parse(res.map.toString());
  map.sources = map.sources.map(toRel);

  writeFile(out, res.css);
  writeFile(mapOut, JSON.stringify(map));
  return [out, mapOut];
};

// グロブを展開して各ファイルをコンパイルする。
// 列挙のみ gulp.src を使い、読み込みと書き出しは compileOne が行う。
const compileCss = (gulp, srcGlobs, { min = false } = {}) =>
  new Promise((resolve, reject) => {
    const files = [];
    gulp
      .src(srcGlobs, { base: '.', allowEmpty: true, read: false })
      .on('data', (f) => files.push(path.relative(process.cwd(), f.path)))
      .on('error', reject)
      .on('end', () => {
        (async () => {
          const written = [];
          for (const f of files.sort()) {
            written.push(...(await compileOne(f, { min })));
          }
          return written;
        })().then(resolve, reject);
      });
  });

const register = (gulp, options = {}) => {
  const excludes = options.exclude || [];
  const src = scssSrcWithExcludes(excludes);

  gulp.task('css', () => compileCss(gulp, src));
  gulp.task('css:min', () => compileCss(gulp, src, { min: true }));
  gulp.task('css:all', gulp.parallel('css', 'css:min'));

  // 環境変数 SCSS_FILES で渡された SCSS だけをコンパイルする（pre-commit 用）
  gulp.task('css:staged', async function () {
    const entries = scssTargets.resolveEntries(process.env.SCSS_FILES, excludes);

    if (entries.length === 0) {
      console.log('コンパイル対象の SCSS はありません。');
      return;
    }

    console.log('コンパイル対象:\n  ' + entries.join('\n  '));

    for (const e of entries) {
      await compileOne(e);
      await compileOne(e, { min: true });
    }
  });
};

module.exports = { SCSS_SRC, scssSrcWithExcludes, compileOne, compileCss, register };
