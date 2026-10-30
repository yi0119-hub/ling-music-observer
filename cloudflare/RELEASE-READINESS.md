# v5.2 正式上線準備與回復方案

## 2026-10-30 已實際驗證

- 獨立測試 Worker 版本 `91842804`，Cron 已儲存為 `*/2 * * * *`，Spotify 成功回傳 `playing`。iPhone 人工測試通知已由使用者確認送達。
- 正式 Worker 當前版本 `8919d171` 已唯讀擷取並私有備份。來源 SHA-256：`dd323fedf44a0f95fcead4d0c814ef1ca204e32504547d88db9c0815716eef65`。
- 以這份真實程式產生兩分鐘候選包裝模組；原始模組逐字保留。8 項本機 SQLite 比對通過：history、remember、chat（AI 模擬回覆）、history、export 首頁／游標、背景 API 不改聊天記憶、未授權排程不改聊天記憶。未呼叫正式聊天 API，未消耗真實 AI 請求。
- 正式 D1 的應用資料唯讀備份：14 筆訊息、0 筆記憶、1 筆頻率限制與 1 筆自增序號。備份 SHA-256：`711d8967c46239c6f6d0dcb970f4e2ca09bb24810de336ca15773762e0ddf2f9`。已在記憶體 SQLite 還原並逐欄比對，再通過原 Worker 匯出 API 測試。這不是 Cloudflare D1 遠端還原測試。
- 已取得正式 D1 Time Travel 書籤並私有保存；Dashboard 當前可用回復窗口 7 天。應用 JSON 備份不含 Cloudflare 內部 `_cf_KV`；整庫事故須使用 D1 Time Travel。
- 線上正式 Worker、D1 資料與 main 均未寫入。私有原始碼、聊天內容、備份、書籤與完整設定快照只放在 `.generated`，不可提交 GitHub。

- 精確兩分鐘正式候選已用 Cloudflare Wrangler `4.156.0` 執行 `deploy --dry-run` 成功，大小 34.56 KiB（gzip 10.05 KiB），核對 DB 為原 ling-memory。未部署。候選三個模組輸入組合 SHA-256：`a8c685dcae8afa1a1bac54d91c08d47ada9f1f8e762f0707b8fd5172b9c2dd4f`。

## 正式部署前仍須完成

使用者已在關閉測試室並再次換歌後，明確確認收到自動換歌通知，端到端流程通過。仍需正式部署前重新核對全部設定、路由與目前版本，更新備份及書籤，並取得明確正式上線授權。PR 維持 Draft。

## 候選版本與設定

正式程式：`worker.original.mjs`；包裝程式：`worker.candidate.mjs`；背景模組：`../ling-background-addon.js`。候選版本排程只有兩分鐘 Spotify，不擅自啟用每日問候，原有 scheduled 處理器仍接收原事件。

正式設定唯讀確認：`DB` 綁定原 `ling-memory`；兩個原 Secrets 保持原值；相容日期 `2026-10-29`、Default placement、目前沒有 Cron。不得以只含 DB 的新設定取代完整設定。

`prepare-release.mjs` 現在必須取得私有的 `wrangler.reviewed.json` 與 `release-review.json`。它核對 Worker／D1、完整設定雜湊、候選＋原始＋背景模組的組合雜湊、備份雜湊、相容性、還原演練、換歌通知、24 小時內審查紀錄和正式授權；缺少資料就拒絕產生部署設定。CI 不持有私有證據，仍會阻擋正式部署。這些欄位是審查紀錄，不能代替實際驗證，也不可為了放行填入不實的 true。

## 正式切換順序（尚未執行）

1. 換歌自動通知已實測成功；保留獨立測試環境，不把測試 D1 綁到正式 Worker。
2. 重新唯讀備份當前正式程式、所有模組與設定；確認線上版本沒有在審查後改變。更新應用資料備份及 D1 書籤並做本機還原檢查。
3. 保留原相容日期、Secrets、全部 bindings、routes、排程與其他設定；只加入兩分鐘 Cron。先對精確候選執行 Wrangler dry-run，核對打包內容與三個輸入雜湊。
4. 取得使用者對具體候選的正式部署授權後，才部署原 Worker。前端另外檢查 OAuth、聊天、歷史、記憶、匯出及 Web Push。正式來源需重新登記通知／授權，不得直接搬用測試室的訂閱或加密 token。
5. 後端完成並確認原功能正常後，才合併／發佈前端 main。main 變更與正式 Worker 部署是兩個不同步驟。

## 回復程序

- 若新版造成聊天異常：先停止新的背景排程，再在正式 Worker 的 Deployments 選部署前版本回復，保留既有 Secrets 與 D1 綁定。排程／路由等設定需另行按私有快照還原，不能假定程式回復會處理全部設定。
- v5.1 前端回復至切換前的 main commit。不要刪除背景表或正式資料，保留診斷所需資料。
- 一般程式問題不回復整個 D1，以免丟失切換後新增的聊天。只有確認資料受損、先保全現況並取得明確回復授權後，才使用私有書籤做 D1 Time Travel；此動作會覆寫書籤之後的資料。
- 本機 JSON 可用來逐筆核對與選擇性修復；不能聲稱它包含 Cloudflare 內部資料或所有歷史備份。書籤過期後不可依賴，應重新取得。

官方依據：[Worker 回復限制](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)、[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。

## 重跑本機驗證

```sh
node cloudflare/audit-compatibility.mjs /private/path/audited-worker.mjs
node cloudflare/verify-backup.mjs /private/path/production-chat-backup.json /private/path/audited-worker.mjs
```

兩項工具只在本機執行；測試中的聊天與記憶寫入都發生在記憶體 SQLite。
