# v5.2 正式發佈紀錄（2026-10-30，台北時間）

使用者已明確授權合併 PR #4、更新正式 Worker、只新增背景功能資料表並保留原聊天與記憶。

## 已完成

- PR #4 已合併至 main，發佈 commit：`a9d8352740d9a6401befb36427017cc7515ec82d`。
- GitHub Pages build and deployment `41066364510` 成功；正式網站回應 200，已確認兩分鐘說明、新版背景程式與同源 Service Worker CSP。
- 正式 Worker `still-sea-162cling-shared-core`：原版本 `8919d171` → 新版本 `73d6fcc2`。使用 Dashboard 只更新程式，保留全部既有設定、Secrets、原 `ling-memory` D1 綁定及相容日期 `2026-10-29`。
- 正式程式與已審查打包產物逐字比對（僅正規化換行）一致。產物 SHA-256：`ae03c324f1de3026f028ca507189df456fb08bd86a11c53a0cb3dc4f338f07cc`。
- 已儲存並重新開啟確認正式 Cron 為 `*/2 * * * *`。未新增每日問候排程；前端清楚標示每日問候尚未開放。
- 只新增 `ling_v4_settings`、`ling_v4_push`、`ling_v4_jobs`、`ling_v4_dispatch` 四張背景表。部署後正式聊天、記憶、頻率限制與自增序號的 JSON 內容與切換前私有備份完全一致。
- 正式 history 與 bg_status 介面未登入均回應 401；錯誤 Origin 回應 403；背景 POST 的 CORS 預檢回應 204。背景程式、Service Worker、manifest、通知圖示均回應 200；瀏覽器沒有偵測到腳本錯誤。
- 發佈程式 46 項自動測試通過（Actions `41065908023`），實際打包產物通過正式來源的 8 項本機相容性比對；切換前更新備份與 D1 書籤並通過本機還原演練。

## 裝置啟用範圍

獨立測試室的背景換歌通知已經本人實測成功。正式網站來源不同，訂閱、授權和通行碼不會從測試室複製。正式功能預設關閉，需本人在 iPhone 主畫面正式 App 內登記通知、測試送達、勾選歌曲提醒並儲存偏好，再完成 Spotify 連接、同意並啟用背景偵測。正式 iPhone 實際送達結果另以本人回覆為準，不把測試室結果當成正式驗證。

## 私有回復資料

`.generated` 內保留原 Worker、切換前應用 JSON 備份、D1 Time Travel 書籤、設定快照、審查收據、打包候選與部署後比對紀錄，不提交 GitHub。

若發生程式問題，停止新 Cron 並回復原 Worker 版本 `8919d171`，保留現有 D1 和 Secrets；前端回復至原 main `8a3c59615c40b03d0beca89738411bebbb167fe6`。不要因單純程式問題回復整庫，以免丟失新聊天；D1 Time Travel 僅在確認資料受損且取得明確回復授權後使用。詳見 [回復方案](RELEASE-READINESS.md)。

正式網站：https://yi0119-hub.github.io/ling-music-observer/
