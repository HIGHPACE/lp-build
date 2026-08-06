#!/usr/bin/env node
// pre-commit フックから呼ばれる CLI。
// 環境変数 SCSS_FILES（改行区切り）を読み、コンパイル対象のエントリ（既定）か
// 出力先 CSS（--outputs）を1行ずつ標準出力に出す。
//
// 除外設定は gulpfile.js から読む。ここで exclude を無視すると、
// 除外したディレクトリの出力を git add しようとして pre-commit が失敗する。
const { resolveEntries, cssOutputsFor } = require('../lib/scss-targets');
const { readExcludes } = require('../lib/project-options');

const entries = resolveEntries(process.env.SCSS_FILES, readExcludes());
const list = process.argv.includes('--outputs') ? cssOutputsFor(entries) : entries;
if (list.length > 0) process.stdout.write(list.join('\n') + '\n');
