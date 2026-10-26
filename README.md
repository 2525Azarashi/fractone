# FracTone — フラクタル作曲 × DTM学習シーケンサー

## 概要
- **目的**: ブラウザで鍵盤を弾いてメロディを記録・再生・編集し、その「続き」を **中点変位法** で作曲する DTM 学習アプリ
- **ターゲット**: DTM 初心者 / 音楽理論・鍵盤の学習者
- **デザイン**: ほぼ黒のダークサーフェス + マゼンタ/シアンのアクセントに限定したエディトリアルUI。線画アイコン、番号付きセクション、マスク立ち上がりの Kinetic Typography、目盛り付きゲージ等のインフォグラフィック・アニメーション

## 実装済み機能
| 区分 | 内容 |
|---|---|
| PianoUI | `PianoKey` コンポーネントを並べた仮想鍵盤。マウス/タッチ(グリッサンド可)・PCキー(A〜' / W,E,T…)で演奏。押下中はグラデ発光、AI再生音はシアン発光。スケール内の音/主音ドット表示 |
| PianoRoll | Y=音程 / X=時間。音符=長方形バー（ユーザー=マゼンタ、AI=シアン）。**ドラッグで移動**、右端ドラッグで長さ変更、ダブルクリックで追加、範囲選択、Shift複数選択、矢印キー移動、Ctrl+ホイールでズーム。再生ヘッドは rAF で滑らかに追従、楽式ラベル(A, A', B…)をルーラー表示 |
| コントロール | 録音 / 再生・一時停止 / 停止 / ループ / メトロノーム / テンポ / 音色(6種) / Undo・Redo / 削除 / クオンタイズ / グリッド / AI採用 / 別案 / 全消去 |
| 作曲ドック | ピアノロールの真上に「続きを作曲 / 新規生成 / 別案」と主要パラメータ（Bars・変位強度・分解深度・反復度）を配置。音符を見ながらすぐ生成できる |
| 続きを作曲 | ユーザー入力から **モチーフを判断**（音階度数差+音価の n-gram 反復検出 → 1〜2小節に拡張。無ければ冒頭フレーズ）→ 楽式プラン → マクロ/ミクロの中点変位 → リズム付与 → スケール量子化 → Humanize |
| 新規生成 | 1小節のリズム + 小さな中点変位カーブから **モチーフを作成** して作曲 |
| 人間らしい繰り返し | A / A→(反復進行) / Ā(反行) / a·a(断片化) / A'(変奏) / C(自由) / 終止 を組み合わせ、問い→答えの末尾変形、同一小節リズムの反復、タイミング/強弱の揺らぎ |
| 可視化タブ | ピッチ可視化（点と線＋中点変位トレースを階層ごとに色分け）/ リズム可視化（16分格子・ベロシティ・音価分布）/ オーディオ設定（音色カード・ミキサー・ADSR・スペクトラム） |
| 楽典分析 | ハーモニー指数・滑らかさ・リズム明瞭性（ゲージ）、スケール適合率、音素材利用率、モチーフ反復度、協和度、輪郭、ピッチクラス・ホイール、音程ヒストグラム。シーケンス変更のたびにリアルタイム再計算 |
| Live モード | 作曲後にスライダーを動かすと 120ms デバウンスでブラウザ内再作曲し即反映（同シード）。分析値の変化を Δ バッジで表示 |
| モーション層 (v3) | 中点変位の再帰描画スプラッシュ / 可変ウェイト ProximityWord / ScrambleText / マグネティックボタン / スポットライト / 作曲パイプライン・オーバーレイ → 楽式リビール / AI領域スイープ / 鍵盤パーティクル |
| インフォグラフィック | レーダー（前回結果ゴースト付き）、目盛りゲージ、再生連動の楽式タイムライン（現在フレーズ発光 + ヘッド線）、ピッチホイール、音程ヒストグラム |
| Now Playing | 再生中・演奏中に、鳴っている音名を巨大アウトライン文字で表示（強さで文字の太さ、上行/下行で入ってくる方向が変わる）+ 音程名・楽式フレーズ・拍の HUD |
| Toast | 下から積み重なる通知。左右スワイプで消去、ホバー中は一時停止、残り時間バー、「元に戻す」「テイク一覧」などのアクション付き |
| Skeleton | 作曲中は分析・モチーフカードとテイク一覧をシマー付きの骨格で表示 |
| Bottom Sheet | テイク・ライブラリ（ヘッダーの本棚アイコン）。ハンドルをドラッグで半分⇔全画面にスナップ、下へ払うと閉じる、Esc 対応 |
| Swipe Action | テイク行を右へスワイプでお気に入り、左へで削除（トーストから元に戻せる） |
| Pull to Refresh | タッチ端末でページ上端から引っ張ると、中点変位カーブが階層ごとに描かれ、離すと別案を作曲（ピアノロール・鍵盤上では無効） |
| Auto Complete | `/` または Ctrl+K でコマンドパレット。あいまい検索・一致文字ハイライト・ゴースト補完（Tab）・「bpm 128」のような数値付き入力、キー×スケール・音色・テイクも検索可 |
| UX | 初回コーチマーク、`:focus-visible` リング、デスクトップは3カラム sticky + 内部スクロール、ピアノロールのホバー十字線・ベロシティバー |
| コード生成 | メロディに合わせてコード進行を自動生成し、伴奏を付ける。①メロディを1小節（必要なら半小節）ごとに区切る ②ダイアトニック・コード（短調系では長三和音の V も）にメロディとの一致度で点数を付ける ③トニック/サブドミナント/ドミナントのつながりと終止（V→I）を考慮した動的計画法（Viterbi）で進行全体を最適化 ④前の和音から最も近い転回形で伴奏の音符を作る（ブロック / アルペジオ / アルベルティ / ベース+和音）。変化の間隔・7th の割合・音量・音域を調整できる。ピアノロールにコードレーン（クリックで試聴）と淡い伴奏バー、右パネルに進行カード（機能の色分け・流れ・再生中の和音を強調）、再生 HUD に現在のコードを表示 |
| 保存 | localStorage 自動保存 + Standard MIDI File (.mid) ダウンロード（伴奏は ch.2） |

## アーキテクチャ
```
src/
├── index.tsx                 # Hono: API + HTML シェル (Cloudflare Pages Functions)
├── lib/                      # サーバー/クライアント共有の純粋ロジック
│   ├── types.ts              # Note 型 ほか
│   ├── theory.ts             # スケール・音名・シード乱数・キー推定
│   ├── midpoint-displace.ts  # 中点変位法（メロディライン生成のみ）
│   ├── rhythm-generator.ts   # 音価・リズムパターン・Humanize
│   ├── motif.ts              # モチーフ判断/作成/変形
│   ├── composer.ts           # オーケストレーター
│   ├── analysis.ts           # 楽典分析
│   ├── chord-generator.ts    # コード進行生成（Viterbi）+ 伴奏パターン
│   └── audio-engine.ts       # Web Audio シンセ / スケジューラ / MIDI書き出し（ブラウザ専用）
└── client/                   # React SPA（useReducer で状態を最上位管理）
    ├── App.tsx, state.ts, main.tsx, styles.css (Tailwind v4)
    ├── hooks/useTransport.ts
    └── components/ Splash, ComposeOverlay, fx, ComposeDock, PianoRoll, PianoUI, Controls, ParamPanel, AnalysisPanel, PitchViz, RhythmViz, AudioPanel, Header, icons, ui
```
作曲はエッジ API (`/api/compose`) で実行し、通信できない場合は同じ `lib` をブラウザで実行して処理を続けます。

## API
| Method | Path | 説明 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/compose` | `{ mode: 'continue'|'new', sequence: Note[], params }` → `{ result, analysis }` |
| POST | `/api/analyze` | `{ sequence, key, scale, bpm, timeSig }` → 分析 + キー推定 |
| POST | `/api/harmonize` | `{ sequence, key, scale, bpm, timeSig, seed, harmony:{style,rate,color,volume,register} }` → `{ chords, notes, elapsedMs }` |

## データモデル
```ts
interface Note { id: string; midiNoteNumber: number; startTime: number; duration: number; velocity?: number; source?: 'user'|'ai'|'chord'; tag?: string }
```
- 伴奏（`source:'chord'`）は `sequence` に入れず、メロディから毎回計算して再生・書き出し時に合成する
- ストレージ: ブラウザ localStorage（`fractone:v1` = 作業中データ / `fractone:takes` = テイク最大24件）。サーバー側 DB は不使用

## 使い方
1. 「タップしてはじめる」→ 鍵盤（A S D F…）を弾く／● で録音／グリッドをダブルクリックで音符を置く
2. 左パネルで変位強度・分解深度・モチーフ反復度などを調整
3. ピアノロール上部の **続きを作曲** → シアンの音符が AI の続き。▶ で試聴、サイコロで別案、「採用」で自分のメロディとして採用して更に続ける
4. 左パネルの「コード生成」で伴奏の型を選ぶと、▶ でメロディと一緒に伴奏が鳴る
5. 右パネルの分析で、パラメータが音楽にどう影響したか確認
- ヘッダーの「?」で操作ガイド表示。ショートカット: Space 再生 / R 録音 / Enter 先頭へ / Z・X オクターブ / Delete 削除 / Ctrl+Z 元に戻す / Shift+A 全選択

## 開発
```bash
npm run build      # クライアント(Vite+React+Tailwind) → public/static, サーバー → dist
pm2 start ecosystem.config.cjs   # wrangler pages dev :3000
```
- アルゴリズム計測: `npx esbuild scripts/bench.ts --bundle --platform=node --outfile=/tmp/bench.cjs && node /tmp/bench.cjs`
- デバッグ: `/?debug=overlay` / `/?debug=reveal` で作曲オーバーレイ・楽式リビールを固定表示

## 未実装 / 次のステップ
- コードの手動編集（和音の差し替え・ロック）、セカンダリー・ドミナントや借用和音
- 伴奏専用の音色
- 複数トラック、ベロシティ編集レーン
- MIDI ファイル読み込み・Web MIDI 入力
- クラウド保存（D1）と作品共有

## デプロイ
- プラットフォーム: Cloudflare Pages（未デプロイ）
- 技術: Hono + React 18 + Tailwind CSS v4 + Web Audio API + TypeScript
- 最終更新: 2026-10-20 (v3.1 コード生成)
