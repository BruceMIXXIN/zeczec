# zeczec-sheet-monitor

Monitor Zeczec project reward stock levels from a Google Sheet and send Google Chat webhook alerts.

## What it does
- Reads project config from Google Sheets
- Checks Zeczec project reward stock levels
- Sends Google Chat webhook messages when stock drops below a threshold
- Repeats every 10 minutes

## Requirements
- Python 3.9+
- A Google Service Account JSON credentials file
- A Google Sheet with the required columns

## Setup
1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Place your service account credentials file next to the script:
- `service_account.json`

3. Update these constants in `zeczec_sheet_monitorNN.py` if needed:
- `SHEET_KEY`
- `SERVICE_ACCOUNT_FILE`
- `REQUIRED_COLUMNS`

## Run
```bash
python zeczec_sheet_monitorNN.py
```

### Run once (for testing)
```bash
python zeczec_sheet_monitorNN.py --once
```

### Change interval
```bash
python zeczec_sheet_monitorNN.py --interval 600
```

## GitHub Actions (every 30 minutes)
This repo includes a workflow that runs every 30 minutes.

Before it can run, add a GitHub Actions secret:
- Name: `SERVICE_ACCOUNT_JSON`
- Value: The full JSON content of your service account file

The workflow writes `service_account.json` at runtime and runs:
`python zeczec_sheet_monitorNN.py --once`

### Optional heartbeat notification
You can add a global webhook to receive "run started" + "run completed" messages:
- Secret name: `ZECZEC_HEARTBEAT_WEBHOOK`
- Value: Your Google Chat incoming webhook URL

## Notes
- The script runs forever and checks every 10 minutes.
- Make sure `service_account.json` is **not** committed to Git.

---

## Google Sheet 網頁填寫版（新增）

你現在可以把這個專案當成「前端表單 + Google Apps Script API」，讓使用者填寫後直接寫進 Google Sheet。

### 1) 前端欄位設定
編輯 `app.js`：
- `CONFIG.webAppUrl`: 貼上你部署後的 Apps Script Web App URL
- `CONFIG.accessToken`: 若後端有設 token，這裡要一致
- `CONFIG.fields`: `name` 必須和 Google Sheet 第 1 列標題完全一致

### 2) 部署 Google Apps Script
1. 開啟 [Google Apps Script](https://script.google.com/)
2. 建立新專案，貼上 `apps-script/Code.gs` 內容
3. 確認 `CONFIG.spreadsheetId` 是你的試算表 ID：
   - `1M75GxuQGQ1GpNxRT0qvHB6ecwIcb54vUGlPXiLma_Io`
4. `Deploy` -> `New deployment` -> 類型選 `Web app`
5. Execute as: `Me`
6. Who has access: `Anyone`（或依需求改成網域內）
7. 完成後複製 Web App URL，貼回 `app.js` 的 `CONFIG.webAppUrl`

### 3) 本機測試
直接開 `index.html` 或用任一靜態伺服器啟動後測試送出。

### 4) 欄位對應規則
- Apps Script 會讀取 Google Sheet 第 1 列作為欄位標題
- 前端送出的 JSON key 會用標題名稱逐欄對應
- 沒有對應到的欄位會留空

### 5) 安全建議
- 建議在 `apps-script/Code.gs` 的 `CONFIG.accessToken` 設定一組字串
- 前端 `app.js` 的 `CONFIG.accessToken` 使用同一組值，避免被任意呼叫
