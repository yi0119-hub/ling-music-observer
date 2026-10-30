# 測試環境通知修正（2026-10-30）

兩個獨立問題已由程式與實際 Worker 紀錄確認：

1. 首頁 CSP 缺少 `worker-src 'self'`，Service Worker 註冊可能被阻擋。已明確允許同源 Service Worker，其他來源仍不允許。
2. 實際裝置登記成功後，推播發送報 `Invalid redirect value, must be one of "follow" or "manual"`。Cloudflare Workers 不支援標準 Fetch 的 `redirect: 'error'`，會在發送前拋出 TypeError。改為 `manual`，3xx 不算成功且不跟隨。Spotify 兩個端點也套用相同修正。

補充回歸測試涵蓋同源 Worker CSP、推播 307 拒絕與 410 清除、Spotify 兩端點 307 不跟隨，以及尚未訂閱時的明確操作提示。合計 34 項本機測試通過。

新的測試包 SHA-256：`7202729f63758e29ab97da23683762b0d06fcfd56461ab39e92db8010412942b`。既有測試 Secret、VAPID 與裝置訂閱不重設；只更新獨立測試 Worker 的程式。

實際 iPhone 通知送達仍需帳戶持有人按測試通知並確認，不以模擬推播服務的通過結果宣稱已送達。

官方參考：[Cloudflare Request redirect](https://developers.cloudflare.com/workers/runtime-apis/request/)、[CSP Level 3](https://www.w3.org/TR/CSP3/)。
