# 玲的 Cloudflare Worker：受控部署準備

**目前沒有部署！** 這個 Draft PR 只加入 GitHub Actions 檢查與部署保護。正式網站的聊天、Spotify、D1 都不變。

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

## 官方文件

- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
