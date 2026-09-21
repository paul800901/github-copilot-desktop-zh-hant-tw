# GitHub Copilot Desktop 繁體中文（台灣）

這是 GitHub Copilot Desktop 的非官方介面本機化專案，目標與 `Antigravity繁中化` 一致：不只將英文轉為繁體中文，也將詞句調整為臺灣常用的介面用語。

目前版本已實機對應 GitHub Copilot Desktop 1.1.23 的主頁、側邊欄、系統匣選單、「我的工作」、「自動化」、「自訂」與全部設定分頁。

## 邊界

- 只翻譯已辨識的介面詞句與無障礙標籤。
- 不翻譯使用者訊息、Agent 回覆、程式碼、Markdown、Diff、終端機內容或可編輯值。
- 不修改、重新簽章或散布官方 `github.exe`。
- 不變更帳號、專案、設定、自動更新或其他 GitHub 資料。

## 運作方式

GitHub Copilot Desktop 將前端壓縮後內嵌在 Tauri `github.exe` 中，不像 Antigravity 有可重新打包的 Electron `app.asar`。本專案因此使用 WebView2 的本機除錯介面，在頁面建立時注入精確詞句翻譯。

這種做法的好處是不破壞官方執行檔，官方更新後通常也不需要還原檔案。啟動後會有隱藏的背景監看程序，若 Copilot 更新或重新建立介面，會自動補回繁中翻譯。右下角系統匣屬於 Windows 原生選單，另由只鎖定官方 `github.exe` 的本機輔助程式就地翻譯，保留原本的選單功能。完全離開 Copilot 後，監看程序會保留五分鐘等待更新重啟，之後自行結束。日後直接點選官方捷徑仍會是英文，請使用繁中版捷徑啟動。

## 使用方式

### 需求

- Windows 10 或 11
- 已安裝 GitHub Copilot Desktop
- Node.js 22 或更新版本

### 啟動繁中版

1. 下載本儲存庫，或執行：

   ```powershell
   git clone https://github.com/paul800901/github-copilot-desktop-zh-hant-tw.git
   ```

2. 完全關閉 GitHub Copilot Desktop，包含系統匣中的執行個體。
3. 雙擊專案資料夾中的 `start-win.bat`。
4. 待視窗開啟後，主介面會自動套用繁體中文。

預設安裝位置為：

```text
%LOCALAPPDATA%\Programs\GitHub Copilot\github.exe
```

若安裝位置不同，可指定執行檔：

```powershell
node localization_engine.js --exe "D:\path\to\github.exe"
```

若繁中版已在執行，而您剛更新字典，可直接套用最新版：

```powershell
node localization_engine.js --apply
```

### 檢查字典與環境

```powershell
npm run check
node localization_engine.js --dry-run
```

要從已啟動的繁中版讀取各設定分頁，可執行：

```powershell
npm run audit:live -- "工作階段"
```

## 安全與限制

- 啟動器會要求 WebView2 開啟一個隨機的本機除錯連接埠，只用於將翻譯腳本送入當次的 Copilot 介面。
- Microsoft 將 WebView2 除錯參數定位為開發與診斷用途，不保證永久相容。GitHub Copilot 更新後若失效，需重新驗證。
- 當 Copilot 執行期間，本機其他程式理論上可嘗試連接這個除錯連接埠。因此本專案使用由 WebView2 分配的動態連接埠，不寫入全域環境變數或登錄檔。
- 翻譯引擎採完整詞句比對。新版介面出現的新英文不會被猜測翻譯，需先讀回實際介面後才納入字典。

## 專案狀態

- Windows 啟動、WebView 連線與更新後自動補回：已通過 GitHub Copilot Desktop 1.1.23 實機測試
- 主頁、側邊欄、系統匣選單、回饋視窗、帳號選單與鍵盤快速鍵：已建立字典
- 設定中的一般、帳號、工作階段、佈景主題、無障礙、技能、MCP 伺服器、外掛程式、模型供應商與實驗性功能：已逐頁實機讀回
- 「自動化」與「自訂」七個子分頁：已逐頁實機讀回；目前外掛市集的 160 段動態說明已建立繁中字典
- 搜尋、專案與工作階段內的動態流程：尚未全數走過，若新畫面出現英文需繼續補入字典

## 授權

本專案以 [MIT License](LICENSE) 開放原始碼。

## 商標聲明

本儲存庫不散布 GitHub 或 GitHub Copilot 的官方圖示。GitHub、Copilot、Octocat 及相關標誌是 GitHub, Inc. 的商標；使用時請遵守 [GitHub Logo Policy](https://docs.github.com/en/site-policy/other-site-policies/github-logo-policy) 與 [GitHub Trademark Policy](https://docs.github.com/en/site-policy/content-removal-policies/github-trademark-policy)。

本專案與 GitHub, Inc. 無關，也不是 GitHub Copilot 的官方語言套件。
