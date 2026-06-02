#!/usr/bin/env node
// PR ゲート: registry.json に新規追加された catalog_url を客観チェックする。
//   ① x-jp402 schema に準拠しているか
//   ② 各 service.resource が実際に 402 (Payment Required) を返すか(= 生きた x402 か)
// 承認(人の判断)ではなく自動検査。通れば maintainer なしでもマージ可。
// 使い方:
//   node check-pr.mjs                  origin/main との差分(新規 entry)を検査 [CI]
//   node check-pr.mjs <catalog-url>    指定 URL を単体検査 [ローカル確認]
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const TIMEOUT_MS = 10000
const here = (p) => new URL(p, import.meta.url)

async function loadValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(JSON.parse(await readFile(here('./schema/x-jp402.schema.json'), 'utf8')))
}

async function fetchTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try { return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' }) }
  finally { clearTimeout(t) }
}

async function checkCatalog(validate, url) {
  const problems = []
  let doc
  try {
    const res = await fetchTimeout(url)
    if (!res.ok) return [`catalog fetch ${res.status}: ${url}`]
    doc = await res.json()
  } catch (e) { return [`catalog fetch failed (${e.message})`] }

  if (!validate(doc)) {
    for (const err of validate.errors) problems.push(`schema ${err.instancePath || '/'} ${err.message}`)
    return problems // schema NG なら 402 検査まで行かない
  }

  for (const svc of doc.services ?? []) {
    const r = svc.resource
    try {
      const res = await fetchTimeout(r)
      if (res.status !== 402) problems.push(`resource ${r} -> HTTP ${res.status} (expected 402)`)
    } catch (e) { problems.push(`resource probe failed: ${r} (${e.message})`) }
  }
  return problems
}

function baseEntries() {
  try {
    const raw = execFileSync('git', ['show', 'origin/main:registry.json'], { encoding: 'utf8' })
    return JSON.parse(raw).entries ?? []
  } catch { return null } // base 取得不可
}

const validate = await loadValidator()
const arg = process.argv[2]

let urls
if (arg && /^https?:\/\//.test(arg)) {
  urls = [arg]
} else {
  const head = JSON.parse(await readFile(here('./registry.json'), 'utf8'))
  const headUrls = (head.entries ?? []).map((e) => e.catalog_url).filter(Boolean)
  const base = baseEntries()
  if (base === null) {
    console.warn('! base(origin/main) 取得不可 → 全 entry を検査')
    urls = headUrls
  } else {
    const baseSet = new Set(base.map((e) => e.catalog_url))
    urls = headUrls.filter((u) => !baseSet.has(u))
  }
}

if (urls.length === 0) { console.log('✓ 新規 entry なし(検査対象なし)'); process.exit(0) }

let failed = 0
for (const url of urls) {
  const problems = await checkCatalog(validate, url)
  if (problems.length === 0) console.log(`✓ ${url}`)
  else { failed++; console.error(`✗ ${url}`); for (const p of problems) console.error(`    ${p}`) }
}
console.log(`\n${urls.length - failed}/${urls.length} passed`)
process.exit(failed ? 1 : 0)
