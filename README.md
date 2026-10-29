# 玲的音樂觀察室 (Ling's Music Corner) — iPhone / Android 版本

這是獨立的、零後端、無需 Node.js 的 Spotify「目前播放」展示工具。採用官方 Web API + OAuth Authorization Code with PKCE。適合在 Safari / Chrome 或加到手機主畫面使用。

## 功能

- 官方 Spotify 登入（只要求 `user-read-currently-playing`）。
- 顯示當前歌曲名稱、創作者、封面、專輯及 Spotify 原始連結。
- **頁面在前景時**每約 60 秒更新一次；可手動重新整理、暫停更新。
- 處理 Spotify 空播放資料、401/403/429、Rate limit / Quota exceeded。
- 沒有自己的伺服器、AI 分析功能、聆聽歷史收集或自動發送通知。
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
9. 在 Spotify 播放一首歌曲，返回網頁，按「立即查看」測試。可以把 Safari 頁面「分享 → 加入主畫面 → 打開為網頁 App」。

## 注意事項

- iOS 一般不允許網站在背景持續運作。切到 Spotify App 之後，這個 PWA 不會可靠地持續每分鐘監測；只有重新回到頁面，或讓 Spotify 播放音樂並把觀察室放在前景時，才能穩定更新。
- 60 秒只是前景查詢節奏，並非即時事件訂閱，短曲可能被漏掉。頻率過高可能觸發 429，程式會退避或停止自動請求。
- Spotify Developer 2026 政策禁止建立衍生使用者聆聽分析、將 Spotify 資料餵入 AI 模型或據此訓練。這個工具不儲存聆聽歷史、也不會將歌曲資訊傳送給 ChatGPT／OpenAI。
- 若希望手機關閉頁面仍能主動推播，需要另一種「受 Spotify 政策限制的後端＋推播服務」架構，以及另外評估服務額度與合規性。這不在第一版範圍內。
- Spotify refresh token 會到期（官方 2026 說明：取得授權後 6 個月）；此後要再授權。勾選「保留登入」會將憑證存到 localStorage；XSS、惡意擴充套件和受損裝置都可能讀取它。建議僅在個人裝置使用。
- `index.html` 的 CSP 禁用外部 JS，所有第三方資訊只用 `textContent` 顯示以減少注入風險。
- 如果首次 OAuth 授權成功卻顯示「驗證失敗」，在 Safari 開啟網頁直接操作（而非先加到主畫面）重試；請核對網址、尾端斜線、站點是否開啟了「封鎖跨網站追蹤」以外的額外瀏覽器清理設定。
- 程式中的「玲」訊息是簡單狀態文字，不是真正的自主 AI，也不能直接聆聽音訊。

## 官方文件

- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track
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
