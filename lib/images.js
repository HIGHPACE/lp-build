// 画像圧縮（imagemin）・webp 生成（sharp）・SVG コピー。
//
// 既存の画像と webp は再生成しない方針:
//   images … gulp-changed で srcImg 側が新しいときだけ再圧縮する
//   webp   … 出力が既に存在する場合はスキップする
// これがないと、誰かが npm run dev を1回実行しただけで既存の全画像が
// 新しい設定で再圧縮され、バイナリが全差分になる。
const imagemin = require('gulp-imagemin');
const mozjpeg = require('imagemin-mozjpeg');
const pngquant = require('imagemin-pngquant');
const changed = require('gulp-changed');
const rename = require('gulp-rename');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = './srcImg';
const IMAGES_SRC = './srcImg/**/*.{png,jpg,jpeg}';
const SVG_SRC = './srcImg/**/*.svg';
const WEBP_QUALITY = 80;

// srcImg 以下の相対ディレクトリを出力先ディレクトリへ読み替える。
//   flat    … srcImg/sub/x.jpg → img/sub/x.jpg
//   perPage … srcImg/<page>/<type>/x.jpg → <page>/<type>/img/x.jpg
const toDestDir = (subdir, mode) => {
  if (!subdir || subdir === '.') return 'img';
  return mode === 'perPage' ? path.join(subdir, 'img') : path.join('img', subdir);
};

// gulp ストリーム用: dirname を出力先へ差し替える
const routeToDest = (mode) =>
  rename((p) => {
    p.dirname = toDestDir(p.dirname, mode);
  });

// imagemin-pngquant 5系は quality を「文字列の min-max」で受け取る。
// 配列を渡すと Quality should be in format min-max ... で例外になる。
const compressors = () =>
  imagemin([
    pngquant({ quality: '70-85', speed: 1 }),
    mozjpeg({ quality: 85, progressive: true })
  ]);

const register = (gulp, options) => {
  const mode = options.images;

  gulp.task('images', function () {
    return gulp
      .src(IMAGES_SRC, { encoding: false })
      // 出力より srcImg が新しいものだけ処理する（既存画像を守る）
      .pipe(
        changed('.', {
          transformPath: (destPath) => {
            const rel = path.relative(path.resolve(SRC_DIR), destPath);
            return path.join(toDestDir(path.dirname(rel), mode), path.basename(rel));
          }
        })
      )
      .pipe(compressors())
      .pipe(routeToDest(mode))
      .pipe(gulp.dest('.'));
  });

  gulp.task('webp', async function () {
    let files;
    try {
      files = fs
        .readdirSync(SRC_DIR, { recursive: true })
        .filter((f) => /\.(png|jpe?g)$/i.test(f));
    } catch (e) {
      console.log('srcImg が見つからないため webp 生成をスキップします。');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const rel of files) {
      const input = path.join(SRC_DIR, rel);
      const output = path.join(
        toDestDir(path.dirname(rel), mode),
        path.basename(rel).replace(/\.(png|jpe?g)$/i, '.webp')
      );

      // 既存の webp は再生成しない
      if (fs.existsSync(output)) {
        skipped++;
        continue;
      }

      fs.mkdirSync(path.dirname(output), { recursive: true });
      await sharp(input).webp({ quality: WEBP_QUALITY }).toFile(output);
      created++;
    }

    console.log(`webp: ${created}件生成 / ${skipped}件は既存のためスキップ`);
  });

  gulp.task('svgs', function () {
    return gulp
      .src(SVG_SRC, { encoding: false })
      .pipe(routeToDest(mode))
      .pipe(gulp.dest('.'));
  });
};

module.exports = { register, toDestDir, IMAGES_SRC, SVG_SRC, SRC_DIR };
