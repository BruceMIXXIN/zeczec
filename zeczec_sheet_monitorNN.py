import argparse
import cloudscraper
import datetime
import time
import re
import gspread
import os
import subprocess
from bs4 import BeautifulSoup
from oauth2client.service_account import ServiceAccountCredentials

# ===== Google Sheets 設定 =====
SHEET_KEY = '1M75GxuQGQ1GpNxRT0qvHB6ecwIcb54vUGlPXiLma_Io'
SERVICE_ACCOUNT_FILE = 'service_account.json'  # 你的 JSON 憑證檔
REQUIRED_COLUMNS = ['專案名稱', '噴噴網址', '門檻值', 'Webhook', '是否啟用']
HEARTBEAT_WEBHOOK = os.getenv('ZECZEC_HEARTBEAT_WEBHOOK', '').strip()
ALWAYS_SUMMARY_NOTIFY = os.getenv('ALWAYS_SUMMARY_NOTIFY', '').strip().lower() in ('1', 'true', 'yes', 'on')

# 每天早上會自動重啟（建議搭配 launchd 呼叫這支腳本）
# 如果失敗自動刷新 cloudscraper 並重試最多 3 次


def fetch_projects_from_sheets():
    print("\U0001F504 DEBUG: 開始讀取 Google Sheets...")
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_KEY).sheet1
    rows = sheet.get_all_records()
    headers = sheet.row_values(1)

    if not all(col in headers for col in REQUIRED_COLUMNS):
        print(f"❌ 系統錯誤：缺欄位，應包含：{REQUIRED_COLUMNS}")
        return []

    projects = []
    for row in rows:
        if str(row.get('是否啟用', '')).strip() == '是':
            projects.append({
                'name': row['專案名稱'],
                'url': row['噴噴網址'],
                'threshold': int(row['門檻值']),
                'webhook': row['Webhook']
            })
    return projects


def fetch_with_retry(url, headers, retries=3):
    for i in range(retries):
        try:
            scraper = cloudscraper.create_scraper()
            response = scraper.get(url, headers=headers)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"❌ 嘗試第 {i+1} 次抓取失敗：{e}")
            time.sleep(2)  # 短暫等待再試
    raise Exception("三次抓取皆失敗，略過此專案")


def check_zeczec(project):
    url = project['url']
    name = project['name']
    threshold = int(project['threshold'])
    webhook_url = project['webhook']

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/112.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.zeczec.com/"
    }

    print(f"\U0001F50D 檢查專案：{name}")
    try:
        html = fetch_with_retry(url, headers)
    except Exception as e:
        send_google_chat(webhook_url, f"\U0001F6A8 專案【{name}】頁面抓取失敗：{e}")
        return {'status': 'error', 'name': name, 'low_count': 0}

    soup = BeautifulSoup(html, 'html.parser')
    cards = soup.find_all('div', class_='lg:w-full px-4 lg:px-0 flex-none self-start xs:w-1/2')
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    low_stock_list = []

    for card in cards:
        title_div = card.find('div', class_='text-gray-600 font-bold mt-4 mb-2')
        plan_title = title_div.get_text(strip=True) if title_div else "未知方案"

        stock_span = card.find('span', class_='text-xs text-white px-2 py-1 bg-zec-red font-bold inline-block')
        if stock_span:
            match = re.search(r'剩餘\s*(\d+)\s*份', stock_span.get_text(strip=True))
            if match and int(match.group(1)) < threshold:
                low_stock_list.append(f"【{plan_title}】剩餘 {match.group(1)} 份")

    if low_stock_list:
        message = f"⚡️ 嘖嘖方案快賣完了！（專案：{name}）\n提醒時間：{now}\n" + "\n".join(low_stock_list)
        send_google_chat(webhook_url, message)
        return {'status': 'low', 'name': name, 'low_count': len(low_stock_list)}
    else:
        print(f"✅【{name}】目前無低於 {threshold} 份的方案，不發送通知。")
        return {'status': 'ok', 'name': name, 'low_count': 0}


def send_google_chat(webhook_url, message):
    payload = {'text': message}
    try:
        scraper = cloudscraper.create_scraper()
        scraper.post(webhook_url, json=payload)
        print("✅ 已發送通知到 Google Chat")
    except Exception as e:
        print(f"❌ 發送通知失敗：{e}")


def send_heartbeat(message):
    if not HEARTBEAT_WEBHOOK:
        return
    send_google_chat(HEARTBEAT_WEBHOOK, message)


def send_summary_to_project_webhooks(projects, message):
    webhook_urls = {
        str(project.get('webhook', '')).strip()
        for project in projects
        if str(project.get('webhook', '')).strip()
    }
    for webhook_url in webhook_urls:
        send_google_chat(webhook_url, message)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Zeczec sheet monitor")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single check and exit",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=600,
        help="Interval seconds between checks (default: 600)",
    )
    args = parser.parse_args()

    print("▶️ 開始執行監控程式")
    while True:
        try:
            projects = fetch_projects_from_sheets()
            print(f"📋 抓到 {len(projects)} 個啟用專案")
            ok_count = 0
            low_count = 0
            error_count = 0
            for project in projects:
                result = check_zeczec(project)
                if not result:
                    continue
                if result['status'] == 'ok':
                    ok_count += 1
                elif result['status'] == 'low':
                    low_count += 1
                elif result['status'] == 'error':
                    error_count += 1
            send_heartbeat(f"✅ 嘖嘖監控已完成一輪：{len(projects)} 個啟用專案")
            if ALWAYS_SUMMARY_NOTIFY:
                now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
                summary = (
                    f"📊 嘖嘖監控摘要（{now}）\n"
                    f"總專案：{len(projects)}\n"
                    f"正常：{ok_count}\n"
                    f"低庫存：{low_count}\n"
                    f"錯誤：{error_count}"
                )
                send_summary_to_project_webhooks(projects, summary)
        except Exception as e:
            print(f"⚠️ 程式執行錯誤：{e}")
            send_heartbeat(f"⚠️ 嘖嘖監控發生錯誤：{e}")

        if args.once:
            break

        print(f"⏳ 等待 {args.interval} 秒後再次檢查...\n")
        time.sleep(args.interval)
