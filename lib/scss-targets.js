// 変更／ステージされた SCSS のリストから、コンパイル対象のエントリ SCSS と
// その出力先 CSS を解決する。
// lib/css.js の css:staged、lib/watch.js の監視、bin/scss-targets.js が使うため、
// 「どのファイルを再生成するか」の判定はここだけに存在する。
const fs = require('node:fs');
const path = require('node:path');

// パーシャル（_*.scss）は単体でコンパイルできないので、同一ディレクトリの
// エントリ SCSS に読み替える。
// LP のディレクトリ構成ではパーシャルとエントリが同じ css/ に同居しており、
// ディレクトリを跨ぐ @use / @import / @forward は使われていない。
const resolveEntries = (raw) => {
  const inputs = String(raw || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.scss'));

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
        entries.add(path.join(dir, name));
      }
    }
  }

  return [...entries].sort();
};

// エントリ SCSS に対応する出力 CSS。
// .css は必ず生成される。.min.css は既に存在するページのみ更新する仕様なので、
// 存在するものだけを返す。
const cssOutputsFor = (entries) => {
  const outputs = [];
  for (const rel of entries) {
    outputs.push(rel.replace(/\.scss$/, '.css'));
    const min = rel.replace(/\.scss$/, '.min.css');
    if (fs.existsSync(min)) outputs.push(min);
  }
  return outputs;
};

module.exports = { resolveEntries, cssOutputsFor };
