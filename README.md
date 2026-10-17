# FracTone — フラクタル作曲 × DTM学習シーケンサー

## 概要
- **目的**: ブラウザで鍵盤を弾いてメロディを記録・再生・編集し、その「続き」を **中点変位法** で作曲する DTM 学習アプリ
- **ターゲット**: DTM 初心者 / 音楽理論・鍵盤の学習者
- **デザイン**: ダーク × ディープパープル、マゼンタ/シアンのグラデーション、ニューモーフィズム、Kinetic Typography、インフォグラフィック・アニメーション

## 実装済み機能
| 区分 | 内容 |
|---|---|
| PianoUI | `PianoKey` コンポーネントを並べた仮想鍵盤。マウス/タッチ(グリッサンド可)・PCキー(A〜' / W,E,T…)で演奏。押下中はグラデ発光、AI再生音はシアン発光。スケール内の音/主音ドット表示 |
| PianoRoll | Y=音程 / X=時間。音符=長方形バー（ユーザー=マゼンタ、AI=シアン）。**ドラッグで移動**、右端ドラッグで長さ変更、ダブルクリックで追加、範囲選択、Shift複数選択、矢印キー移動、Ctrl+ホイールでズーム。再生ヘッドは rAF で滑らかに追従、楽式ラベル(A, A', B…)をルーラー表示 |
| コントロール | 録音 / 再生・一時停止 / 停止 / ループ / メトロノーム / テンポ / 音色(6種) / Undo・Redo / 削除 / クオンタイズ / グリッド / AI採用 / 別案 / 全消去 |
| 続きを作曲 | ユーザー入力から **モチーフを判断**（音階度数差+音価の n-gram 反復検出 → 1〜2小節に拡張。無ければ冒頭フレーズ）→ 楽式プラン → マクロ/ミクロの中点変位 → リズム付与 → スケール量子化 → Humanize |
| 新規生成 | 1小節のリズム + 小さな中点変位カーブから **モチーフを作成** して作曲 |
| 人間らしい繰り返し | A / A→(反復進行) / Ā(反行) / a·a(断片化) / A'(変奏) / C(自由) / 終止 を組み合わせ、問い→答えの末尾変形、同一小節リズムの反復、タイミング/強弱の揺らぎ |
| 可視化タブ | ピッチ可視化（点と線＋中点変位トレースを階層ごとに色分け）/ リズム可視化（16分格子・ベロシティ・音価分布）/ オーディオ設定（音色カード・ミキサー・ADSR・スペクトラム） |
| 楽典分析 | ハーモニー指数・滑らかさ・リズム明瞭性（ゲージ）、スケール適合率、音素材利用率、モチーフ反復度、協和度、輪郭、ピッチクラス・ホイール、音程ヒストグラム。シーケンス変更のたびにリアルタイム再計算 |
| 保存 | localStorage 自動保存 + Standard MIDI File (.mid) ダウンロード |

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
│   └── audio-engine.ts       # Web Audio シンセ / スケジューラ / MIDI書き出し（ブラウザ専用）
└── client/                   # React SPA（useReducer で状態を最上位管理）
    ├── App.tsx, state.ts, main.tsx, styles.css (Tailwind v4)
    ├── hooks/useTransport.ts
    └── components/ PianoRoll, PianoUI, Controls, ParamPanel, AnalysisPanel, PitchViz, RhythmViz, AudioPanel, Header, ui
```
作曲はエッジ API (`/api/compose`) で実行し、通信できない場合は同じ `lib` をブラウザで実行して処理を続けます。

## API
| Method | Path | 説明 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/compose` | `{ mode: 'continue'|'new', sequence: Note[], params }` → `{ result, analysis }` |
| POST | `/api/analyze` | `{ sequence, key, scale, bpm, timeSig }` → 分析 + キー推定 |

## データモデル
```ts
interface Note { id: string; midiNoteNumber: number; startTime: number; duration: number; velocity?: number; source?: 'user'|'ai'; tag?: string }
```
- ストレージ: ブラウザ localStorage（`fractone:v1`）。サーバー側 DB は不使用

## 使い方
1. 「タップしてはじめる」→ 鍵盤（A S D F…）を弾く／● で録音／グリッドをダブルクリックで音符を置く
2. 左パネルで変位強度・分解深度・モチーフ反復度などを調整
3. **✨ 続きを作曲** → シアンの音符が AI の続き。▶ で試聴、🎲 で別案、✔ で自分のメロディとして採用して更に続ける
4. 右パネルの分析で、パラメータが音楽にどう影響したか確認
- ショートカット: Space 再生 / R 録音 / Enter 先頭へ / Z・X オクターブ / Delete 削除 / Ctrl+Z 元に戻す / Shift+A 全選択

## 開発
```bash
npm run build      # クライアント(Vite+React+Tailwind) → public/static, サーバー → dist
pm2 start ecosystem.config.cjs   # wrangler pages dev :3000
```

## 未実装 / 次のステップ
- 和音（コード）トラック・伴奏の自動生成
- 複数トラック、ベロシティ編集レーン
- MIDI ファイル読み込み・Web MIDI 入力
- クラウド保存（D1）と作品共有

## デプロイ
- プラットフォーム: Cloudflare Pages（未デプロイ）
- 技術: Hono + React 18 + Tailwind CSS v4 + Web Audio API + TypeScript
- 最終更新: 2026-10-17
