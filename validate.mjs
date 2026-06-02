#!/usr/bin/env node
// jp402 カタログ / 台帳の検証ツール(エンジン非依存・スタンドアロン)。
// 使い方:
//   node validate.mjs <catalog-file-or-url>   カタログを x-jp402 schema で検証
//   node validate.mjs --registry              registry.json の形式を検証
//   node validate.mjs --self                  schema 自体がコンパイルできるか確認
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const SCHEMA_PATH = new URL('./schema/x-jp402.schema.json', import.meta.url)

async function loadSchema() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'))
  return ajv.compile(schema)
}

async function readJson(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`fetch ${src} -> ${res.status}`)
    return res.json()
  }
  return JSON.parse(await readFile(src, 'utf8'))
}

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1) }
function ok(msg) { console.log(`✓ ${msg}`) }

const arg = process.argv[2]

if (!arg || arg === '--self') {
  await loadSchema()
  ok('schema compiles (x-jp402.schema.json)')
  if (!arg) console.log('usage: node validate.mjs <catalog-file-or-url> | --registry | --self')
  process.exit(0)
}

if (arg === '--registry') {
  const reg = await readJson(new URL('./registry.json', import.meta.url).pathname)
  if (!Array.isArray(reg.entries)) fail('registry.json: entries が配列でない')
  for (const [i, e] of reg.entries.entries()) {
    if (typeof e?.catalog_url !== 'string' || !/^https?:\/\//.test(e.catalog_url))
      fail(`registry.json: entries[${i}].catalog_url が URL でない`)
  }
  ok(`registry.json OK (${reg.entries.length} entries)`)
  process.exit(0)
}

// それ以外 = カタログ検証
const validate = await loadSchema()
const doc = await readJson(arg)
if (validate(doc)) {
  ok(`valid x-jp402 catalog: ${arg}`)
} else {
  console.error(`✗ invalid: ${arg}`)
  for (const err of validate.errors) console.error(`  ${err.instancePath || '/'} ${err.message}`)
  process.exit(1)
}
