# 買い手エージェント / MCP からの接続

JPYC で支払う買い手エージェント（MCP サーバーや CLI）が、このレジストリを「どこで買うか」の発見元として使うための接続ガイド。**標準フォーマットなので、特定の実装に縛られず誰でも同じ口を叩けます。**

## 2 つの接続経路

```
[ jp402-registry (public) ]     標準・台帳・signals(値)
  registry.json / schema / signals.json
        │ 読む(クロール + 集計 + signal 計算)
        ▼
[ scan エンジン (別管理 / API は public) ]
  GET {SCAN_API}/services?q=...        ← ★本線
        │
        ▼
[ あなたの MCP / agent ]  discover → inspect → x402 で購入
```

### 本線：scan エンジンの list API（推奨）
trust 信号・ランク・on-chain 実測込みの**集約済み**一覧を1リクエストで取得。

```
GET {SCAN_API}/services?q=<keyword>&network=eip155:137
```

レスポンス：
```json
{ "services": [{
    "name": "○○コーヒー",
    "resource": "https://shop.example.jp/api/buy",
    "network": "eip155:137",
    "asset": "0x…JPYC",
    "payTo": "0x…",
    "maxAmountRequired": "1500000000000000000000",
    "x-jp402": { "currency": "JPYC", "invoice": { "registrationNumber": "T…" } },
    "registered": true,
    "verified": null,
    "signals": { "paymentTrackRecord": { "txCount": 0 }, "addressConsistency": { "consistent": true } }
}] }
```
- `resource` / `payTo` をそのまま x402 購入フローに渡せる
- `registered` / `verified` / `signals` でランク・足切り（信号の意味は [TRUST.md](TRUST.md)）
- `verified` は T番号の実在検証結果（**【構築中】国税庁 API 未取得のため当面 `null`**）

### フォールバック：registry.json を直読み（signals なし）
scan が不達のとき、台帳から各カタログを自分で引く（このリポジトリが public のとき有効）。

```
GET https://raw.githubusercontent.com/kakedashi3/jp402-registry/main/registry.json
  → entries[].catalog_url を fetch
  → 各 .well-known/x402-catalog.json の services を列挙
```

## 推奨の振る舞い

1. **本線（scan list API）→ 空/失敗ならフォールバック（registry 直読み）→ それも無ければ自前カタログ**、の順でグレースフルに
2. **ランク**：`verified` > `registered` > `signals.paymentTrackRecord.txCount`。ブラックボックスの合成スコアは無いので、**重み付けは各 agent が自分の policy で**決める
3. **`x-jp402.schema.json` を vendor して parse/検証**（標準なのでコピー利用可）
4. タイムアウト + 短期キャッシュ（list API が事前集計する役割。毎回全カタログ fetch は避ける）

## 設定（環境変数の例）

参照実装（`@yen402/mcp`）はこの env を使う。あなたの実装でも踏襲推奨：

| env | 既定 | 役割 |
|---|---|---|
| `JP402_SCAN_API` | `https://jp402.com/api` | scan list API（本線）。一覧は `GET {JP402_SCAN_API}/services` |
| `JP402_REGISTRY_URL` | (未設定) | `registry.json` の raw URL（static フォールバック） |
| `JP402_TIMEOUT_MS` | `6000` | ライブ取得タイムアウト |
| `JP402_DISCOVERY` | (on) | `off` でライブ発見を無効化 |

## 参照実装

- **`@yen402/mcp`** の `discover_jpyc_resources` ツール（`src/jp402-registry.ts` + `src/tools/discover.ts`）。list API → registry フォールバック → 自前カタログのマージ + ランクを実装済み。
- 同じ `?q=` インターフェースは、別の買い手エージェント（例：Kova のような自律購買 CLI）からも叩けます。**買い手の実行（署名・policy）は各自のまま、発見だけこのレジストリに乗せる**形が想定です。

## 最小の擬似コード

```js
const SCAN = process.env.JP402_SCAN_API ?? "https://jp402.com/api";
async function discover(query) {
  // 1) 本線（jp402 の list API。signals/registered 込み）
  try {
    const r = await fetch(`${SCAN}/services`);
    if (r.ok) {
      const { services } = await r.json();
      if (services?.length) return rank(services.filter(s => !query || JSON.stringify(s).includes(query)));
    }
  } catch {}
  // 2) フォールバック: registry 直読み（public 時）。entry は openapi_url / url / catalog_url。
  if (process.env.JP402_REGISTRY_URL) {
    const reg = await (await fetch(process.env.JP402_REGISTRY_URL)).json();
    const out = [];
    for (const e of reg.entries ?? []) {
      const src = e.openapi_url ?? (e.url ? `${e.url.replace(/\/+$/,'')}/openapi.json` : e.catalog_url);
      try { out.push(...resolve(await (await fetch(src)).json())); } catch {} // resolve: OpenAPI/catalog → services[]
    }
    return rank(out.filter(s => !query || JSON.stringify(s).includes(query)));
  }
  return [];
}
// rank: verified > registered > txCount
```
