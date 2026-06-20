#!/usr/bin/env node

/**
 * Arc-Lite MCP Server
 *
 * フロントエンド開発に最適化されたArc Browser制御用軽量MCPサーバー
 *
 * 機能（30ツール）:
 * - タブ操作（5）: open_url, list_tabs, switch_tab, close_tab, reload_tab
 * - ナビゲーション（1）: go_back
 * - DOM操作（8）: click, hover, fill, fill_form, press_key, drag, upload_file, wait_for
 * - JavaScript・ページ（6）: execute_javascript, get_page_content, get_page_html, get_page_info, get_meta_tags, get_page_forms
 * - スクリーンショット（1）: take_screenshot
 * - コンソール監視（3）: start_console_capture, get_console_logs, stop_console_capture
 * - ネットワーク監視（3）: start_network_monitor, get_network_requests, stop_network_monitor
 * - ダイアログ（1）: handle_dialog
 * - ストレージ（1）: get_storage_info
 * - Cookie（1）: get_cookies
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

class ArcLiteServer {
  constructor() {
    this.server = new Server(
      {
        name: 'arc-lite',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * AppleScript を実行する
   * @param {string} script - 実行するAppleScriptコード
   * @returns {Promise<string>} - 実行結果
   */
  async executeAppleScript(script) {
    try {
      const { stdout, stderr } = await execFileAsync('osascript', ['-e', script]);
      if (stderr) {
        console.error('AppleScript stderr:', stderr);
      }
      return stdout.trim();
    } catch (error) {
      console.error('AppleScript execution error:', error);

      // 権限関連のエラーチェック
      if (error.message.includes('(-1743)') ||
          error.message.includes('not allowed assistive access') ||
          error.message.includes('not authorized') ||
          error.message.includes('System Events')) {
        throw new Error(
          'Permission denied: Arc Browser の制御には自動化権限が必要です。\n\n' +
          '権限を付与するには:\n' +
          '1. システム設定 > プライバシーとセキュリティ > オートメーション を開く\n' +
          '2. リストから "Claude" を探す\n' +
          '3. Claude の下にある "Arc" を有効にする\n' +
          '4. 権限付与後、Claude の再起動が必要な場合があります\n\n' +
          'Note: 初回使用時に権限プロンプトが表示されます。'
        );
      }

      // Arc が起動していない場合のエラーチェック
      if (error.message.includes('(-600)') ||
          error.message.includes("application isn't running")) {
        throw new Error(
          'Arc Browser が起動していません。Arc を起動してから再度お試しください。'
        );
      }

      throw new Error(`AppleScript エラー: ${error.message}`);
    }
  }

  /**
   * 文字列をAppleScript用にエスケープする
   * @param {string} str - エスケープする文字列
   * @returns {string} - エスケープされた文字列
   */
  escapeForAppleScript(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  setupHandlers() {
    // ツール一覧を返す
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // === タブ操作 ===
        {
          name: 'arc_open_url',
          description: 'Arc Browser で URL を開く',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '開く URL'
              },
              new_tab: {
                type: 'boolean',
                description: '新しいタブで開くかどうか（デフォルト: true）',
                default: true
              }
            },
            required: ['url']
          }
        },
        {
          name: 'arc_list_tabs',
          description: 'すべての開いているタブを一覧表示する',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'arc_switch_tab',
          description: '指定したタブに切り替える',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（1から始まる）'
              },
              url: {
                type: 'string',
                description: '切り替えるタブのURL（部分一致）'
              }
            }
          }
        },
        {
          name: 'arc_close_tab',
          description: '指定したタブを閉じる',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（1から始まる）'
              },
              url: {
                type: 'string',
                description: '閉じるタブのURL（部分一致）'
              }
            }
          }
        },
        {
          name: 'arc_reload_tab',
          description: 'タブをリロードする',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === ページ操作 ===
        {
          name: 'arc_execute_javascript',
          description: 'JavaScriptコードを実行する（async/await対応、エラーハンドリング付き）',
          inputSchema: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: '実行するJavaScriptコード（async関数として実行される）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['code']
          }
        },
        {
          name: 'arc_get_page_content',
          description: 'ページのテキストコンテンツを取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_page_html',
          description: 'ページのHTML全体を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === ナビゲーション ===
        {
          name: 'arc_go_back',
          description: 'ブラウザ履歴を戻る',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        // === Web開発向け機能 ===
        {
          name: 'arc_get_page_info',
          description: 'ページの詳細情報を取得する（URL、タイトル、ビューポート、UserAgent）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_page_forms',
          description: 'ページ内のフォーム情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_storage_info',
          description: 'ローカルストレージ/セッションストレージの情報を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_meta_tags',
          description: 'ページのメタタグ情報を取得する（SEO確認用）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        // === Cookie管理 ===
        {
          name: 'arc_get_cookies',
          description: 'すべてのCookieを取得する（名前、値、詳細情報）',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        // === Network/API監視 ===
        {
          name: 'arc_start_network_monitor',
          description: 'ネットワークリクエストの監視を開始する（fetch/XHR）',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                description: 'URLフィルタ（部分一致）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_network_requests',
          description: '監視中のネットワークリクエスト一覧を取得する',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: '取得する最大件数（デフォルト: 50）',
                default: 50
              },
              includePreservedRequests: {
                type: 'boolean',
                description: '過去のナビゲーションで保存されたリクエストも含めるか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_stop_network_monitor',
          description: 'ネットワーク監視を停止する',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // Console監視
        {
          name: 'arc_start_console_capture',
          description: 'コンソールログのキャプチャを開始する',
          inputSchema: {
            type: 'object',
            properties: {
              levels: {
                type: 'array',
                items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
                description: 'キャプチャするログレベル（デフォルト: すべて）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_get_console_logs',
          description: 'キャプチャしたコンソールログを取得する',
          inputSchema: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['log', 'info', 'warn', 'error', 'debug', 'all'],
                description: 'フィルタするログレベル（デフォルト: all）'
              },
              limit: {
                type: 'number',
                description: '取得する最大件数（デフォルト: 100）',
                default: 100
              },
              includePreservedMessages: {
                type: 'boolean',
                description: '過去のナビゲーションで保存されたメッセージも含めるか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },
        {
          name: 'arc_stop_console_capture',
          description: 'コンソールキャプチャを停止してログをクリアする',
          inputSchema: {
            type: 'object',
            properties: {
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        },

        // === スクリーンショット ===
        {
          name: 'arc_take_screenshot',
          description: 'スクリーンショットを取得する。mode="selection"で範囲選択、mode="window"でウィンドウ選択',
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                description: 'キャプチャモード: selection（ユーザーが範囲をドラッグ選択）、window（ユーザーがウィンドウをクリック選択）',
                enum: ['selection', 'window'],
                default: 'selection'
              },
              save_path: {
                type: 'string',
                description: '保存先パス（省略時は自動命名: screenshot_{mode}_{timestamp}.png）'
              }
            }
          }
        },

        // === ページ操作（DOM操作） ===
        {
          name: 'arc_click',
          description: '指定したセレクタの要素をクリックする',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              dblClick: {
                type: 'boolean',
                description: 'ダブルクリックするかどうか（デフォルト: false）',
                default: false
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'arc_hover',
          description: '指定したセレクタの要素にホバーする',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'arc_fill',
          description: 'input、textarea に値を入力する、または select から選択する',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSSセレクタ'
              },
              value: {
                type: 'string',
                description: '入力する値'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector', 'value']
          }
        },
        {
          name: 'arc_fill_form',
          description: '複数のフォーム要素に一括で値を入力する',
          inputSchema: {
            type: 'object',
            properties: {
              fields: {
                type: 'array',
                description: '入力するフィールドの配列',
                items: {
                  type: 'object',
                  properties: {
                    selector: { type: 'string', description: 'CSSセレクタ' },
                    value: { type: 'string', description: '入力する値' }
                  },
                  required: ['selector', 'value']
                }
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['fields']
          }
        },
        {
          name: 'arc_press_key',
          description: 'キーまたはキーの組み合わせを押す',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'キーまたは組み合わせ（例: "Enter", "Control+A", "Escape"）'
              },
              selector: {
                type: 'string',
                description: 'フォーカスする要素のCSSセレクタ（省略時はアクティブな要素）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'arc_drag',
          description: '要素を別の要素にドラッグ&ドロップする',
          inputSchema: {
            type: 'object',
            properties: {
              from_selector: {
                type: 'string',
                description: 'ドラッグ元のCSSセレクタ'
              },
              to_selector: {
                type: 'string',
                description: 'ドロップ先のCSSセレクタ'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['from_selector', 'to_selector']
          }
        },
        {
          name: 'arc_upload_file',
          description: 'ファイルアップロード用のinputにファイルパスを設定する',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'ファイルinputのCSSセレクタ'
              },
              file_path: {
                type: 'string',
                description: 'アップロードするファイルのローカルパス'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['selector', 'file_path']
          }
        },
        {
          name: 'arc_handle_dialog',
          description: 'ブラウザのダイアログ（alert, confirm, prompt）を処理する',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'ダイアログを承認するか却下するか',
                enum: ['accept', 'dismiss']
              },
              prompt_text: {
                type: 'string',
                description: 'promptダイアログに入力するテキスト（任意）'
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            },
            required: ['action']
          }
        },
        {
          name: 'arc_wait_for',
          description: '指定したテキストまたはセレクタがページに表示されるまで待機する',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: '待機するテキスト（部分一致）'
              },
              selector: {
                type: 'string',
                description: '待機する要素のCSSセレクタ'
              },
              timeout: {
                type: 'number',
                description: 'タイムアウト（ミリ秒、デフォルト: 30000）',
                default: 30000
              },
              tab_index: {
                type: 'number',
                description: 'タブのインデックス（指定しない場合はアクティブタブ）'
              }
            }
          }
        }
      ]
    }));

    // ツール実行ハンドラ
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // === タブ操作 ===
          case 'arc_open_url': {
            const { url, new_tab = true } = args;
            const escapedUrl = this.escapeForAppleScript(url);

            let script;
            if (new_tab) {
              script = `
                tell application "Arc"
                  tell front window
                    make new tab with properties {URL:"${escapedUrl}"}
                  end tell
                  activate
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  set URL of active tab of front window to "${escapedUrl}"
                  activate
                end tell
              `;
            }

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `Arc で ${url} を開きました`
              }]
            };
          }

          case 'arc_list_tabs': {
            const script = `
              tell application "Arc"
                tell front window
                  set tabsList to ""
                  set tabIndex to 1
                  repeat with t in tabs
                    set tabUrl to URL of t
                    set tabTitle to title of t
                    set tabsList to tabsList & tabIndex & "|||" & tabUrl & "|||" & tabTitle & "\\n"
                    set tabIndex to tabIndex + 1
                  end repeat
                end tell
                return tabsList
              end tell
            `;

            const result = await this.executeAppleScript(script);
            const tabs = result.split('\n')
              .filter(line => line.trim())
              .map(line => {
                const [index, url, title] = line.split('|||');
                return { index: parseInt(index), url, title };
              });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(tabs, null, 2)
              }]
            };
          }

          case 'arc_switch_tab': {
            const { tab_index, url } = args;

            let script;
            if (url) {
              const escapedUrl = this.escapeForAppleScript(url);
              script = `
                tell application "Arc"
                  tell front window
                    set tabIndex to 1
                    repeat with t in tabs
                      if URL of t contains "${escapedUrl}" then
                        tell tab tabIndex to select
                        activate
                        return "タブに切り替えました"
                      end if
                      set tabIndex to tabIndex + 1
                    end repeat
                    return "該当するタブが見つかりません"
                  end tell
                end tell
              `;
            } else if (tab_index) {
              script = `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index} to select
                  end tell
                  activate
                end tell
              `;
            } else {
              return {
                content: [{
                  type: 'text',
                  text: 'tab_index または url を指定してください'
                }],
                isError: true
              };
            }

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブ ${tab_index || url} に切り替えました`
              }]
            };
          }

          case 'arc_close_tab': {
            const { tab_index, url } = args;

            let script;
            if (url) {
              const escapedUrl = this.escapeForAppleScript(url);
              script = `
                tell application "Arc"
                  tell front window
                    repeat with t in tabs
                      if URL of t contains "${escapedUrl}" then
                        close t
                        return "タブを閉じました"
                      end if
                    end repeat
                    return "該当するタブが見つかりません"
                  end tell
                end tell
              `;
            } else if (tab_index) {
              script = `
                tell application "Arc"
                  tell front window
                    close tab ${tab_index}
                    return "タブ ${tab_index} を閉じました"
                  end tell
                end tell
              `;
            } else {
              script = `
                tell application "Arc"
                  tell front window
                    close active tab
                    return "アクティブタブを閉じました"
                  end tell
                end tell
              `;
            }

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_reload_tab': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index} to reload
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab to reload
                  end tell
                end tell
              `;

            await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: `タブ ${tab_index || 'アクティブ'} をリロードしました`
              }]
            };
          }

          // === ページ操作 ===
          case 'arc_execute_javascript': {
            const { code, tab_index } = args;

            // コードをasync IIFEでラップして実行（async/await対応、エラーハンドリング付き）
            const wrappedCode = `
              (async function() {
                try {
                  ${code}
                } catch (e) {
                  return JSON.stringify({ error: e.message, stack: e.stack });
                }
              })()
            `;

            const escapedCode = this.escapeForAppleScript(wrappedCode);

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${escapedCode}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${escapedCode}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{
                type: 'text',
                text: result || JSON.stringify({ success: true })
              }]
            };
          }

          case 'arc_get_page_content': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "document.body.innerText"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "document.body.innerText"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_html': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "document.documentElement.outerHTML"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "document.documentElement.outerHTML"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === ナビゲーション ===
          case 'arc_go_back': {
            const { tab_index } = args;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "history.back()"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "history.back()"
                    end tell
                  end tell
                end tell
              `;

            await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: '前のページに戻りました' }] };
          }

          // === Web開発向け機能 ===
          case 'arc_get_page_info': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify({
              url: window.location.href,
              title: document.title,
              viewport: { width: window.innerWidth, height: window.innerHeight },
              devicePixelRatio: window.devicePixelRatio,
              userAgent: navigator.userAgent,
              language: navigator.language,
              cookiesEnabled: navigator.cookieEnabled
            })`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_page_forms': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('form'))
                .map(form => ({
                  action: form.action,
                  method: form.method,
                  id: form.id,
                  name: form.name,
                  fields: Array.from(form.elements).map(el => ({
                    name: el.name,
                    type: el.type,
                    id: el.id
                  })).filter(f => f.name || f.id)
                }))
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_storage_info': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify({
              cookies: document.cookie.length,
              localStorage: {
                count: Object.keys(localStorage).length,
                keys: Object.keys(localStorage)
              },
              sessionStorage: {
                count: Object.keys(sessionStorage).length,
                keys: Object.keys(sessionStorage)
              }
            })`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_meta_tags': {
            const { tab_index } = args;
            const jsCode = `JSON.stringify(
              Array.from(document.querySelectorAll('meta'))
                .map(meta => ({
                  name: meta.name || meta.getAttribute('property') || meta.getAttribute('http-equiv'),
                  content: meta.content
                }))
                .filter(m => m.name && m.content)
            )`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === Cookie管理 ===
          case 'arc_get_cookies': {
            const { tab_index } = args;
            const jsCode = `(function() {
              const cookies = document.cookie.split(';').map(c => c.trim()).filter(c => c);
              const parsed = cookies.map(cookie => {
                const [name, ...valueParts] = cookie.split('=');
                return {
                  name: name,
                  value: valueParts.join('='),
                  raw: cookie
                };
              });
              return JSON.stringify({
                count: parsed.length,
                cookies: parsed
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === Network/API監視 ===
          case 'arc_start_network_monitor': {
            const { filter = '', tab_index } = args;
            const escapedFilter = this.escapeForAppleScript(filter);
            const jsCode = `(function() {
              if (window.__arcNetworkMonitor) {
                return JSON.stringify({ warning: 'ネットワーク監視は既に実行中です' });
              }

              // 過去のリクエストを保存（最大3回分のナビゲーション）
              if (!window.__arcPreservedRequests) {
                window.__arcPreservedRequests = [];
              }
              if (window.__arcNetworkRequests && window.__arcNetworkRequests.length > 0) {
                window.__arcPreservedRequests.push(...window.__arcNetworkRequests);
                // 最大300件に制限
                if (window.__arcPreservedRequests.length > 300) {
                  window.__arcPreservedRequests = window.__arcPreservedRequests.slice(-300);
                }
              }
              window.__arcNetworkRequests = [];
              window.__arcNetworkFilter = "${escapedFilter}";
              window.__arcNetworkRequestId = 0;

              // Fetch のオーバーライド
              const originalFetch = window.fetch;
              window.__arcOriginalFetch = originalFetch;
              window.fetch = async function(...args) {
                const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                const method = args[1]?.method || 'GET';
                const startTime = Date.now();

                const entry = {
                  id: window.__arcNetworkRequestId++,
                  type: 'fetch',
                  url: url,
                  method: method,
                  startTime: new Date(startTime).toISOString(),
                  status: 'pending'
                };

                if (!window.__arcNetworkFilter || url.includes(window.__arcNetworkFilter)) {
                  window.__arcNetworkRequests.push(entry);
                }

                try {
                  const response = await originalFetch.apply(this, args);
                  entry.status = response.status;
                  entry.statusText = response.statusText;
                  entry.duration = Date.now() - startTime;
                  return response;
                } catch (error) {
                  entry.status = 'error';
                  entry.error = error.message;
                  entry.duration = Date.now() - startTime;
                  throw error;
                }
              };

              // XHR のオーバーライド
              const originalXHROpen = XMLHttpRequest.prototype.open;
              const originalXHRSend = XMLHttpRequest.prototype.send;
              window.__arcOriginalXHROpen = originalXHROpen;
              window.__arcOriginalXHRSend = originalXHRSend;

              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this.__arcMethod = method;
                this.__arcUrl = url;
                return originalXHROpen.apply(this, [method, url, ...rest]);
              };

              XMLHttpRequest.prototype.send = function(...args) {
                const startTime = Date.now();
                const entry = {
                  id: window.__arcNetworkRequestId++,
                  type: 'xhr',
                  url: this.__arcUrl,
                  method: this.__arcMethod,
                  startTime: new Date(startTime).toISOString(),
                  status: 'pending'
                };

                if (!window.__arcNetworkFilter || this.__arcUrl.includes(window.__arcNetworkFilter)) {
                  window.__arcNetworkRequests.push(entry);
                }

                this.addEventListener('load', () => {
                  entry.status = this.status;
                  entry.statusText = this.statusText;
                  entry.duration = Date.now() - startTime;
                });

                this.addEventListener('error', () => {
                  entry.status = 'error';
                  entry.duration = Date.now() - startTime;
                });

                return originalXHRSend.apply(this, args);
              };

              window.__arcNetworkMonitor = true;
              return JSON.stringify({
                message: 'ネットワーク監視を開始しました',
                filter: window.__arcNetworkFilter || '(フィルタなし)'
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_network_requests': {
            const { limit = 50, includePreservedRequests = false, tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcNetworkRequests) {
                return JSON.stringify({ error: 'ネットワーク監視が開始されていません。arc_start_network_monitorを先に実行してください' });
              }
              let allRequests = window.__arcNetworkRequests;
              let preservedCount = 0;
              if (${includePreservedRequests} && window.__arcPreservedRequests) {
                preservedCount = window.__arcPreservedRequests.length;
                allRequests = [...window.__arcPreservedRequests, ...window.__arcNetworkRequests];
              }
              const requests = allRequests.slice(-${limit});
              return JSON.stringify({
                count: requests.length,
                total: allRequests.length,
                currentCount: window.__arcNetworkRequests.length,
                preservedCount: preservedCount,
                requests: requests
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_stop_network_monitor': {
            const { tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcNetworkMonitor) {
                return JSON.stringify({ warning: 'ネットワーク監視は実行されていません' });
              }

              // Fetch を復元
              if (window.__arcOriginalFetch) {
                window.fetch = window.__arcOriginalFetch;
                delete window.__arcOriginalFetch;
              }

              // XHR を復元
              if (window.__arcOriginalXHROpen) {
                XMLHttpRequest.prototype.open = window.__arcOriginalXHROpen;
                delete window.__arcOriginalXHROpen;
              }
              if (window.__arcOriginalXHRSend) {
                XMLHttpRequest.prototype.send = window.__arcOriginalXHRSend;
                delete window.__arcOriginalXHRSend;
              }

              const count = window.__arcNetworkRequests ? window.__arcNetworkRequests.length : 0;
              delete window.__arcNetworkRequests;
              delete window.__arcNetworkFilter;
              delete window.__arcNetworkMonitor;

              return JSON.stringify({
                message: 'ネットワーク監視を停止しました',
                capturedRequests: count
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // Console監視
          case 'arc_start_console_capture': {
            const { levels = ['log', 'info', 'warn', 'error', 'debug'], tab_index } = args;
            const levelsJson = JSON.stringify(levels);
            const jsCode = `(function() {
              if (window.__arcConsoleCapture) {
                return JSON.stringify({ warning: 'コンソールキャプチャは既に実行中です' });
              }

              // 過去のログを保存（最大3回分のナビゲーション）
              if (!window.__arcPreservedLogs) {
                window.__arcPreservedLogs = [];
              }
              if (window.__arcConsoleLogs && window.__arcConsoleLogs.length > 0) {
                window.__arcPreservedLogs.push(...window.__arcConsoleLogs);
                // 最大500件に制限
                if (window.__arcPreservedLogs.length > 500) {
                  window.__arcPreservedLogs = window.__arcPreservedLogs.slice(-500);
                }
              }
              window.__arcConsoleLogs = [];
              window.__arcOriginalConsole = {};
              window.__arcConsoleLogId = 0;
              const levels = ${levelsJson};

              levels.forEach(level => {
                window.__arcOriginalConsole[level] = console[level];
                console[level] = function(...args) {
                  window.__arcConsoleLogs.push({
                    id: window.__arcConsoleLogId++,
                    level: level,
                    timestamp: new Date().toISOString(),
                    message: args.map(arg => {
                      try {
                        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                      } catch (e) {
                        return String(arg);
                      }
                    }).join(' ')
                  });
                  window.__arcOriginalConsole[level].apply(console, args);
                };
              });

              // エラーイベントもキャプチャ
              window.__arcErrorHandler = function(event) {
                window.__arcConsoleLogs.push({
                  id: window.__arcConsoleLogId++,
                  level: 'error',
                  timestamp: new Date().toISOString(),
                  message: event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno,
                  type: 'uncaught'
                });
              };
              window.addEventListener('error', window.__arcErrorHandler);

              // unhandled promise rejection もキャプチャ
              window.__arcRejectionHandler = function(event) {
                window.__arcConsoleLogs.push({
                  id: window.__arcConsoleLogId++,
                  level: 'error',
                  timestamp: new Date().toISOString(),
                  message: 'Unhandled Promise Rejection: ' + (event.reason?.message || event.reason || 'Unknown'),
                  type: 'unhandledrejection'
                });
              };
              window.addEventListener('unhandledrejection', window.__arcRejectionHandler);

              window.__arcConsoleCapture = true;
              return JSON.stringify({
                message: 'コンソールキャプチャを開始しました',
                levels: levels
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_get_console_logs': {
            const { level = 'all', limit = 100, includePreservedMessages = false, tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcConsoleLogs) {
                return JSON.stringify({ error: 'コンソールキャプチャが開始されていません。arc_start_console_captureを先に実行してください' });
              }
              let allLogs = window.__arcConsoleLogs;
              let preservedCount = 0;
              if (${includePreservedMessages} && window.__arcPreservedLogs) {
                preservedCount = window.__arcPreservedLogs.length;
                allLogs = [...window.__arcPreservedLogs, ...window.__arcConsoleLogs];
              }
              let logs = allLogs;
              if ("${level}" !== 'all') {
                logs = logs.filter(log => log.level === "${level}");
              }
              logs = logs.slice(-${limit});

              const summary = {
                log: allLogs.filter(l => l.level === 'log').length,
                info: allLogs.filter(l => l.level === 'info').length,
                warn: allLogs.filter(l => l.level === 'warn').length,
                error: allLogs.filter(l => l.level === 'error').length,
                debug: allLogs.filter(l => l.level === 'debug').length
              };

              return JSON.stringify({
                filter: "${level}",
                count: logs.length,
                total: allLogs.length,
                currentCount: window.__arcConsoleLogs.length,
                preservedCount: preservedCount,
                summary: summary,
                logs: logs
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          case 'arc_stop_console_capture': {
            const { tab_index } = args;
            const jsCode = `(function() {
              if (!window.__arcConsoleCapture) {
                return JSON.stringify({ warning: 'コンソールキャプチャは実行されていません' });
              }

              // console を復元
              if (window.__arcOriginalConsole) {
                Object.keys(window.__arcOriginalConsole).forEach(level => {
                  console[level] = window.__arcOriginalConsole[level];
                });
                delete window.__arcOriginalConsole;
              }

              // イベントリスナーを削除
              if (window.__arcErrorHandler) {
                window.removeEventListener('error', window.__arcErrorHandler);
                delete window.__arcErrorHandler;
              }
              if (window.__arcRejectionHandler) {
                window.removeEventListener('unhandledrejection', window.__arcRejectionHandler);
                delete window.__arcRejectionHandler;
              }

              const count = window.__arcConsoleLogs ? window.__arcConsoleLogs.length : 0;
              delete window.__arcConsoleLogs;
              delete window.__arcConsoleCapture;

              return JSON.stringify({
                message: 'コンソールキャプチャを停止しました',
                capturedLogs: count
              });
            })()`;

            const script = tab_index
              ? `
                tell application "Arc"
                  tell front window
                    tell tab ${tab_index}
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `
              : `
                tell application "Arc"
                  tell front window
                    tell active tab
                      execute javascript "${this.escapeForAppleScript(jsCode)}"
                    end tell
                  end tell
                end tell
              `;

            const result = await this.executeAppleScript(script);
            return { content: [{ type: 'text', text: result }] };
          }

          // === スクリーンショット ===
          case 'arc_take_screenshot': {
            const { mode = 'selection', save_path } = args;
            const fs = await import('fs');
            const path = await import('path');
            const os = await import('os');

            // タイムスタンプ生成（YYYYMMDD_HHmmss形式）
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
              String(now.getMonth() + 1).padStart(2, '0') +
              String(now.getDate()).padStart(2, '0') + '_' +
              String(now.getHours()).padStart(2, '0') +
              String(now.getMinutes()).padStart(2, '0') +
              String(now.getSeconds()).padStart(2, '0');

            // デフォルトの保存先（プロジェクトルートまたは現在のディレクトリ）
            const defaultPath = save_path || `screenshot_${mode}_${timestamp}.png`;

            // === selection モード: ユーザーが範囲を選択してキャプチャ ===
            if (mode === 'selection') {
              try {
                // Arc をアクティブにする
                await this.executeAppleScript(`tell application "Arc" to activate`);
                await new Promise(resolve => setTimeout(resolve, 300));

                // インタラクティブモード: ユーザーが範囲をドラッグして選択
                // -i: インタラクティブ, -s: 選択モード（範囲選択のみ）
                await execFileAsync('screencapture', ['-i', '-s', defaultPath]);

                // ファイルを確認（ユーザーがキャンセルした場合は作成されない）
                if (fs.existsSync(defaultPath)) {
                  const stats = fs.statSync(defaultPath);
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'completed',
                        mode: 'selection',
                        message: `スクリーンショットを保存しました: ${defaultPath}`,
                        size: stats.size,
                        path: defaultPath
                      }, null, 2)
                    }]
                  };
                } else {
                  // ユーザーがキャンセルした場合
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'cancelled',
                        message: 'スクリーンショットがキャンセルされました'
                      }, null, 2)
                    }]
                  };
                }
              } catch (error) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({ error: `スクリーンショットエラー: ${error.message}` })
                  }],
                  isError: true
                };
              }
            }

            // === window モード: ユーザーがウィンドウをクリックしてキャプチャ ===
            if (mode === 'window') {
              try {
                // Arc をアクティブにする
                await this.executeAppleScript(`tell application "Arc" to activate`);
                await new Promise(resolve => setTimeout(resolve, 300));

                // インタラクティブモード: ユーザーがウィンドウをクリックして選択
                // -i: インタラクティブ, -w: ウィンドウモード, -o: 影なし
                await execFileAsync('screencapture', ['-i', '-w', '-o', defaultPath]);

                // ファイルを確認
                if (fs.existsSync(defaultPath)) {
                  const stats = fs.statSync(defaultPath);
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'completed',
                        mode: 'window',
                        message: `スクリーンショットを保存しました: ${defaultPath}`,
                        size: stats.size,
                        path: defaultPath
                      }, null, 2)
                    }]
                  };
                } else {
                  // ユーザーがキャンセルした場合
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        status: 'cancelled',
                        message: 'スクリーンショットがキャンセルされました'
                      }, null, 2)
                    }]
                  };
                }
              } catch (error) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({ error: `スクリーンショットエラー: ${error.message}` })
                  }],
                  isError: true
                };
              }
            }

            // 不明なモード
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: `不明なモード: ${mode}。selection または window を指定してください。` })
              }],
              isError: true
            };
          }

          // === ページ操作（DOM操作） ===
          case 'arc_click': {
            const { selector, dblClick = false, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);

            const clickType = dblClick ? 'dblclick' : 'click';
            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const event = new MouseEvent("${clickType}", {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(event);
                if (!${dblClick}) {
                  el.click();
                }
                return JSON.stringify({ success: true, selector: "${escapedSelector}", action: "${clickType}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_hover': {
            const { selector, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);

            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const event = new MouseEvent('mouseover', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(event);
                const enterEvent = new MouseEvent('mouseenter', {
                  bubbles: false,
                  cancelable: true,
                  view: window
                });
                el.dispatchEvent(enterEvent);
                return JSON.stringify({ success: true, selector: "${escapedSelector}", action: "hover" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_fill': {
            const { selector, value, tab_index } = args;
            const escapedSelector = this.escapeForAppleScript(selector);
            const escapedValue = this.escapeForAppleScript(value);

            const jsCode = `
              (function() {
                const el = document.querySelector("${escapedSelector}");
                if (!el) {
                  return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                }
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();

                if (el.tagName === 'SELECT') {
                  el.value = "${escapedValue}";
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                  el.value = "${escapedValue}";
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  el.textContent = "${escapedValue}";
                }
                return JSON.stringify({ success: true, selector: "${escapedSelector}", value: "${escapedValue}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_fill_form': {
            const { fields, tab_index } = args;

            const jsCode = `
              (function() {
                const fields = ${JSON.stringify(fields)};
                const results = [];
                for (const field of fields) {
                  const el = document.querySelector(field.selector);
                  if (!el) {
                    results.push({ selector: field.selector, error: "要素が見つかりません" });
                    continue;
                  }
                  el.focus();
                  if (el.tagName === 'SELECT') {
                    el.value = field.value;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = field.value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  results.push({ selector: field.selector, success: true });
                }
                return JSON.stringify({ results });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_press_key': {
            const { key, selector, tab_index } = args;
            const escapedKey = this.escapeForAppleScript(key);
            const escapedSelector = selector ? this.escapeForAppleScript(selector) : '';

            const jsCode = `
              (function() {
                let targetEl = document.activeElement;
                ${selector ? `
                  targetEl = document.querySelector("${escapedSelector}");
                  if (!targetEl) {
                    return JSON.stringify({ error: "要素が見つかりません: ${escapedSelector}" });
                  }
                  targetEl.focus();
                ` : ''}

                const keyStr = "${escapedKey}";
                const parts = keyStr.split('+');
                const keyName = parts[parts.length - 1];
                const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

                const event = new KeyboardEvent('keydown', {
                  key: keyName,
                  code: 'Key' + keyName.toUpperCase(),
                  bubbles: true,
                  cancelable: true,
                  ctrlKey: modifiers.includes('control') || modifiers.includes('ctrl'),
                  altKey: modifiers.includes('alt'),
                  shiftKey: modifiers.includes('shift'),
                  metaKey: modifiers.includes('meta') || modifiers.includes('command') || modifiers.includes('cmd')
                });
                targetEl.dispatchEvent(event);

                const keyupEvent = new KeyboardEvent('keyup', {
                  key: keyName,
                  code: 'Key' + keyName.toUpperCase(),
                  bubbles: true,
                  cancelable: true
                });
                targetEl.dispatchEvent(keyupEvent);

                return JSON.stringify({ success: true, key: "${escapedKey}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_drag': {
            const { from_selector, to_selector, tab_index } = args;
            const escapedFrom = this.escapeForAppleScript(from_selector);
            const escapedTo = this.escapeForAppleScript(to_selector);

            const jsCode = `
              (function() {
                const fromEl = document.querySelector("${escapedFrom}");
                const toEl = document.querySelector("${escapedTo}");

                if (!fromEl) {
                  return JSON.stringify({ error: "ドラッグ元の要素が見つかりません: ${escapedFrom}" });
                }
                if (!toEl) {
                  return JSON.stringify({ error: "ドロップ先の要素が見つかりません: ${escapedTo}" });
                }

                const fromRect = fromEl.getBoundingClientRect();
                const toRect = toEl.getBoundingClientRect();

                const dragStartEvent = new DragEvent('dragstart', {
                  bubbles: true,
                  cancelable: true,
                  clientX: fromRect.left + fromRect.width / 2,
                  clientY: fromRect.top + fromRect.height / 2
                });
                fromEl.dispatchEvent(dragStartEvent);

                const dragOverEvent = new DragEvent('dragover', {
                  bubbles: true,
                  cancelable: true,
                  clientX: toRect.left + toRect.width / 2,
                  clientY: toRect.top + toRect.height / 2
                });
                toEl.dispatchEvent(dragOverEvent);

                const dropEvent = new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  clientX: toRect.left + toRect.width / 2,
                  clientY: toRect.top + toRect.height / 2
                });
                toEl.dispatchEvent(dropEvent);

                const dragEndEvent = new DragEvent('dragend', {
                  bubbles: true,
                  cancelable: true
                });
                fromEl.dispatchEvent(dragEndEvent);

                return JSON.stringify({ success: true, from: "${escapedFrom}", to: "${escapedTo}" });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_upload_file': {
            const { selector, file_path, tab_index } = args;

            // ファイルアップロードはJavaScriptからセキュリティ上直接できないため、
            // ファイル選択ダイアログをトリガーする方法を案内
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: 'ファイルアップロードはセキュリティ上の制約により、JavaScriptから直接実行できません。',
                  suggestion: 'arc_clickでファイルinputをクリックし、手動でファイルを選択するか、Playwrightを使用してください。',
                  selector: selector,
                  file_path: file_path
                })
              }],
              isError: true
            };
          }

          case 'arc_handle_dialog': {
            const { action, prompt_text, tab_index } = args;

            // ブラウザダイアログはJavaScriptから事前にフックする必要がある
            const escapedPromptText = prompt_text ? this.escapeForAppleScript(prompt_text) : '';

            const jsCode = `
              (function() {
                // ダイアログをフックして自動処理する
                const originalAlert = window.alert;
                const originalConfirm = window.confirm;
                const originalPrompt = window.prompt;

                window.alert = function(msg) {
                  console.log('Alert intercepted:', msg);
                  return undefined;
                };

                window.confirm = function(msg) {
                  console.log('Confirm intercepted:', msg);
                  return ${action === 'accept' ? 'true' : 'false'};
                };

                window.prompt = function(msg, defaultValue) {
                  console.log('Prompt intercepted:', msg);
                  return ${action === 'accept' ? `"${escapedPromptText}"` : 'null'};
                };

                return JSON.stringify({
                  success: true,
                  action: "${action}",
                  note: "ダイアログハンドラーを設定しました。次回のダイアログは自動的に処理されます。"
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          case 'arc_wait_for': {
            const { text, selector, timeout = 30000, tab_index } = args;
            const escapedText = text ? this.escapeForAppleScript(text) : '';
            const escapedSelector = selector ? this.escapeForAppleScript(selector) : '';

            const jsCode = `
              (function() {
                return new Promise((resolve) => {
                  const startTime = Date.now();
                  const timeoutMs = ${timeout};

                  function check() {
                    ${text ? `
                      if (document.body.innerText.includes("${escapedText}")) {
                        resolve(JSON.stringify({ success: true, found: "text", text: "${escapedText}" }));
                        return;
                      }
                    ` : ''}
                    ${selector ? `
                      if (document.querySelector("${escapedSelector}")) {
                        resolve(JSON.stringify({ success: true, found: "selector", selector: "${escapedSelector}" }));
                        return;
                      }
                    ` : ''}

                    if (Date.now() - startTime > timeoutMs) {
                      resolve(JSON.stringify({ error: "タイムアウト: 要素が見つかりませんでした", timeout: timeoutMs }));
                      return;
                    }

                    setTimeout(check, 100);
                  }

                  check();
                });
              })()
            `;

            const script = tab_index
              ? `tell application "Arc" to tell window 1 to tell tab ${tab_index} to execute javascript "${this.escapeForAppleScript(jsCode)}"`
              : `tell application "Arc" to tell active tab of window 1 to execute javascript "${this.escapeForAppleScript(jsCode)}"`;

            const result = await this.executeAppleScript(script);
            return {
              content: [{ type: 'text', text: result || JSON.stringify({ success: true }) }]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `エラー: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Arc-Lite MCP server running on stdio');
  }
}

const server = new ArcLiteServer();
server.run().catch(console.error);
