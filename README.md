# jp402-registry

**JPYC × x402 の発見可能性のための、公開標準 + opt-in 登録台帳。**

エージェントが「日本円(JPYC)で何が買えるか」を見つけ、売り手が「自分のサービスを agent に発見させる」ための、準拠ベースのレジストリです。中央の審査台帳ではなく、**準拠すれば載る + 信頼はシグナルで可視化する**設計。

> ⚠️ これは有志による非公式なコミュニティ・プロジェクトです。JPYC 株式会社とは関係ありません(JPYC は同社の登録商標)。"jp402" は x402(HTTP-native 決済プロトコル)の日本向け準拠拡張を指す呼称です。

---

## 何が入っているか(と、何が入っていないか)

このリポジトリは **標準と台帳だけ**を持ちます。スキャン/信頼計算などの**エンジンは含みません**(別管理)。

| ある | ない(別管理) |
|---|---|
| `schema/x-jp402.schema.json` — 準拠カタログの形式 | on-chain 実測・信頼スコア計算 |
| `registry.json` — opt-in 登録台帳(PR 先) | クロール・T番号 裏取りの実装 |
| `TRUST.md` — 信頼シグナル 4 軸のフォーマット | サービス一覧 API の serve |
| `validate.mjs` — カタログ/台帳の検証ツール | |

依存の向きは **一方向**:このリポジトリ(標準・台帳)を、外部の scan エンジンが**読む**。逆は無い。

---

## 売り手:どう登録するか(publish + PR)

### 1. publish — 自分のドメインに `.well-known/x402-catalog.json` を置く
[`schema/x-jp402.schema.json`](schema/x-jp402.schema.json) に準拠した JSON を、自分のサイトの `/.well-known/x402-catalog.json` で公開します(Next.js なら `public/.well-known/x402-catalog.json`)。最小例:

```json
{
  "catalog": { "spec": "jp402-catalog/0.1", "baseSpec": "x402-bazaar-discovery/2", "publisher": "Example Shop" },
  "services": [{
    "resource": "https://shop.example.jp/api/buy",
    "accepts": [{ "scheme": "exact", "network": "eip155:137",
                  "asset": "0x...JPYC", "payTo": "0xYourWallet...", "maxAmountRequired": "1500" }],
    "x-jp402": { "currency": "JPYC",
                 "invoice": { "qualifiedIssuer": true, "registrationNumber": "T1234567890123" } }
  }]
}
```
ローカル検証: `node validate.mjs https://shop.example.jp/.well-known/x402-catalog.json`

### 2. PR — この台帳に URL を1行追加する
[`registry.json`](registry.json) の `entries` に、公開したカタログ URL を1件追加して Pull Request を出します:

```json
{ "catalog_url": "https://shop.example.jp/.well-known/x402-catalog.json" }
```

PR には URL だけを書きます(中身は publish 側が真実)。**承認ゲートはありません**。準拠していればマージされます(弾くのは既知の悪性のみ = denylist)。

### 3. あとは scan が付与する
マージ後、scan エンジンが URL をクロールし、スキーマ検証 + **T番号を国税庁 適格請求書 Web-API で実在検証**して、`registered` / `verified` と信頼シグナルを付与します。`verified` は自己申告ではなく、公的データの裏取り結果です。

---

## なぜ "publish + PR" の 2 段なのか

- **publish(自ドメイン)** — データの真実は売り手が保持する。`payTo` は on-chain の真実なので、ブランドを詐称しても着金先は晒れる(なりすまし不可)。
- **PR(URL だけ)** — 「この discovery に載りたい」という**能動的な意思表示**。台帳は URL しか持たないので、運営が中身や可否を握らない(非中央集権)。

「載る(listing)」と「信頼(trust)」を分離する設計の入口です。詳細は [`TRUST.md`](TRUST.md)。

---

## License

MIT © kakedashi3
