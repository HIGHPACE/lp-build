// 変更／ステージされた SCSS のリストから、コンパイル対象のエントリ SCSS と
// その出力先（.css / .css.map / .min.css）を解決する。
// lib/css.js の css:staged、lib/watch.js の監視、bin/scss-targets.js が使うため、
// 「どのファイルを再生成するか」の判定はここだけに存在する。
const fs = require('node:fs');
const path = require('node:path');
const picomatch = require('picomatch');

// パーシャル（_*.scss）は単体でコンパイルできないので、同一ディレクトリの
// エントリ SCSS に読み替える。
// LP のディレクトリ構成ではパーシャルとエントリが同じ css/ に同居しており、
// ディレクトリを跨ぐ @use / @import / @forward は使われていない。
//
// excludes は gulpfile の exclude オプションと同じパターン。
// 除外したディレクトリを保存しても何も起きないようにするため、ここでも落とす。
const resolveEntries = (raw, excludes = []) => {
  const isExcluded = excludes.length > 0 ? picomatch(excludes) : () => false;

  const inputs = String(raw || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.scss'))
    .filter((s) => !isExcluded(s));

  const entries = new Set();

  for (const rel of inputs) {
    if (!path.basename(rel).startsWith('_')) {
      // エントリそのもの。削除された SCSS は対象外
      if (fs.existsSync(rel)) entries.add(rel);
      continue;
    }

    const dir = path.dirname(rel);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.scss') && !name.startsWith('_')) {
        const p = path.join(dir, name);
        if (!isExcluded(p)) entries.add(p);
      }
    }
  }

  return [...entries].sort();
};

// エントリ SCSS に対応する出力。
// 展開形も圧縮形も .css / .min.css とそれぞれの .map を返す。
// .min.css は存在しなくても必ず生成されるので、無条件に返す
// （lib/css.js の compileOne と揃える。ここで落とすと新規生成された
//  .min.css が pre-commit の git add から漏れる）。
const cssOutputsFor = (entries) => {
  const outputs = [];
  for (const rel of entries) {
    const cssPath = rel.replace(/\.scss$/, '.css');
    outputs.push(cssPath, cssPath + '.map');
    const min = rel.replace(/\.scss$/, '.min.css');
    outputs.push(min, min + '.map');
  }
  return outputs;
};

module.exports = { resolveEntries, cssOutputsFor };
