# Trust Signals — フォーマット定義

jp402-registry に載った各サービスには、観測側(scan エンジン)が **信頼シグナル**を後付けする。本ファイルは**シグナルの 4 軸の名前と意味(=フォーマット)だけ**を定義する。計算ロジックそのものは scan エンジン側に置く(本リポジトリには含めない)。

> 設計原則(jp402): **「載る(listing)」と「信頼(trust)」は別レイヤー**。詐欺・スパムも準拠ファイルさえ置けば載れる。だが信頼シグナルは payment track record ゼロ・address 不一致・未検証 になるため、利用者・agent が judge できる。scan の仕事は「承認」ではなく **信頼を legible にすること**。ERC-8004 trust scoring 形式に寄せる。

## 4 軸

| 軸 | 意味 | 観測元(例) |
|---|---|---|
| **Payment Track Record** | その payTo への着金実績(tx 件数 / ユニーク wallet 数) | on-chain 実測 |
| **Address Consistency** | カタログ宣言の payTo と、実際の着金先 on-chain の一致 | 宣言 × 実測の突合 |
| **Ecosystem Conformance** | x402 / x-jp402 への準拠度、T番号の実在検証(国税庁 Web-API) | カタログ検証 + NTA 裏取り |
| **Discovery Transparency** | カタログの自己記述の充足(publisher / updated / endpoint の明示) | カタログ静的検査 |

## シグナルの置き場(物理分離)
- **カタログ = 静的・誰でも publish 可** / **シグナル = 動的・観測者が後付け**。混ぜない(混ぜると「載るには実績を持て」になり登録不要モデルが崩れる)。
- シグナルは `payTo` をキーに別 JSON で表現する(本リポジトリではなく scan エンジンが生成):
  ```json
  { "payTo": "0x...", "signals": {
      "paymentTrackRecord": { "txCount": 0, "uniqueWallets": 0 },
      "addressConsistency": true,
      "ecosystemConformance": { "schemaValid": true, "tNumberVerified": false },
      "discoveryTransparency": 0.8,
      "lastObserved": "..." } }
  ```

## コールドスタートの扱い
正規の新参も実績ゼロ。**ゼロ実績は隠さず明示ラベル**(「未検証 / 実績なし」)。低シグナル=隠す にすると正規新参を埋めるため、フラットに出して判断材料にする。
