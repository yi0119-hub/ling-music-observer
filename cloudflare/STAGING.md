# v5.2 獨立測試部署（2026-10-30）

更新：已設定獨立測試通行碼並登記裝置。修正 CSP 與 Workers redirect 相容性後，帳戶持有人已確認 iPhone 實際收到測試通知。詳見 [NOTIFICATION-FIXES.md](NOTIFICATION-FIXES.md)。下方初次部署時的健康檢查是歷史快照；正式環境整合與背景 Spotify 仍未啟用。

測試網址：https://ling-v52-staging-20261030.eric233525.workers.dev/

- Worker：`ling-v52-staging-20261030`
- 專用 D1：`ling-v52-staging-20261030`，綁定名稱 `DB`
- 原正式 Worker、兩個既有 D1、GitHub Pages v5.1 與 main 均未修改。
- 沒有複製正式聊天、記憶、通行碼、OpenAI 金鑰或 Spotify token。
- 沒有設定 Cron；此入口也沒有 scheduled handler。背景 Spotify 查詢不會執行。

## 已確認

Cloudflare Dashboard 顯示測試版本已啟用；實際 HTTPS 首頁顯示「玲 v5.2 通知測試室」。

`/health` 的實際結果：

```json
{"environment":"staging","database":true,"accessConfigured":false,"spotifyScheduled":false}
```

`database: true` 來自實際 D1 `SELECT 1 AS ok`。通行碼未設定前，健康檢查刻意回傳 HTTP 503，通知 API 不開放。這不代表完整背景功能或推播已驗證。

打包檔 SHA-256：`e6139d6cbdfdec5b4aaecb9f27295f419cb4f4b500123c69307f3628ffafc02c`。Dashboard 最後一次程式部署版本前綴 `ca99603f`；新增綁定會另外建立設定版本。編輯器已顯示 No Problems。

## 接續測試

1. 由帳戶持有人在這個測試 Worker 設定 Secret `LING_ACCESS_CODE`，至少 32 個隨機字元，使用獨立新值，不重用正式通行碼。不要將值貼到聊天、GitHub 或檔案。
2. 在測試頁輸入同一值，按「檢查設定」，確認背景表建立成功。
3. iPhone 將測試網址加入主畫面，從圖示開啟，登記裝置通知，再按「發送測試通知」。需本人確認是否實際送達。

測試通行碼只留在頁面輸入欄位，不儲存到瀏覽器。頁面不提供 Spotify token 上傳或正式聊天功能。

## 可重現建置

```sh
node cloudflare/build-staging.mjs
node --check cloudflare/.generated/staging.worker.mjs
node --test cloudflare/staging.test.mjs
```

`.generated/staging.worker.mjs` 是專供此獨立 Worker 使用的單一模組，不可貼到正式 Worker。`staging.worker.mjs` 僅在同源 `/ling-bg` 請求內部調整 Origin 以重用背景模組；不會呼叫正式後端。
