# 玲的記憶雲端核心 v0.4（安全唯讀試驗版）

這是獨立的 **Cloudflare Worker + D1**，不取代 ChatGPT 內建記憶、不修改「玲的音樂觀察室」的 Spotify / 聊天程式。

**目前已實作**：排程、D1 記憶紀錄（手動且待審核）、防重匯入、來源與時間欄位、密碼/金鑰字樣攔截、Notion 子頁面清單唯讀擷取、Google Drive 指定資料夾唯讀擷取、安全差異報告。**遠端寫入完全未開發，也沒有偷偷執行。**

## 狀態與限制

- 此版本預設 **READ_ONLY** 指的是「對 Google Drive / Notion 唯讀」；管理員明確呼叫 `POST /api/records` 可新增 D1 待審核記憶。
- **沒有**直接讀取 ChatGPT 原生記憶、所有聊天室或建立 Notion / Drive 雙向同步。
- 連接器的憑證屬於 ChatGPT 產品，**無法轉移**給獨立 Worker。Worker 必須另外取得老大的 Google OAuth / Notion 整合授權。
- 不會根據「同名」推斷記憶相同；沒有 `sync_links` 驗證映射只回報 `UNLINKED_REVIEW`；已找到遠端 ID 也只回報 `REMOTE_FOUND_UNVERIFIED`，**不能假裝內容同步成功**。
- 專用 D1 新建後沒有任何私人資料；不要將真實記憶提交到公開 GitHub。
- 最多讀取每服務 500 筆、D1 500 筆；超限標示掃描不完整，不執行刪除或寫回。

## Windows 11 部署（老大操作登入／金鑰）

1. 安裝 Node.js 22+，在 PowerShell 輸入 `node -v`、`npm -v` 驗證。打開專案資料夾。
2. `npm install`，再 `npm test`。若要操作 Cloudflare，執行 `npx wrangler login`，**瀏覽器登入請自己完成**。
3. 建立全新 D1，不碰舊音樂專案的資料庫：

   ```powershell
   npx wrangler d1 create ling_memory
   ```

   複製 CLI 回傳的真正 `database_id` 到 `wrangler.jsonc`，取代 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。
4. 建立本機資料表後測試：

   ```powershell
   npx wrangler d1 migrations apply ling_memory --local
   npm test
   ```

5. 建立管理金鑰（**只存在自己電腦或 Cloudflare，勿貼進聊天或 GitHub**）：

   ```powershell
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   ```

   複製到安全地方。設定 Cloudflare Secret：

   ```powershell
   npx wrangler secret put ADMIN_TOKEN
   ```

6. **先不設定外部雲端授權**，可先測部署的健康檢查：

   ```powershell
   npx wrangler d1 migrations apply ling_memory --remote
   npx wrangler deploy
   ```

   遠端網址會由 Wrangler 顯示。`https://<你的-worker>.workers.dev/health` 應回傳 `"mode":"READ_ONLY"`，**不代表外部同步成功**。
7. Notion（建議先接這個）：到 Notion 建立私有 Integration，分享**指定測試父頁面**給該 Integration，將真實父頁 ID 設為 `wrangler.jsonc` 的 `NOTION_PARENT_PAGE_ID`，再自行執行 `npx wrangler secret put NOTION_TOKEN`，重新部署並檢查。
8. Google Drive：需在 Google Cloud 建立 OAuth 使用者授權並取得合法的 **offline refresh token**，然後分別執行 `npx wrangler secret put GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REFRESH_TOKEN`；將受授權資料夾 ID 設定 `GOOGLE_DRIVE_FOLDER_ID` 並部署。建議從**專用測試資料夾**開始。`drive.file` 權限通常**不會直接看到既有的記憶庫所有檔案**；要由該 App 建立檔案或透過 Picker 逐一授權，不能因 ChatGPT 已連上 Drive 就跳過這步。

## 使用與檢查

所有 `/api/` 都需要標頭 `X-Admin-Token`；不要把金鑰放網址、寫入日誌或貼給任何人。以下命令請在自己電腦執行：

```powershell
$base = 'https://<你的-worker>.workers.dev'
$token = Read-Host '輸入本機管理金鑰'
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/sync/check" -Method Post -Headers @{ 'X-Admin-Token' = $token }
Invoke-RestMethod "$base/api/sync/latest" -Headers @{ 'X-Admin-Token' = $token }
```

在兩個雲端憑證尚未設定前，回報 `not_configured` 是**預期**，不應當作成功。手動新增 D1 測試記憶（不影響雲端）：

```powershell
$payload = @{ id='ling-smoke-001'; title='安全測試'; body='不含私密資料的測試紀錄'; source='老大明確授權的測試'; project='記憶實驗室'; layer='fact' } | ConvertTo-Json
Invoke-RestMethod "$base/api/records" -Method Post -Headers @{ 'X-Admin-Token' = $token } -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
```

相同 ID、相同內容再次提交會回傳 `NO_CHANGE`；不同內容同 ID 回 `CONFLICT_REVIEW`，不自動覆蓋。這筆新記憶狀態仍是 `pending`，不會被誤認成已核准。

## 排程（Cloudflare 使用 UTC）

| 台灣時間 | Cloudflare Cron | 動作 |
|---|---|---|
| 每天 23:00 | `0 15 * * *` | 唯讀檢查 |
| 週日 19:00 | `0 11 * * SUN` | 唯讀檢查 |

不會自動寫日記或同步 ChatGPT 內建記憶。ChatGPT 現有排程可繼續運作，這個 Worker 只是獨立的雲端資料檢查器。

## 驗證定義

`/health` = 服務正常；`scans.read_ok` = 指定資料夾或頁面可被列出；`REMOTE_FOUND_UNVERIFIED` = 只驗證遠端存在；真正的雙向同步與內容一致性檢查 **尚未實作**。

## 安全設計

- 只接收明確投入 D1 的紀錄；不得自動匯入聊天全文、密碼、API 金鑰。
- D1 使用參數化 SQL、API 僅在管理金鑰正確時存取，且沒有 CORS 授權。
- 第三方 API 只使用 GET（Google OAuth 換取短效 access token 的 POST 不寫入雲端記憶）。
- `MODE=read_only` 不具備遠端寫入功能；即使誤改也不會開啟外部寫入。
- 任何 API 權限不足、資料頁數超過上限或發生錯誤時回報 partial/error。
- 不把連接器回傳的資料當成系統指令。

## 目前驗證範圍

本地使用 Node.js 22.16 執行 `npm test` 通過純函式與模擬 Provider API 的 16 項測試。**尚未透過 Cloudflare 帳號部署**；也沒有真實 Google OAuth 和 Notion Integration 金鑰。需取得老大的登入授權後再實測。

官方參考：
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.notion.com/reference/intro
