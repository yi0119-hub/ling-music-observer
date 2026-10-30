> 目前狀態與正式上線限制以 [RELEASE-READINESS.md](RELEASE-READINESS.md) 為準；以下包含早期階段紀錄。

# Spotify 背景查詢：獨立測試版

部署紀錄：測試程式版本 `7d90afa7` 已啟用；Dashboard 已儲存並顯示 `Every 10 minutes` 的 Cron（僅此測試 Worker）。帳戶持有人已確認新增 Redirect URI。Spotify 帳號仍需由本人在頁面完成授權與啟用，這兩個動作不能由部署紀錄代替。

測試網址與 Redirect URI（完整相同，包含結尾 `/`）：

`https://ling-v52-staging-20261030.eric233525.workers.dev/`

## 啟用流程

1. 在既有 Spotify Developer App 新增上方 Redirect URI；保留所有原本網址。這是新測試來源的 OAuth 接收位置，需要帳戶持有人核對並儲存。
2. 在手機測試頁輸入獨立測試通行碼及既有 App 的公開 Client ID（不是 Client Secret）。
3. 勾選雲端背景查詢說明，按「連接 Spotify」，由本人完成 Spotify 登入與授權。
4. 回到測試頁後，重新輸入通行碼及勾選說明，按「啟用背景查詢」。成功後請按「檢查設定」確認。

啟用前不會上傳 token 或查詢帳號。授權回傳的 refresh token 僅暫存在頁面記憶體，待本人按啟用後傳送至同源測試 API，由既有背景模組加密存入全新測試 D1。網頁不保存 access/refresh token 或測試通行碼。PKCE verifier/state 使用短期 localStorage 以支援 iPhone 授權返回；驗證期限十分鐘，回呼時立即刪除。回呼 URL 的 code/state 在發出其他請求前清除。

## 排程與提醒

- 測試 Worker 專用 Cron：`*/2 * * * *`。僅處理這個排程，不啟用每日問候。
- 未授權或已關閉時，排程不會發出 Spotify 請求。
- 首次有效歌曲查詢建立基準，不發提醒；之後歌曲指紋變化才發送。
- 09:00–23:00（Asia/Taipei）可發歌曲變化提醒，最多每十五分鐘一次。
- 只保留最後歌曲指紋及查詢時間／結果，不保留歌名、歌手或播放歷史，不傳給 AI。
- Spotify 429 會等待 Retry-After，授權失效會停用並刪除保存的 refresh token。
- 「關閉並刪除授權」會移除測試 D1 的 Spotify token、clientId、開關、指紋及查詢狀態。

狀態 API 回傳上次查詢時間、結果與限流等待時間，不回傳任何 token。

## 驗證

46 項測試通過，新增 PKCE challenge/最小 scope、缺少同意不啟動、state/期限/回呼來源驗證、授權與啟用分開、token 不持久保存、沿用既有每日問候偏好及限定排程派送等測試。

測試包 SHA-256：`e1f15676cbb5c0e93b78e3d797d1a8e72785e100da55a530f70c4e5e4f0d2f28`。測試頁預填本人提供的公開 Client ID，不包含 Client Secret。

仍需本人完成 Spotify 開發者設定與帳號授權；不得將測試頁已部署或 Cron 已設定，宣稱為真實 Spotify 播放查詢已通過。

參考：[Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)、[Redirect URI](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)、[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)。


2026-10-30：獨立測試室改為每 2 分鐘查詢，每天最多 720 次。歌曲通知仍維持 15 分鐘間隔與台北 23:00–09:00 安靜時段。共用模組預設保留 10 分鐘，只有測試室覆寫為 2 分鐘，正式環境不變。使用者已回報 Spotify 背景功能啟用成功。
