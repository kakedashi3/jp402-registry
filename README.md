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

**承認ゲートはありません。** 形式が正しければマージされます（弾くのは既知の悪性のみ＝denylist）。

## あとは自動

マージ後、scan エンジンが URL をクロールして、

1. 形式を検証
2. **T番号を国税庁 適格請求書 Web-API で実在確認**
3. `registered` / `verified` と[信頼シグナル](TRUST.md)を付与

これで、JPYC で支払う AI エージェントの発見対象になります。

---

## エージェント開発者（買い手）向け

登録されたサービス一覧は、scan エンジンが提供する list API から取得します（提供形態は別途）。最小には、このリポジトリの [`registry.json`](registry.json) の URL 群を読み、各 `catalog_url` を取得すれば、JPYC × x402 サービスを列挙できます。

---

## よくある質問

- **登録は無料？** → はい。手数料はありません。
- **登録したら上位に出る？** → いいえ。「載る」と「信頼される」は別です。信頼は実績シグナル（[TRUST.md](TRUST.md)）で可視化され、新規は「実績なし」と正直に表示されます。
- **T番号がない（免税事業者）** → `x-jp402.invoice` を省略して登録できます。`verified` は付きませんが listing は可能です。
- **やめたい / 消したい** → `registry.json` から自分の行を消す PR を出すか、`.well-known` を下げてください。
- **GitHub に不慣れ** → まずは Step 1〜2（publish）だけでも、準拠カタログとして価値があります。PR は後からで構いません。

---

## このリポジトリの中身（と、入っていないもの）

| ある | ない（別管理） |
|---|---|
| `schema/x-jp402.schema.json` — カタログの形式 | on-chain 実測・信頼スコア計算 |
| `registry.json` — 登録台帳（PR 先） | クロール・T番号裏取りの実装 |
| `TRUST.md` — 信頼シグナル 4 軸の定義 | サービス一覧 API の serve |
| `validate.mjs` — 検証ツール | |

依存の向きは一方向：このリポジトリ（標準・台帳）を、外部の scan エンジンが**読む**だけ。

## License

MIT © kakedashi3
