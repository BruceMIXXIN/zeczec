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

## Notes
- The script runs forever and checks every 10 minutes.
- Make sure `service_account.json` is **not** committed to Git.
