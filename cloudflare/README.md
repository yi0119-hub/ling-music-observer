> **2026-10-30：v5.2 已依使用者授權正式上線。** PR #4 已合併，正式 Worker 與兩分鐘排程已發佈，原聊天與記憶保留。最新紀錄見 [正式發佈紀錄](PRODUCTION-RELEASE.md)。以下包含發佈前的歷史準備紀錄。

# 玲 v5.2 Cloudflare 開發與上線準備

目前正式 v5.1、正式 Worker、D1 和 main 均未修改。[完整驗證與回復紀錄](RELEASE-READINESS.md)。

## 已完成

- 獨立測試室已部署，每 2 分鐘查詢 Spotify；iPhone 人工測試通知與背景換歌通知均已由本人確認送達。
- 46 項自動測試通過，涵蓋 Web Push 接收端解密與簽章、PKCE、授權競態、SQLite、兩分鐘排程、換歌、通知間隔與安靜時段，以及正式部署的拒絕放行條件。
- 正式 Worker 真實來源已私有備份，兩分鐘候選版本完成 8 項本機相容性比對。
- 正式聊天應用資料已唯讀備份，完成本機 SQLite 還原及原 Worker 匯出驗證；另已私有保存 D1 Time Travel 書籤。

## 本機開發檢查

```sh
node cloudflare/build-staging.mjs
node --test cloudflare/*.test.mjs
node cloudflare/verify.mjs
```

私有正式來源的相容性與資料備份驗證：

```sh
node cloudflare/audit-compatibility.mjs /private/path/audited-worker.mjs
node cloudflare/verify-backup.mjs /private/path/production-chat-backup.json /private/path/audited-worker.mjs
```

這些工具不會部署或寫入正式資料。原程式、聊天備份、回復書籤、設定快照及所有產物只放在被忽略的 `.generated`，不可提交 GitHub。

## 正式上線限制

PR 仍為 Draft。需要保留全部現有設定、原 D1 綁定、Secrets、路由與排程，完成精確候選打包檢查，更新備份並取得明確正式部署授權後才能切換。

`prepare-release.mjs` 不再從單一 DB 綁定自行拼裝正式設定；它要求完整審查過的私有設定、候選／原始／背景模組組合雜湊、備份雜湊、驗證紀錄與正式授權，資料缺漏或過期就停止。GitHub CI 沒有私有證據，不能藉此直接部署。

`merge-live.mjs` 僅供唯讀預覽，沒有部署能力；`merge-offline.mjs` 保留來源、拒絕覆寫且不產生部署設定。所有正式回復步驟與限制見 [RELEASE-READINESS.md](RELEASE-READINESS.md)。
