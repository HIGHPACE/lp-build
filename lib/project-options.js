// プロジェクトの gulpfile.js に渡されたオプションを、gulp を経由せずに読む。
//
// pre-commit の CLI（bin/scss-targets.js）は gulp のタスクを通らないため、
// これが無いと exclude を知りようがない。知らずに動くと除外したはずの
// ディレクトリが CLI の対象になり、生成されない .css.map を git add しようと
// して pre-commit が失敗し、そのディレクトリの SCSS をコミットできなくなる
// （v1.2.0 で sbivc の lp02-b/ に実際に起きた）。
//
// 除外の判定を CLI 側に書き写すのではなく gulpfile を読む形にしているのは、
// exclude の指定場所を1箇所に保つため。書き写すと必ずずれる。
const fs = require('node:fs');
const path = require('node:path');

const { OPTIONS_ONLY_ENV, lastResolvedOptions } = require('../index');

// gulpfile.js を読み込んでオプションを取り出す。gulpfile が無ければ null。
//
// 読み込み中は OPTIONS_ONLY を立てて、タスク登録（gulp と browser-sync の
// 読み込み）をスキップさせる。pre-commit は SCSS を保存するたびに通る経路で、
// browser-sync まで読むと体感に出るため。
const readOptions = (cwd = process.cwd()) => {
  const gulpfile = path.join(cwd, 'gulpfile.js');
  if (!fs.existsSync(gulpfile)) return null;

  const prev = process.env[OPTIONS_ONLY_ENV];
  process.env[OPTIONS_ONLY_ENV] = '1';
  try {
    require(gulpfile);
  } finally {
    if (prev === undefined) delete process.env[OPTIONS_ONLY_ENV];
    else process.env[OPTIONS_ONLY_ENV] = prev;
  }

  return lastResolvedOptions();
};

const readExcludes = (cwd) => {
  const opts = readOptions(cwd);
  return opts ? opts.exclude : [];
};

module.exports = { readOptions, readExcludes };
