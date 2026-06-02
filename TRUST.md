# Trust Signals — 信頼シグナルの内訳(透明な仕様)

jp402-registry に載った各サービスには、観測側(scan エンジン)が**信頼シグナル**を後付けする。本ファイルは、その **4 軸の意味・算出方法・公開フォーマット**を定義する。

> 設計原則(jp402): **「載る(listing)」と「信頼(trust)」は別レイヤー**。詐欺・スパムも準拠ファイルさえ置けば載れる。だがシグナルは payment track record ゼロ・address 不一致・未検証 になるため、利用者・agent が判断できる。scan の仕事は「承認」ではなく **信頼を legible(可読)にすること**。
>
> **透明性の方針**: シグナルの **算出方法も、各サービスの算出値も公開する**。元データはすべて **public な on-chain / 公的 API** なので、第三者が同じ値を再現・検証できる。**ブラックボックスの合成スコアは作らない** — 生のシグナルを出し、重み付けは利用側 agent に委ねる(これも Discovery Transparency の一部)。秘匿するのは engine の実装ではなく、何も秘匿しない。moat は「秘密の式」ではなく「キュレーションの鮮度と売り手 consensus」 にある。

---

## 4 軸(意味 + 算出方法)

### 1. Payment Track Record(着金実績)
- **意味**: その `payTo` に実際どれだけ取引が起きたか。
- **算出**: Polygon の JPYC `Transfer` イベントのうち `to == payTo` を集計。
  - `txCount` = 着金 tx 件数
  - `uniqueWallets` = ユニークな送金元アドレス数
  - `window` = 集計期間(例: 全期間 / 直近 90 日)
- **再現性**: 誰でも同じ on-chain データ(Polygonscan / RPC)から再計算できる。

### 2. Address Consistency(アドレス一貫性)
- **意味**: カタログが宣言した `payTo` と、実際に着金している先が一致するか。
- **算出**: カタログ `accepts[].payTo`(宣言)と、実測の着金先を突合。`consistent: true/false`(+ 不一致があれば該当 tx)。
- **狙い**: ブランド詐称しても着金先は on-chain で晒れるため、宣言と実測のズレを検出できる。

### 3. Ecosystem Conformance(準拠度)
- **意味**: x402 / x-jp402 標準への準拠と、T番号の実在。
- **算出**:
  - `schemaValid` = [`schema/x-jp402.schema.json`](schema/x-jp402.schema.json) の検証 pass(boolean)
  - `baseSpecOk` = `baseSpec: "x402-bazaar-discovery/2"` 宣言の有無
  - `tNumberVerified` = 宣言 T番号を国税庁 適格請求書 Web-API で実在確認(boolean)。**【構築中】国税庁 API 未取得のため当面 `null`**
- **再現性**: schema 検証はこのリポジトリの `validate.mjs` で誰でも実行可。

### 4. Discovery Transparency(自己記述の充足)
- **意味**: カタログがどれだけ自分を説明しているか。
- **算出**: `publisher` / `updated` / `resource` / `info` / `schema` の充足を 0–1 で。欠落が多いほど低い。
- **狙い**: 「説明のないサービス」を相対的に沈める(隠すのではなく可読化)。

---

## 公開する信号レコード(フォーマット)

`payTo` をキーに、別ファイル `signals.json` で公開する(カタログとは**物理分離** — カタログは静的・誰でも publish 可 / シグナルは動的・観測者が後付け)。スキーマ = [`schema/signals.schema.json`](schema/signals.schema.json)。

```json
{
  "payTo": "0x3f026CE4b47a9d3b023413BDc291111Ce7812830",
  "signals": {
    "paymentTrackRecord": { "txCount": 0, "uniqueWallets": 0, "window": "all" },
    "addressConsistency": { "consistent": true },
    "ecosystemConformance": { "schemaValid": true, "baseSpecOk": true, "tNumberVerified": null },
    "discoveryTransparency": 0.8
  },
  "lastObserved": "2026-06-02T00:00:00Z",
  "denylisted": false
}
```

- **合成スコアは持たない**(各軸の生値だけ)。順位付けは利用側 agent が自分の policy で重み付けする。
- `tNumberVerified: null` = 国税庁 API 未取得による未検証(false=検証して不一致、とは区別する)。

### 公開のしかた(構築中)
- 値は scan エンジン(別管理・private)が **public な on-chain / 公的 API から算出**し、**`signals.json` のスナップショットを公開**(定期更新)+ 必要なら read-only エンドポイントで配信。
- **公開されるのは「方法(本ファイル)」と「算出値(signals.json)」**。engine の実装コードは公開しない(が、値は誰でも再現可能なので透明性は損なわれない)。
- 現状 `signals.json` は雛形(0 件)。登録が入り次第、エンジンが populate する。

---

## コールドスタートの扱い
正規の新参も実績ゼロ。**ゼロ実績は隠さず明示**(`txCount: 0` をそのまま出す)。低シグナル=隠す にすると正規新参を埋めるため、フラットに出して判断材料にする。
