# COASTER CLASH

Muddy's Games の、2〜8人で数字のコースターを出し合って点数カードを取り合うゲーム(作成中)。

- いまは試作 v=6: 練習モード(コンピューターと対戦)と、オンライン対戦(2〜8人、コンピューターも入れられる)
- ファイル: `index.html`(画面)・`main.js`(ルール・コンピューター・画面の表示)・`online.js`(オンライン対戦。ホスト方式)・`config.js`(Firebase の接続設定)・`backguard.js`(戻るボタンの確認。全ゲーム共通)・`style.css`
- Firebase は専用プロジェクト `coaster-clash-e0449`。ルールは `muddys-notes` の `firebase/coaster-clash_rules.json`
- キャッシュよけの番号は `node tools/set-version.mjs 番号` で全部そろえる
- 仕様・引き継ぎのメモは `muddys-notes` の `coaster-clash/` にある
- `tools/sim.mjs` はルールを決めるためのシミュレーター(ゲームでは使わない)。`node tools/sim.mjs special` で特殊カードのバランス
