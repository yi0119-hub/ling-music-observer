# 玲的記憶雲端核心：下一步部署清單

本資料夾只提供獨立 Worker 原型，與既有音樂觀察室的 `ling-shared-core` 沒有程式相依。預設僅對外部 Drive / Notion 執行讀取與差異報告，不支援正式雲端寫回。

## 已驗證與尚待驗證

- 已驗證：Node.js 22 的 `npm test` 16/16 通過，敏感資訊欄位阻擋、去重、唯讀掃描模擬測試。
- 尚未驗證：Cloudflare 上線、遠端 D1 migrations、Google OAuth/Notion 私有 Integration 能否存取指定測試資料。
- 對 ChatGPT 內建記憶沒有直接匯出能力；此服務只處理另外明確授權提供的內容。

## 一次性部署（請由老大親自登入；不要傳任何金鑰給玲）

1. Cloudflare Dashboard 新建專用 D1 `ling_memory`。不要與音樂觀察室共用 D1。
2. 於 `memory-sync/wrangler.jsonc` 把 `REPLACE_WITH_YOUR_D1_DATABASE_ID` 換成新 D1 UUID。UUID 不是密碼。
3. 若在 Windows 11，先安裝 Node.js 22+。於本專案的 `memory-sync` 資料夾執行：

   ```powershell
   npm install
   npm test
   npx wrangler login
   npx wrangler d1 migrations apply ling_memory --remote
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler deploy
   ```

4. `ADMIN_TOKEN` 請在本機用安全亂數建立並自行保存，不要放進 GitHub、聊天或 URL。未設定時 `/api/*` 將拒絕存取。
5. 開啟實際部署網址的 `/health`，應見 `mode: READ_ONLY`；再用自己的管理 token 呼叫 `/api/sync/check`，尚無額外憑證時出現 `not_configured` 才是預期結果。
6. 隨後才分別設定專用 Notion Integration 與 Google OAuth 離線授權，僅授權測試用的頁面或資料夾。這些都是 Cloudflare Worker Secrets，不能硬寫在 `wrangler.jsonc`。
7. 確認 `scans` 皆 `read_ok`、資料未超限且差異報告合理，之後才討論正式記憶的核准寫回方案。

Cloudflare Cron 採 UTC：每天 `0 15 * * *`（台灣 23:00）、每週日 `0 11 * * SUN`（台灣 19:00）。

## GitHub 開發方式

此版先放在 `feature/ling-memory-sync-v04` 分支，保留正式 `main` 音樂網站不變。GitHub Actions 只執行程式測試，不會自動部署或修改 Cloudflare。
