#!/usr/bin/env node
// PR ゲート: registry.json に新規追加された entry を客観チェックする(承認ではなく自動検査)。
// 多形式 reader(Postel の法則) — discovery 正典 = OpenAPI(x402scan spec)、最終真実 = runtime 402。
//   entry 形式: { openapi_url } | { url }(→/openapi.json 優先, 無ければ /.well-known/x402-catalog.json) | { catalog_url }(後方互換)
//   検査:
//     OpenAPI  → 必須項目(openapi/info.title/info.version/paths) + JPYC(Polygon) 有料 op(x-payment-info)存在
//                + 有料 op に responses.402 + 具体 resource は 402 probe(テンプレートは宣言ベース)
//     catalog  → x-jp402 schema 準拠 + 各 resource が 402(従来)
// 参照: https://www.x402scan.com/discovery/spec
// 使い方:
//   node check-pr.mjs                       origin/main との差分(新規 entry)を検査 [CI]
//   node check-pr.mjs <openapi.json url>    OpenAPI を単体検査 [ローカル]
//   node check-pr.mjs <catalog url>         Bazaar catalog を単体検査 [ローカル]
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const TIMEOUT_MS = 10000
const JPYC = '0xe7c3d8c9a439fede00d2600032d5db0be71c3c29'
const NET = 'eip155:137'
const here = (p) => new URL(p, import.meta.url)

async function loadCatalogValidator() {
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

async function fetchJson(url) {
  try {
    const res = await fetchTimeout(url)
    if (!res.ok) return { err: `fetch ${res.status}: ${url}` }
    return { doc: await res.json() }
  } catch (e) { return { err: `fetch failed: ${url} (${e.message})` } }
}

const isTemplated = (url) => /\{[^}]+\}/.test(url)

// ---- OpenAPI 検査(x402scan spec) ----
async function checkOpenApi(doc, sourceUrl) {
  const problems = []
  if (typeof doc?.openapi !== 'string') problems.push('OpenAPI: 必須 `openapi` 欠落')
  if (!doc?.info?.title) problems.push('OpenAPI: 必須 `info.title` 欠落')
  if (!doc?.info?.version) problems.push('OpenAPI: 必須 `info.version` 欠落')
  if (!doc?.info?.['x-guidance']) problems.push('OpenAPI(warn): `info.x-guidance` 推奨(agent 向け案内)')
  if (!doc?.paths || typeof doc.paths !== 'object') { problems.push('OpenAPI: `paths` 欠落'); return problems }

  let base = ''
  const server = Array.isArray(doc.servers) ? doc.servers[0]?.url : undefined
  if (typeof server === 'string' && /^https?:\/\//i.test(server)) base = server.replace(/\/+$/, '')
  else { try { base = new URL(sourceUrl).origin } catch { /* */ } }

  let paidJpyc = 0
  for (const [pathKey, ops] of Object.entries(doc.paths)) {
    if (!ops || typeof ops !== 'object') continue
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = ops[method]
      if (!op) continue
      const xp = op['x-payment-info']
      if (!xp) continue // 有料 op のみ対象(free/siwx は検査外)
      const x402 = Array.isArray(xp.protocols) ? xp.protocols.map((p) => p?.x402).find(Boolean) : undefined
      if ((x402?.network ?? '') !== NET || (x402?.asset ?? '').toLowerCase() !== JPYC) continue
      paidJpyc++
      const label = `${method.toUpperCase()} ${pathKey}`
      if (!xp.price?.mode) problems.push(`${label}: x-payment-info.price.mode 欠落(fixed/dynamic)`)
      if (!op.responses?.['402']) problems.push(`${label}: responses.402 欠落(有料宣言なのに 402 未定義)`)
      const ok200 = op.responses?.['200']?.content && Object.keys(op.responses['200'].content).length > 0
      if (!ok200) problems.push(`${label}(warn): 200 の出力 schema が無い`)
      // probe: 具体 resource のみ 402 を確認(テンプレート or 必須パラメータ有りは宣言ベース=runtime 402 が真実)
      const params = [...(ops.parameters ?? []), ...(op.parameters ?? [])]
      const hasRequiredParam = params.some((p) => p?.required)
      const resource = `${base}${pathKey}`
      if (isTemplated(resource) || hasRequiredParam) {
        console.log(`    ~ ${label}: パラメータ要 resource は probe 省略(runtime 402 が真実)`)
      } else {
        try {
          const res = await fetchTimeout(resource)
          if (res.status !== 402) problems.push(`${label}: ${resource} -> HTTP ${res.status}(expected 402)`)
        } catch (e) { problems.push(`${label}: probe 失敗 ${resource}(${e.message})`) }
      }
    }
  }
  if (paidJpyc === 0) problems.push('OpenAPI: JPYC(Polygon) の有料 operation(x-payment-info)が無い')
  return problems
}

// ---- Bazaar catalog 検査(後方互換) ----
async function checkCatalog(validate, doc) {
  const problems = []
  if (!validate(doc)) {
    for (const err of validate.errors) problems.push(`schema ${err.instancePath || '/'} ${err.message}`)
    return problems
  }
  for (const svc of doc.services ?? []) {
    const r = svc.resource
    if (isTemplated(r)) { console.log(`    ~ ${r}: テンプレート resource は probe 省略`); continue }
    try {
      const res = await fetchTimeout(r)
      if (res.status !== 402) problems.push(`resource ${r} -> HTTP ${res.status}(expected 402)`)
    } catch (e) { problems.push(`resource probe 失敗: ${r}(${e.message})`) }
  }
  return problems
}

// entry を解決して検査
async function checkEntry(catalogValidate, entry) {
  if (entry.openapi_url) {
    const { doc, err } = await fetchJson(entry.openapi_url)
    if (err) return [`OpenAPI ${err}`]
    return checkOpenApi(doc, entry.openapi_url)
  }
  if (entry.url) {
    const b = entry.url.replace(/\/+$/, '')
    const o = await fetchJson(`${b}/openapi.json`)
    if (o.doc) return checkOpenApi(o.doc, `${b}/openapi.json`)
    const c = await fetchJson(`${b}/.well-known/x402-catalog.json`)
    if (c.doc) return checkCatalog(catalogValidate, c.doc)
    return [`Not Found: ${b}/openapi.json も /.well-known/x402-catalog.json も取得不可`]
  }
  if (entry.catalog_url) {
    const { doc, err } = await fetchJson(entry.catalog_url)
    if (err) return [`catalog ${err}`]
    return checkCatalog(catalogValidate, doc)
  }
  return ['entry に openapi_url / url / catalog_url のいずれも無い']
}

const entryKey = (e) => e.openapi_url || e.url || e.catalog_url || JSON.stringify(e)

function baseEntries() {
  try {
    const raw = execFileSync('git', ['show', 'origin/main:registry.json'], { encoding: 'utf8' })
    return JSON.parse(raw).entries ?? []
  } catch { return null }
}

// ---- main ----
const catalogValidate = await loadCatalogValidator()
const arg = process.argv[2]

let entries
if (arg && /^https?:\/\//.test(arg)) {
  if (arg.endsWith('.well-known/x402-catalog.json')) entries = [{ catalog_url: arg }]
  else if (arg.endsWith('openapi.json')) entries = [{ openapi_url: arg }]
  else entries = [{ url: arg.replace(/\/+$/, '') }]
} else {
  const head = JSON.parse(await readFile(here('./registry.json'), 'utf8'))
  const headEntries = head.entries ?? []
  const base = baseEntries()
  if (base === null) {
    console.warn('! base(origin/main) 取得不可 → 全 entry を検査')
    entries = headEntries
  } else {
    const baseSet = new Set(base.map(entryKey))
    entries = headEntries.filter((e) => !baseSet.has(entryKey(e)))
  }
}

if (entries.length === 0) { console.log('✓ 新規 entry なし(検査対象なし)'); process.exit(0) }

let failed = 0
for (const e of entries) {
  const key = entryKey(e)
  const problems = await checkEntry(catalogValidate, e)
  const hard = problems.filter((p) => !/\(warn\)/.test(p))
  if (hard.length === 0) {
    console.log(`✓ ${key}`)
    for (const p of problems) console.warn(`    ${p}`)
  } else {
    failed++
    console.error(`✗ ${key}`)
    for (const p of problems) console.error(`    ${p}`)
  }
}
console.log(`\n${entries.length - failed}/${entries.length} passed`)
process.exit(failed ? 1 : 0)
