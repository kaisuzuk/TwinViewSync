# TwinViewSync

Chrome拡張機能「TwinView Sync」のリポジトリです。

Vue2画面とVue3画面のレイアウト最終確認を効率化するため、2つのブラウザタブ間で **操作同期・Compare Overlay・グリッド表示** を行います。

---

## 概要

| 機能 | 内容 |
|------|------|
| タブペアリング | 比較対象の2タブを登録 |
| マウス操作同期 | mousemove / click / drag / wheel を転送 |
| ゴーストカーソル | 相手タブ上にカーソルを可視化 |
| クリック位置ハイライト | Rippleアニメーションでクリック位置を共有 |
| wheel同期 | ダイアログ・テーブル内スクロールに対応 |
| windowスクロール同期 | ページ全体のスクロール位置を同期 |
| グリッド表示 | ピクセルグリッドオーバーレイ（両タブへ表示） |
| Compare Overlay | スクリーンショットを半透明で重ねて見た目比較 |
| Blink Compare | 実画面とスクリーンショットを交互に表示して差分確認 |
| Diff Highlight | ピクセル差分を自動検出し、対象タブへ赤色マスクで可視化 |

---

## セットアップ

**前提条件**

- Node.js 18 以上
- Google Chrome / Microsoft Edge

```bash
cd extension
npm install
```

---

## ビルド

```bash
npm run build
```

`extension/dist/` ディレクトリにビルド成果物が生成されます。

型チェックのみ実行する場合：

```bash
npm run typecheck
```

開発中（ファイル変更を監視）：

```bash
npm run dev
```

---

## ローカル読み込み

1. `npm run build` でビルドする
2. Chrome を開き `chrome://extensions/` へアクセス
3. 右上の **デベロッパーモード** をONにする
4. **パッケージ化されていない拡張機能を読み込む** をクリック
5. `extension/dist/` フォルダを選択する

> Edge の場合は `edge://extensions/` → **デベロッパーモード** → **展開して読み込む** の手順で同様に読み込みます。

---

## 操作方法

### 1. Tab Pairing（タブペアリング）

1. 比較したい Vue2 画面のタブを開いた状態で拡張機能ポップアップを開く
2. **Set Current** ボタン（Tab A 行）をクリックして登録
3. 比較したい Vue3 画面のタブを開いた状態で再度ポップアップを開く
4. **Set Current** ボタン（Tab B 行）をクリックして登録

### 2. Sync Control

| 項目 | 内容 |
|------|------|
| Direction | A → B / B → A / Bidirectional |
| Enable Sync | 同期のON/OFF |
| ⏸ Pause | 一時停止（再クリックで再開） |

### 3. 同期確認中の注意

- **Sync ON/OFF状態** はポップアップ右上のバッジで確認できます
- クリック同期が有効なため、バナーで警告が表示されます
- 登録・削除・送信などの副作用がある操作も同期されます

---

## 同期対象イベント

レイアウト最終確認用途を想定し、以下のイベントを同期します。

- `mousemove`（ゴーストカーソル表示）
- `mousedown` / `mouseup`
- `click`（クリック位置Rippleハイライト付き）
- `dblclick`
- `contextmenu`
- `wheel`（ダイアログ・テーブル内スクロール）
- `window scroll` / スクロールコンテナ
- `input` / `change`
- `keydown` / `keyup`

> **注意：** 実クリックが相手タブに送信されます。フォーム送信・削除・登録などの操作も同期される可能性があります。

---

## Compare Overlay

Vue2 画面を正解として Vue3 画面へ半透明で重ねることで、視覚的なレイアウト差分を確認します。

**手順：**

1. ポップアップの **Compare Overlay** セクションで方向を選択（例：A → B）
2. Opacity スライダーで透明度を調整
3. **Capture Reference** ボタンをクリック → 送信元タブのスクリーンショットを取得して対象タブへオーバーレイ表示
4. **Show Overlay / Hide Overlay** で表示切替
5. スクロール後は **Capture Reference** で再キャプチャが必要

> 実装：`chrome.tabs.captureVisibleTab()` を使用。表示領域のみ対象（フルページキャプチャ不要）。

---

## Blink Compare

実画面とキャプチャ画像を交互に切り替えることで、差分を目視確認しやすくします。

1. Compare Overlay でキャプチャを取得しておく
2. **Blink Compare** セクションの Interval（ms）を設定（デフォルト 500ms）
3. **Start Blink** をクリックして開始
4. **Stop Blink** をクリックして停止

---

## Diff Highlight

参照タブと対象タブの表示領域をそれぞれキャプチャし、ピクセル差分が閾値を超えた箇所だけを対象タブ上に赤色マスクで表示します。

1. **Diff Highlight** セクションで方向を選択（例：A → B）
2. Opacity で差分マスクの濃さ、Threshold で検出感度を調整
3. **Capture Diff** をクリックして2タブの表示領域を取得し、対象タブへ差分を表示
4. **Show Diff / Hide Diff** で表示切替
5. スクロール・リサイズ・状態変更後は **Capture Diff** で再キャプチャが必要

> 実装：`chrome.tabs.captureVisibleTab()` で2タブの表示領域を取得し、対象タブの content script でCanvasへ正規化して差分マスクを生成します。

---

## Grid Overlay

ピクセルグリッドを両タブへ表示し、要素の整列・間隔確認に活用します。

**設定項目：**

| 項目 | 内容 |
|------|------|
| Size | 8 / 10 / 12 / 16px またはカスタム値 |
| Opacity | 0〜100%（スライダー） |
| Offset X / Y | グリッドの原点オフセット（px） |

- `pointer-events: none` で操作を妨げません
- `z-index: 2147483645` で最前面に表示

---

## アーキテクチャ

```
extension/
├── manifest.json          # Manifest V3 設定
├── package.json
├── tsconfig.json
├── vite.config.ts
├── icons/                 # 拡張機能アイコン
└── src/
    ├── background.ts      # Service Worker（メッセージ中継・タブキャプチャ）
    ├── content/
    │   └── content.ts     # 各ページへ注入されるスクリプト
    ├── popup/
    │   ├── popup.html     # ポップアップUI
    │   ├── popup.ts       # ポップアップのロジック
    │   └── popup.css      # ポップアップのスタイル
    ├── overlay/
    │   ├── cursorOverlay.ts    # ゴーストカーソル
    │   ├── clickRipple.ts      # クリック位置Rippleアニメーション
    │   ├── gridOverlay.ts      # グリッドオーバーレイ（Canvas）
    │   ├── compareOverlay.ts   # Compare Overlay & Blink Compare
    │   └── diffHighlightOverlay.ts # Diff Highlight（Canvas）
    ├── sync/
    │   ├── pointerSync.ts  # マウスポインタイベント送信
    │   ├── wheelSync.ts    # wheelイベント送信
    │   ├── dragSync.ts     # ドラッグ操作送信
    │   ├── clickSync.ts    # クリックイベント適用
    │   └── scrollSync.ts   # windowスクロール送信・適用
    └── shared/
        ├── types.ts        # 型定義
        ├── constants.ts    # 定数
        └── messaging.ts    # storage・メッセージ送信ユーティリティ
```

### メッセージフロー

```
[Tab A] content.ts
    └─ イベント検知 → chrome.runtime.sendMessage()
           ↓
    [background.ts] Service Worker
    ├─ syncState から転送先タブを決定
    └─ chrome.tabs.sendMessage(tabBId, ...)
           ↓
    [Tab B] content.ts
    └─ イベントを受信 → DOM に dispatch
```

---

## イベント同期方式

### 座標転送

px ではなく **比率（Ratio）** で送信することで、ビューポートサイズが異なる場合でも近似的な位置に再現します。

```typescript
// 送信側
xRatio = clientX / window.innerWidth
yRatio = clientY / window.innerHeight

// 受信側
x = xRatio * window.innerWidth
y = yRatio * window.innerHeight
```

### ループ防止

再注入したイベントを再度送信しないよう、`__twinViewSyncRemote` フラグを各イベントオブジェクトに設定し、送信側でチェックします。

```typescript
let applyingRemoteEvent = false
```

---

## 権限

| 権限 | 理由 |
|------|------|
| `tabs` | タブ情報の取得（URL・タイトル）、メッセージ送信先の特定 |
| `storage` | 同期状態・グリッド設定・Overlay設定の永続化 |
| `activeTab` | ポップアップ操作時の現在タブ取得 |
| `scripting` | コンテンツスクリプト動的注入（将来拡張用） |
| `http://*/*`, `https://*/*` | 任意の Web ページへのコンテンツスクリプト注入 |

---

## 制約

- **ビューポートサイズ差が大きいと同期精度が低下する**（比率ベースのため近似値）
- **レイアウト差異が大きい画面では操作再現精度が低下する**
- **iframe 内部は対象外**（content script は top frame のみ動作）
- **input type="file" は同期不可**（ブラウザのセキュリティ制限）
- **ブラウザ保護対象イベント（passwordフィールド等）は同期不可**
- **Compare Overlay は表示領域のみ対象**（スクロール後は再キャプチャが必要）
- **Diff Highlight は表示領域のみ対象**（スクロール・リサイズ・状態変更後は再キャプチャが必要）
- **click 同期を行うため、登録・削除・送信などの副作用がある操作は注意が必要**

### 部分的に対応可能な UI

以下の UI については、`mousemove` / `mousedown` / `mouseup` / `wheel` の同期によって一定程度の操作再現が可能です：

- Google Maps パン・ズーム
- ドラッグUI（スライダー・スプリッター・テーブル列幅変更）
- ドロワー開閉
- 仮想スクロールリスト

ただし、各ライブラリの内部実装によっては完全な再現が困難な場合があります。

---

## 今後の拡張案

- **IME イベント同期**：`compositionstart` / `compositionupdate` / `compositionend`
- **フルページキャプチャ**：スクロール連結によるページ全体のオーバーレイ
- **セッション記録・再生**：操作シーケンスの録画と再生
- **iframe サポート**：`all_frames: true` への対応検討
- **マルチウィンドウ対応**：異なるウィンドウ間でのペアリング
- **レスポンシブ確認モード**：ビューポートサイズを揃えるアシスト機能
