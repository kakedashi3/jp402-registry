# jp402-registry

**JPYC で売っているサービスを、AI エージェントに見つけてもらうための公開リスト。**

売り手は「登録」すると、JPYC で支払う AI エージェントの発見対象になります。このリポジトリは、その**標準フォーマット**と**登録台帳**を持ちます。

> ⚠️ 有志による**非公式**なコミュニティ・プロジェクトです。JPYC 株式会社とは関係ありません(JPYC は同社の登録商標)。"jp402" は決済プロトコル x402 の日本(JPYC)向け準拠拡張を指す呼称です。

---

## これは誰のため？

- **売り手**（JPYC × x402 で API・商品を売っている人）→ AI エージェントに発見してもらいたい人
- **エージェント開発者**（買い手側）→ 「JPYC で何が買えるか」の一覧が欲しい人

## 全体像（30 秒で）

```
売り手                                          AI エージェント(買い手)
  │                                                    ▲
  │ ① 自分のサイトに catalog を置く (publish)          │ 一覧を取得して
  │ ② このリストに URL を1行 PR (登録)                 │ どこで買うか選ぶ
  ▼                                                    │
[ jp402-registry ] ──③ scan が検証 + T番号裏取り──> [ サービス一覧 ]
   (このリポジトリ)        registered / verified を付与
```

---

# 売り手の登録：4 ステップ

> 🌐 **登録ページ**（[`docs/index.html`](docs/index.html)、GitHub Pages・バックエンドなし）でフォームに入れると、②の catalog JSON と③の registry エントリを生成し、PR まで誘導します。手で書く場合は以下。
>
> 登録は PR 経由なので、**「誰が・どのサービスで載りたがったか」が公開 PR として可視化**されます（registry.json の git 履歴 + PR 一覧 = 需要ログ）。分析基盤は持たず、GitHub の仕組みだけで需要を観測します。

## Step 1 — カタログ JSON を作る

下をコピーして、`YOUR_...` の箇所をあなたの値に置き換えてください。

```json
{
  "catalog": {
    "spec": "jp402-catalog/0.1",
    "baseSpec": "x402-bazaar-discovery/2",
    "publisher": "YOUR_SHOP_NAME"
  },
  "services": [
    {
      "resource": "https://YOUR_DOMAIN/api/buy",
      "accepts": [
        {
          "scheme": "exact",
          "network": "eip155:137",
          "asset": "0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB",
          "payTo": "0xYOUR_WALLET_ADDRESS",
          "maxAmountRequired": "1500"
        }
      ],
      "x-jp402": {
        "currency": "JPYC",
        "invoice": {
          "qualifiedIssuer": true,
          "registrationNumber": "T0000000000000"
        }
      }
    }
  ]
}
```

埋める値：

| 場所 | 何を入れる |
|---|---|
| `publisher` | あなたの屋号・サービス名 |
| `resource` | 402 を返す API の URL |
| `asset` | 支払いトークンの contract（JPYC on Polygon の例は上の通り） |
| `network` | `eip155:137` = Polygon |
| `payTo` | 受取ウォレットアドレス（`0x...`） |
| `maxAmountRequired` | 価格（最小単位の文字列） |
| `registrationNumber` | 適格請求書発行事業者番号（`T` + 13 桁。無ければ `x-jp402` ごと省略可） |

> `registered` や `verified` は**書きません**。登録後に scan 側が自動で付けます（`verified` は T番号を国税庁の API で実在確認した結果。自分では名乗れません）。

## Step 2 — 自分のサイトに置く（publish）

作った JSON を、あなたのサイトの **`/.well-known/x402-catalog.json`** で公開します。

- **Next.js**: `public/.well-known/x402-catalog.json` に置く
- **静的サイト / その他**: 公開ディレクトリの `.well-known/x402-catalog.json` に置く

置けたか確認：

```bash
curl https://YOUR_DOMAIN/.well-known/x402-catalog.json
```

JSON がそのまま返ればOKです。

## Step 3 —（推奨）形式が正しいか検証する

このリポジトリの検証ツールで、公開した URL をチェックできます。

```bash
git clone https://github.com/kakedashi3/jp402-registry
cd jp402-registry
npm install
node validate.mjs https://YOUR_DOMAIN/.well-known/x402-catalog.json
```

`✓ valid x-jp402 catalog` と出れば次へ。エラーが出たら、表示された箇所を直してください。

## Step 4 — このリストに登録する（PR）

[`registry.json`](registry.json) の `entries` に、**URL を 1 行だけ**追加して Pull Request を出します。

```json
{ "catalog_url": "https://YOUR_DOMAIN/.well-known/x402-catalog.json" }
```

GitHub CLI を使う場合の例：

```bash
# fork して clone 済みの jp402-registry で
# registry.json の "entries": [] に上の1行を追記して保存したあと:
git switch -c add-YOUR_SHOP_NAME
git commit -am "register: YOUR_SHOP_NAME"
gh pr create --fill
```

PR には**カタログの中身ではなく URL だけ**を書きます（中身はあなたのサイト側が正です）。

### マージの条件（人の承認ではなく、自動チェック）

PR を出すと CI（[`check-pr.mjs`](check-pr.mjs)）が、**新しく追加された URL だけ**を自動検査します：

1. **x-jp402 スキーマに準拠しているか**
2. **各 `resource` が実際に `402` を返すか**（= 生きた x402 エンドポイントか）

両方を満たせば通過 → **人の承認なしでマージ可能**です。これは「運営が良し悪しを判断する」承認ゲートではなく、**客観的な疎通チェック**（スパム・空登録を弾くため）。既知の悪性は別途 denylist で除外します。

ローカルで同じ検査を試せます：
```bash
node check-pr.mjs https://YOUR_DOMAIN/.well-known/x402-catalog.json
```

## あとは自動

マージ後、scan エンジンが URL をクロールして、

1. 形式を検証
2. **T番号を国税庁 適格請求書 Web-API で実在確認**
3. `registered` / `verified` と[信頼シグナル](TRUST.md)を付与

これで、JPYC で支払う AI エージェントの発見対象になります。

> 📝 **メモ（構築中）**: 上記 2 の **国税庁 適格請求書 Web-API は未取得（申請前）**です。現時点では `verified`（T番号の実在裏取り）は**未稼働**で、scan エンジン側で構築中。当面は **`registered`（登録済）＋ 形式検証 ＋ 402 生存チェック** までが有効で、`verified` は API 取得後に有効化します。

---

## エージェント開発者（買い手）向け

MCP サーバーや購買 CLI からの接続手順・データ契約・参照実装は **[CONNECT.md](CONNECT.md)** にまとめています。要点：

- **本線**：scan エンジンの list API（`GET {SCAN_API}/services?q=...`）を引く。trust 信号・ランク込み
- **フォールバック**：[`registry.json`](registry.json) を直読みし、各 `catalog_url` を取得して列挙
- **ランク**：`verified` > `registered` > 実績。合成スコアは無いので重み付けは各 agent の policy で
- **参照実装**：[`@yen402/mcp`](https://github.com/kakedashi3/yen402-mcp) の `discover_jpyc_resources`。同じ `?q=` は Kova のような別の買い手エージェントからも叩けます

---

## よくある質問

- **登録は無料？** → はい。手数料はありません。
- **登録したら上位に出る？** → いいえ。「載る」と「信頼される」は別です。信頼は実績シグナル（[TRUST.md](TRUST.md)）で可視化され、新規は「実績なし」と正直に表示されます。
- **信頼シグナルは透明？** → はい。**4 軸の算出方法（[TRUST.md](TRUST.md)）も、各サービスの算出値（[signals.json](signals.json)）も公開**します。元データは public な on-chain / 公的 API なので誰でも再現・検証できます。ブラックボックスの合成スコアは作りません（生の軸値を出し、重み付けは利用側 agent に委ねる）。
- **T番号がない（免税事業者）** → `x-jp402.invoice` を省略して登録できます。`verified` は付きませんが listing は可能です。
- **やめたい / 消したい** → `registry.json` から自分の行を消す PR を出すか、`.well-known` を下げてください。
- **登録ページはある？** → はい（[`docs/index.html`](docs/index.html)、GitHub Pages・バックエンドなし）。フォームで catalog JSON と registry エントリを生成し、PR まで誘導します。登録の実体は PR なので、誰が載りたいか（需要）が公開 PR として残ります。

---

## このリポジトリの中身（と、入っていないもの）

| ある | ない（別管理） |
|---|---|
| `schema/x-jp402.schema.json` — カタログの形式 | 信頼シグナルの**計算実装**(engine、private) |
| `registry.json` — 登録台帳（PR 先） | クロール・T番号裏取りの実装 |
| `TRUST.md` — 信頼シグナル 4 軸の**算出方法**(透明) | サービス一覧 API の serve |
| `signals.json` — 各サービスの**算出値**(engine が populate、透明) | |
| `validate.mjs` — 検証ツール（catalog / registry / signals） | |

依存の向きは一方向：このリポジトリ（標準・台帳・公開値）を、外部の scan エンジンが**読み書き**する。**公開するのは「方法」と「値」、隠すのは engine の実装コードだけ**（値は誰でも再現できるので透明性は損なわれない）。

## License

MIT © kakedashi3
