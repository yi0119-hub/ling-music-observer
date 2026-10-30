> **2026-10-30：v5.2 已依使用者授權正式上線。** PR #4 已合併，正式 Worker 與兩分鐘排程已發佈，原聊天與記憶保留。最新紀錄見 [正式發佈紀錄](cloudflare/PRODUCTION-RELEASE.md)。以下包含發佈前的歷史準備紀錄。

# 玲的音樂觀察室 (Ling's Music Corner) — iPhone / Android 版本

Spotify 區是無需 Node.js 的前端展示功能，採用官方 Web API + OAuth Authorization Code with PKCE，適合在 Safari / Chrome 或加到手機主畫面使用。網頁下方的「和玲聊聊」則是另一個獨立的 Cloudflare Worker + D1 功能，兩者不交換 Spotify 歌曲資料。

## 功能

- 官方 Spotify 登入（要求 `user-read-currently-playing` 與 `user-read-recently-played`）。
- 顯示當前歌曲名稱、創作者、封面、專輯及 Spotify 原始連結。
- **頁面在前景時**每約 30 秒檢查目前播放；可手動重新整理、暫停更新。
- 新區塊顯示 Spotify API 提供的最近 20 筆播放紀錄（不含 Podcast）；每約 2 分鐘補查一次，從背景回到前景時也會重新查詢。
- 處理 Spotify 空播放資料、401/403/429、Rate limit / Quota exceeded；Spotify 近期播放紀錄不另外永久儲存、不交給 AI、不建立喜好側寫或自動通知。
- 本機存取方式可選：不勾選「保留登入」則 refresh token 留在本次工作階段；勾選後保留於該裝置的 localStorage。所有資料都只留在妳的瀏覽器，不經第三方伺服器；請不要在共用裝置勾選。

## 先決條件

1. Spotify 開發模式 App 的擁有者需要有 **Spotify Premium**（2026 官方規則）；需把使用帳號加入 Developer Dashboard 的使用者允許名單（個人開發模式每 App 最多 5 人）。
2. 具有 HTTPS 的公開靜態網址（例如 GitHub Pages）；不要用 `file://` 直接打開 HTML。Spotify Redirect URI 必須與實際網址完全相同。
3. GitHub Pages 透過 GitHub 免費方案建立的 repository 通常需為 Public。**這份程式碼不包含 Client Secret 或帳號密碼，不可將任何 Spotify token 放進 repository。**

## 手機免安裝開發工具：用 GitHub Pages 上線

1. 開啟 https://github.com/ 並登入。新增一個 **Public repository**，例如 `ling-music-observer`。
2. 將這個資料夾中的 `index.html`、`styles.css`、`main.js`、`manifest.webmanifest`、`icon.svg` 九個網站檔案（包括 3 個 PNG 圖示與 privacy.html）直接上傳到 repository 根目錄（網頁介面 Add file → Upload files）。
3. GitHub repository 的 Settings → Pages → Build and deployment → Deploy from a branch → `main`、`/(root)` → Save。
4. 開啟網址 `https://你的GitHub帳號.github.io/ling-music-observer/`。**注意最後要有 `/`。**
5. 首次打開後，複製程式「Spotify 連線設定」顯示的 Redirect URI，供下步使用。
6. 前往 https://developer.spotify.com/dashboard 建立 Spotify App：名稱可用 `Ling Music Observer`，APIs 選 Web API。將上述完整 HTTPS Redirect URI 加到 Spotify App 設定中，儲存。
7. 在 Developer Dashboard 的 App Settings 裡，確認要登入的 Spotify 帳戶在 Users Management 允許名單中（若有此欄位，開發模式需要）。
8. 複製 **Client ID** 到「玲的音樂觀察室」的輸入欄，再按「連接 Spotify」並完成授權。**不要貼上 Client Secret。**
9. 在 Spotify 播放一首歌曲，返回網頁，按「立即查看」測試。目前播放每約 30 秒自動更新；「最近播放」另有更新按鈕。可以把 Safari 頁面「分享 → 加入主畫面 → 打開為網頁 App」。

## 注意事項

- iOS 一般不允許網站在背景持續運作。切到 Spotify App 之後，這個 PWA 不會可靠地繼續跑 30 秒計時器；重新回到頁面時會立刻查詢目前播放，並利用 Spotify「最近播放」API 補看至多 20 筆紀錄。這不是背景常駐監控，無法保證每首短歌或 Spotify 尚未收錄的歌曲都能補齊。
- 30 秒只是前景查詢節奏，並非即時事件訂閱，短曲可能被漏掉。頻率過高可能觸發 429，程式會退避或停止自動請求。
- Spotify Developer 政策限制衍生聆聽分析、使用者側寫，以及把 Spotify 內容餵給 AI 模型。這個工具只在畫面顯示 Spotify 提供的最近播放，不另外永久儲存、不會將歌曲資訊傳送給 ChatGPT／OpenAI。若想和玲聊音樂喜好，請由你自行描述喜愛的音樂與心得。
- 若要在手機關閉頁面後仍定期執行，需要另行設計後端排程、使用者授權憑證的安全儲存與合規審查；本版不在背景持續執行，也不加入後端 Spotify 輪詢。
- Spotify refresh token 會到期（官方 2026 說明：取得授權後 6 個月）；此後要再授權。勾選「保留登入」會將憑證存到 localStorage；XSS、惡意擴充套件和受損裝置都可能讀取它。建議僅在個人裝置使用。
- `index.html` 的 CSP 禁用外部 JS，所有第三方資訊只用 `textContent` 顯示以減少注入風險。
- 如果首次 OAuth 授權成功卻顯示「驗證失敗」，在 Safari 開啟網頁直接操作（而非先加到主畫面）重試；請核對網址、尾端斜線、站點是否開啟了「封鎖跨網站追蹤」以外的額外瀏覽器清理設定。
- Spotify 畫面中的「玲」提示是簡單狀態文字，不會聆聽音訊，最近播放資料也不會進入下方的 AI 聊天後端。

## 官方文件

- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track
- https://developer.spotify.com/documentation/web-api/reference/get-recently-played
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- https://developer.spotify.com/policy
- https://support.apple.com/zh-tw/guide/iphone/iph42ab2f3a7/27/ios/27

## 故障排除

- **INVALID_CLIENT**：Client ID 不正確，或 Spotify App 未選 Web API。
- **INVALID_REDIRECT_URI**：Dashboard 裡的網址和畫面顯示的 Redirect URI 不完全相同（包含大小寫、路徑、尾端 `/`）。
- **403**：開發 App 擁有者未訂閱 Premium，或登入帳號未加入允許名單，或 Spotify 限制權限。
- **429**：Spotify rate limit / 開發者配額，稍後再試；若是 `QUOTA_EXCEEDED`，程式不會自動重試。
- **看不到音樂**：先在 Spotify 使用相同帳號啟動播放，再切回觀察室；部分歌曲／私人聆聽狀態可能沒有資料。
- **要換帳號或清掉令牌**：按「清除本機授權」，並可在 Spotify 帳戶的 Apps 頁面撤銷授權。

## v4：30 秒前景查詢與最近播放

- 升級後請按「重新授權 Spotify」一次，同意 `user-read-recently-played`，否則最近播放會顯示 403 或缺少權限。原有的「保留登入」仍可繼續使用（不需要貼 Client Secret）。
- 目前播放的輪詢週期從 60 秒縮短為 30 秒；最近播放列表每約 2 分鐘查一次，在切回前景時會優先查閱（若剛查過則保留新鮮資料），也可以手動重新查詢。
- Spotify 回傳的是最近播放（最多 20 筆），不是永久歷史；本網站不將這些資料存到 localStorage、D1、Google Drive 或聊天模型。
- 如果收到 429 或 QUOTA_EXCEEDED，程式會退避或停止查詢；按鈕不能繞過 Spotify 的 Retry-After。
- `chat.js` 和已經設定好的 Cloudflare 共用核心不受這次更新影響。你可在 GitHub Pull Request 先檢查改動，再合併到 `main` 正式發布。

## v5：手機分頁排版（不變動 Spotify / 共用核心 API）

- 主要畫面分為「聽音樂」「和玲聊」「設定」三個分頁。手機使用底部切換列，較大螢幕使用上方導覽列。
- 「聽音樂」集中顯示目前播放、最近 20 筆播放與手動刷新。Spotify 在網頁前景時維持每約 30 秒更新。
- 「和玲聊」保留原雲端對話、同步、備份、刪除與釘選記憶，不再被冗長的登入表單擠到畫面下方。
- Spotify Client ID、授權、Cloudflare Worker 網址和通行碼統一移至「設定」分頁；原本的輸入欄位 ID、瀏覽器儲存鍵及 OAuth Redirect URI 不變。
- 使用 `ui.js` 切換分頁：支援鍵盤左右方向鍵／Home／End、ARIA tab 標示、返回時恢復上次分頁（儲存在本機），不需要後端。
- 音樂和聊天的資料仍然隔離。此版是排版更新，不會讓 Spotify 歌曲資料自動送入 AI，也沒有增加背景常駐功能。
- 發布前請在 iPhone 檢查三個分頁、返回前景的 Spotify 更新、重新授權流程、Cloudflare 聊天連線與記憶，確認皆能正常運作。

## v5.1：玲的小房間視覺主題（草稿 PR #2）

使用者選擇「更像玲自己的私人小房間」，因此在 v5 的三分頁結構上加入溫暖的房間風格，不是模仿 Spotify 播放器。

- **歡迎區**：深紫夜色、月亮窗景、桌燈、唱片和杯子，全部使用本地 CSS，沒有使用外部圖片、字型或第三方腳本。
- **唱片角落**：柔和暖光的目前播放卡片與 Spotify 最近播放紀錄；30 秒前景更新、最近播放 API 維持原樣。
- **聊天小桌**：聊天對話像桌旁便箋，釘選長期記憶改用紙張色卡片；實際資料、記憶和登入處理不變。
- **房間的小抽屜**：Spotify 與 Cloudflare 連線設定集中在設定分頁。
- **手機與無障礙**：保留底部分頁、大字與觸控目標；小螢幕隱藏部分背景佈景空間，並遵守降低動態效果偏好。

此主題目前只在 `feature/mobile-tab-layout-v5` 修改分支與草稿 PR #2，沒有直接覆蓋正式版；發布前還需透過實際 iPhone / 桌面瀏覽器檢查視覺溢出、Spotify 授權回跳與聊天輸入流程。

