> 目前狀態與正式上線限制以 [RELEASE-READINESS.md](RELEASE-READINESS.md) 為準；以下包含早期階段紀錄。

# 玲的 Cloudflare Worker：受控部署準備

**正式環境沒有部署。** 已建立全新、獨立的 v5.2 測試 Worker 與 D1，詳見 [STAGING.md](STAGING.md)。正式網站的聊天、Spotify、D1 都不變。

## 為何先停在審查階段

Cloudflare 現在已有正常聊天的 Worker。我們手上的舊 v4 Worker 來源，不能保證與線上程式相同。直接套用可能破壞聊天、既有 D1 綁定或既有排程。

因此刻意**不提交** `cloudflare/worker.reviewed.js`。只有備份目前線上 Worker、與新功能安全合併、測試、檢查不含內嵌密碼或 Token 後，才能放入此檔；沒有這個檔案時，部署工作會明確失敗。

## 使用者稍後自行設定（現在不必急著做）

1. Cloudflare → API Tokens，建立**限制在自己的 Cloudflare 帳號**的 Workers 編輯 Token。
2. GitHub 儲存庫 → Settings → Secrets and variables → Actions → Secrets：建立 `CLOUDFLARE_API_TOKEN`（Token）及 `CLOUDFLARE_ACCOUNT_ID`（帳號 ID）。
3. 同一頁 Actions → Variables：建立 `LING_WORKER_NAME`（現在實際使用的 Worker 名稱）、`LING_D1_DATABASE_NAME`（原 D1 名稱）、`LING_D1_DATABASE_ID`（原 D1 UUID）。不要猜，也不要建立新 Worker 或 D1。
4. 最好設定 GitHub Environment `ling-cloudflare-production` 的部署審查條件。
5. **只有在**現行 Worker 原始碼和所有 Binding 已比對、D1 已備份、新功能在測試環境通過後，才設定 Repository Variable `LING_DEPLOY_ENABLED=true`，並合併此 PR。
6. 工作流程進入 `main` 後，才能在 GitHub Actions 手動 Run workflow，輸入 `DEPLOY_LING_V4`。它會 dry-run，再對**原本的 Worker**執行部署，將**原本的 D1** 綁成 `DB`，同時設定兩個 Cron：每 10 分鐘、每日 12:00 UTC（台灣 20:00）。
7. 先確認原聊天室、記憶、Spotify 仍正常，再由手機主畫面 Web App 訂閱及測試推播。確認推播成功，最後才自行勾選背景 Spotify 授權。

**不要將**任何 API Key、`LING_ACCESS_CODE`、Spotify refresh token 貼到 GitHub 或聊天。Worker 的 `OPENAI_API_KEY` 和 `LING_ACCESS_CODE` 保留在 Cloudflare Secrets。

GitHub 手動 Workflow 只會在它已進入預設 `main` 分支後出現。PR 中的 check 工作不會部署。Wrangler 可能覆蓋其他 Dashboard 資源綁定和原有 Cron，因此正式執行前必須把現有 Worker 設定一併核對。

## v5.2 離線開發驗證

目前開發檢查共 46 項測試，涵蓋加密、訂閱、背景查詢、授權競態、合併預覽、獨立測試入口與 Spotify PKCE。詳見 [V5.2-VALIDATION.md](V5.2-VALIDATION.md) 及 [SPOTIFY-STAGING.md](SPOTIFY-STAGING.md)。這些測試不需要 Cloudflare 憑證。

使用既有唯讀稽核的私有 Worker 原始碼產生離線預覽：

```sh
node cloudflare/merge-offline.mjs /private/path/audited-worker.js
```

輸出在 `cloudflare/.generated/`，原始模組逐字保留，另外產生包裝模組與 SHA-256 摘要。工具不會連線、不產生部署設定、也不覆寫已有預覽。不要將稽核原始碼或產物提交 GitHub。`merge-live.mjs` 同樣只產生預覽，必須明確提供 `LING_WORKER_NAME`，不可當部署工具使用。

先前上方的部署準備流程尚未完成；目前仍禁止部署。真正上線前必須另外保留全部現有 Worker 設定、綁定、Cron，完成 D1 備份及獨立環境驗證；僅有 `DB` 與兩個 Cron 的設定不足以安全部署。

## 官方文件

- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

