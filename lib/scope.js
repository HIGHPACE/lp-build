// 環境変数 LP_BUILD_SCOPE で、ビルドと監視の対象を案件ディレクトリに絞る。
//
//   LP_BUILD_SCOPE=shutocari npm run dev
//   LP_BUILD_SCOPE=shutocari,shinshade npm run dev
//
// open-lp のように1リポジトリに複数案件が同居していると、npm run dev の
// 一括ビルドが全案件に走る。別ブランチにしか無い srcImg から画像が生成されて
// 未追跡ファイルとして残り、git switch が「上書きしてしまう」と拒否される。
//
// gulpfile.js のオプションにしないのは、絞りたい案件が担当者ごとに違うため。
// gulpfile に書くとコミットに無関係な差分が混ざる（LP_BUILD_PROXY と同じ理由）。
const fs = require('node:fs');
const path = require('node:path');

const SCOPE_ENV = 'LP_BUILD_SCOPE';

// グロブとして解釈される文字。値はそのままグロブに埋め込むため弾く。
const GLOB_CHARS = /[*?[\]{}()!\\]/;

// 指定がなければ null（全案件）。あれば案件ディレクトリの配列を返す。
//
// 存在しないディレクトリはエラーにする。打ち間違えるとグロブが何にも一致せず、
// エラーも出ないまま「何もビルドされない」状態になって気付けないため。
const resolveScope = (raw, { images, cwd = process.cwd() } = {}) => {
  const names = String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter(Boolean);

  if (names.length === 0) return null;

  // flat は srcImg/sub → img/sub で、srcImg の下が案件ディレクトリに対応しない。
  // 1リポジトリ1案件の構成なので、絞るという考え方自体が当てはまらない。
  if (images !== 'perPage') {
    throw new Error(
      `lp-build: ${SCOPE_ENV} は images: 'perPage' のプロジェクトでのみ使えます。\n` +
        `       このプロジェクトは images: ${JSON.stringify(images)} です。`
    );
  }

  for (const name of names) {
    if (
      GLOB_CHARS.test(name) ||
      path.isAbsolute(name) ||
      name.split('/').includes('..')
    ) {
      throw new Error(
        `lp-build: ${SCOPE_ENV} に使えない値が含まれています: ${JSON.stringify(name)}\n` +
          `       案件のディレクトリ名をカンマ区切りで指定してください。例: ${SCOPE_ENV}=shutocari,shinshade`
      );
    }

    const dir = path.join(cwd, name);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(
        `lp-build: ${SCOPE_ENV} で指定したディレクトリがありません: ${JSON.stringify(name)}\n` +
          `       綴りを確認してください。`
      );
    }
  }

  return names;
};

module.exports = { SCOPE_ENV, resolveScope };
