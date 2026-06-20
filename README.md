# Arc-Lite MCP Server

フロントエンド開発に最適化された Arc Browser 制御用の軽量 MCP サーバーです。
AppleScript と JavaScript インジェクションを組み合わせ、必要十分な 30 ツールに絞ったコンパクトな構成を提供します。

> **対応環境**: macOS 専用（AppleScript を使用）

## 特徴

- **軽量**: フル版（58ツール）からフロントエンド開発に必須の機能のみを厳選した 30 ツール構成
- **依存最小**: `@modelcontextprotocol/sdk` のみ
- **DOM操作対応**: クリック、入力、フォーム送信、ドラッグなどの実操作をサポート
- **デバッグ機能**: コンソール / ネットワーク監視、スクリーンショット取得

## 機能一覧（30個）

### タブ操作（5個）

| ツール | 説明 |
|--------|------|
| `arc_open_url` | URL を開く（新規タブ / 現在のタブ） |
| `arc_list_tabs` | すべてのタブを一覧表示 |
| `arc_switch_tab` | タブを切り替える |
| `arc_close_tab` | タブを閉じる |
| `arc_reload_tab` | タブをリロード |

### ナビゲーション（1個）

| ツール | 説明 |
|--------|------|
| `arc_go_back` | 履歴を戻る |

### DOM操作（8個）

| ツール | 説明 |
|--------|------|
| `arc_click` | 要素をクリック |
| `arc_hover` | 要素にホバー |
| `arc_fill` | 入力欄に値を入力 |
| `arc_fill_form` | フォーム一括入力 |
| `arc_press_key` | キー入力を送信 |
| `arc_drag` | ドラッグ操作 |
| `arc_upload_file` | ファイルアップロード |
| `arc_wait_for` | 要素の出現を待機 |

### JavaScript・ページ情報（6個）

| ツール | 説明 |
|--------|------|
| `arc_execute_javascript` | 任意の JavaScript を実行 |
| `arc_get_page_content` | ページのテキストを取得 |
| `arc_get_page_html` | ページの HTML を取得 |
| `arc_get_page_info` | ページ詳細情報（URL、ビューポート、UserAgent） |
| `arc_get_meta_tags` | メタタグ情報（SEO 確認用） |
| `arc_get_page_forms` | フォーム情報を取得 |

### スクリーンショット（1個）

| ツール | 説明 |
|--------|------|
| `arc_take_screenshot` | スクリーンショットを取得（macOS の `screencapture` を使用） |

### コンソール監視（3個）

| ツール | 説明 |
|--------|------|
| `arc_start_console_capture` | コンソールログのキャプチャを開始 |
| `arc_get_console_logs` | キャプチャしたログを取得 |
| `arc_stop_console_capture` | コンソールキャプチャを停止 |

### ネットワーク監視（3個）

| ツール | 説明 |
|--------|------|
| `arc_start_network_monitor` | ネットワークリクエスト（fetch/XHR）の監視を開始 |
| `arc_get_network_requests` | 監視中のリクエスト一覧を取得 |
| `arc_stop_network_monitor` | ネットワーク監視を停止 |

### ダイアログ・ストレージ・Cookie（3個）

| ツール | 説明 |
|--------|------|
| `arc_handle_dialog` | ダイアログ（alert / confirm / prompt）を処理 |
| `arc_get_storage_info` | localStorage / sessionStorage の情報を取得 |
| `arc_get_cookies` | Cookie 一覧を取得 |

## セットアップ

### 1. クローンと依存関係のインストール

```bash
git clone https://github.com/yzanbo/arc-lite-mcp.git
cd arc-lite-mcp
npm install
```

### 2. Claude Code 設定

`~/.claude.json` の `mcpServers` に以下を追加します:

```json
{
  "mcpServers": {
    "arc-lite": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/絶対パス/arc-lite-mcp/server/index.js"
      ]
    }
  }
}
```

> `/絶対パス/` は `git clone` した実際の場所に置き換えてください。

### 3. 権限設定

初回実行時に macOS の権限プロンプトが表示されます:

1. **システム設定** > **プライバシーとセキュリティ** > **オートメーション** を開く
2. **Claude**（もしくは利用クライアント）を探す
3. **Arc** を有効にする

## 使用例

### 基本操作

```text
arc_open_url で https://example.com を開いて
arc_list_tabs でタブ一覧を表示して
arc_switch_tab で 2 番目のタブに切り替えて
```

### フォーム入力・ボタン操作

```text
arc_fill で "#email" に "test@example.com" を入力して
arc_fill で "#password" に "secret" を入力して
arc_click で "button[type=submit]" をクリックして
arc_wait_for で ".dashboard" の表示を待って
```

### コンソール・ネットワーク監視（フロントエンドデバッグ）

```text
arc_start_console_capture でコンソール監視を開始して
arc_start_network_monitor でネットワーク監視を開始して

（アプリを操作）

arc_get_console_logs で error レベルのログを取得して
arc_get_network_requests で API リクエストを確認して
```

### ページ情報・SEO 確認

```text
arc_get_page_info でページ詳細を取得して
arc_get_meta_tags でメタタグを確認して
arc_get_page_forms でフォーム構造を取得して
```

### スクリーンショット

```text
arc_take_screenshot でスクリーンショットを撮って
→ ドラッグで範囲を選択するとキャプチャされる
```

## トラブルシューティング

### 権限エラーが発生する

- システム設定でオートメーション権限を確認
- 利用クライアント（Claude Code 等）を再起動

### Arc が見つからない

- Arc Browser が起動していることを確認
- `/Applications/Arc.app` にインストールされていることを確認

### JavaScript 実行が失敗する

- CSP（Content Security Policy）制限のあるページでは動作しない場合があります

### Network / Console 監視が機能しない

- 監視はページリロード後にリセットされます
- 監視開始後のリクエスト / ログのみがキャプチャされます

## ライセンス

MIT
