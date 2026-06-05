#!/usr/bin/env node
// Task #2 — 登録 CI ゲートテスト。check-pr.mjs(= PR で走る客観検査)が、準拠 openapi を
// pass・非準拠を fail にすることを確認する。承認ゲートでなく形式+402 の客観チェック。
//   使い方: node tests/ci-gate.contract.mjs
//   GOOD_OPENAPI / BAD_ORIGIN env で対象を差し替え可。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (n, ok, d = '') => results.push({ n, ok: !!ok, d });

function runCheck(url) {
  try {
    return execFileSync('node', ['check-pr.mjs', url], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

// 準拠 = 登録済み供給者の openapi（JPYC/Polygon 有料 op + 402）。
const GOOD = process.env.GOOD_OPENAPI ?? 'https://www.paylog.dev/openapi.json';
// 非準拠 = openapi を持たないオリジン（/openapi.json も .well-known も無い）。
const BAD = process.env.BAD_ORIGIN ?? 'https://jp402.com';

const g = runCheck(GOOD);
check('#2 準拠 openapi → pass', /1\/1 passed/.test(g), g.trim().split('\n').slice(-2).join(' '));

const b = runCheck(BAD);
check('#2 非準拠(openapi無し) → fail', /0\/1 passed/.test(b), b.trim().split('\n').slice(-2).join(' '));

console.log('=== Task #2 登録 CI ゲート ===');
let fail = 0;
for (const { n, ok, d } of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${n}${d && !ok ? `  [${d}]` : ''}`);
  if (!ok) fail++;
}
console.log(`\n  結果: ${results.length - fail}/${results.length} PASS${fail ? ` / ${fail} FAIL` : ' — 全PASS'}`);
process.exit(fail ? 1 : 0);
