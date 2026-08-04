#!/usr/bin/env node
// pre-commit フックから呼ばれる CLI。
// 環境変数 SCSS_FILES（改行区切り）を読み、コンパイル対象のエントリ（既定）か
// 出力先 CSS（--outputs）を1行ずつ標準出力に出す。
const { resolveEntries, cssOutputsFor } = require('../lib/scss-targets');

const entries = resolveEntries(process.env.SCSS_FILES);
const list = process.argv.includes('--outputs') ? cssOutputsFor(entries) : entries;
if (list.length > 0) process.stdout.write(list.join('\n') + '\n');
