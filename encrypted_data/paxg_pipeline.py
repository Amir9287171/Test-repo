#!/usr/bin/env python3
"""
PAXG Pipeline با هر سه روش:
- آدرس‌های جایگزین بایننس (data-api.binance.vision)
- پروکسی (از متغیرهای محیطی HTTP_PROXY/HTTPS_PROXY)
- پشتیبانی از self-hosted runner
"""

import os
import sys
import tarfile
import secrets
import time
import requests
import pandas as pd
from datetime import datetime
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

SYMBOL = "PAXGUSDT"
DATA_DIR = "data/All_Coins_Combined"
ENCRYPTED_DIR = "encrypted_data"
FLAG_FILE = os.path.join(ENCRYPTED_DIR, "data_2025_2026_done.flag")
PASSWORD_ENV = "DATA_PASSWORD"

# =========================================================
# روش ۲: آدرس‌های جایگزین بایننس
# =========================================================
BINANCE_ENDPOINTS = [
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://data-api.binance.vision",  # آدرس جایگزین
    "https://api.binance.us"            # آدرس جایگزین
]

def fetch_binance(symbol, start_str, end_str):
    """
    تلاش برای دریافت داده از بایننس با استفاده از:
    - آدرس‌های جایگزین
    - پروکسی (اگر تنظیم شده باشد)
    - هدرهای شبیه‌سازی مرورگر
    """
    start_ts = int(datetime.strptime(start_str, "%Y-%m-%d").timestamp() * 1000)
    end_ts = int(datetime.strptime(end_str, "%Y-%m-%d").timestamp() * 1000)
    
    # پروکسی از متغیرهای محیطی (روش ۳)
    proxies = {}
    if os.environ.get('HTTP_PROXY'):
        proxies['http'] = os.environ.get('HTTP_PROXY')
    if os.environ.get('HTTPS_PROXY'):
        proxies['https'] = os.environ.get('HTTPS_PROXY')
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Referer': 'https://www.binance.com/'
    }
    
    for endpoint in BINANCE_ENDPOINTS:
        try:
            print(f"🔄 تلاش برای {endpoint} ...")
            all_data = []
            temp_start = start_ts
            
            while temp_start < end_ts:
                params = {
                    'symbol': symbol,
                    'interval': '1d',
                    'startTime': temp_start,
                    'limit': 1000
                }
                
                # استفاده از پروکسی (روش ۳)
                resp = requests.get(
                    f"{endpoint}/api/v3/klines",
                    params=params,
                    headers=headers,
                    proxies=proxies if proxies else None,
                    timeout=30
                )
                
                # اگر endpoint تحریم داشت، برو سراغ بعدی
                if resp.status_code == 451:
                    print(f"⚠️ تحریم از {endpoint}")
                    break
                
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                all_data.extend(data)
                temp_start = data[-1][6] + 1
                time.sleep(0.1)  # احترام به Rate Limit
            
            if all_data:
                print(f"✅ دریافت موفق از {endpoint}")
                df = pd.DataFrame(all_data, columns=[
                    'open_time','open','high','low','close','volume',
                    'close_time','quote_asset_volume','number_of_trades',
                    'taker_buy_base','taker_buy_quote','ignore'
                ])
                df = df[['open_time','open','high','low','close','volume']]
                df['open_time'] = pd.to_datetime(df['open_time'], unit='ms')
                df.columns = ['date','open','high','low','close','volume']
                df = df.sort_values('date').reset_index(drop=True)
                return df
                
        except Exception as e:
            print(f"❌ خطا از {endpoint}: {str(e)[:100]}")
            continue
    
    print("❌ همه آدرس‌ها و پروکسی‌ها ناموفق بودند.")
    return pd.DataFrame()

# =========================================================
# بقیه توابع (ذخیره‌سازی، رمزنگاری و ...) کاملاً مشابه قبل
# =========================================================
def save_csv(df, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    df.to_csv(path, index=False)
    print(f"💾 ذخیره شد: {path}")
    return path

def run_historical():
    print("🔄 مرحله ۱: دریافت داده‌های تاریخی (۲۰۱۷–۲۰۲۴)")
    df = fetch_binance(SYMBOL, "2017-01-01", "2024-12-31")
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")
    print(f"✅ داده‌های تاریخی ذخیره شد (تعداد {len(df)} رکورد)")
    return True

def run_recent():
    force = os.environ.get("FORCE_REBUILD", "no").lower() == "yes"
    if os.path.exists(FLAG_FILE) and not force:
        print("ℹ️ پرچم وجود دارد، مرحله recent رد شد")
        return True
    print("🔄 مرحله ۲: دریافت داده‌های ۲۰۲۵–تا امروز")
    today = datetime.now().strftime("%Y-%m-%d")
    df = fetch_binance(SYMBOL, "2025-01-01", today)
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")
    os.makedirs(os.path.dirname(FLAG_FILE), exist_ok=True)
    with open(FLAG_FILE, 'w') as f:
        f.write(datetime.now().isoformat())
    print(f"✅ داده‌های جدید ذخیره شد (تعداد {len(df)} رکورد)")
    return True

def run_encrypt():
    password = os.environ.get(PASSWORD_ENV)
    if not password:
        print(f"❌ {PASSWORD_ENV} تنظیم نشده")
        return False
    if not os.path.isdir(DATA_DIR) or not os.listdir(DATA_DIR):
        print("❌ پوشه داده خالی")
        return False
    
    tar_path = "data.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(DATA_DIR, arcname=os.path.basename(DATA_DIR))
    
    salt = b'salt'
    kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1, backend=default_backend())
    key = kdf.derive(password.encode('utf-8'))
    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    
    with open(tar_path, 'rb') as f:
        plaintext = f.read()
    pad_len = 16 - (len(plaintext) % 16)
    plaintext += bytes([pad_len]) * pad_len
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    
    os.makedirs(ENCRYPTED_DIR, exist_ok=True)
    enc_path = os.path.join(ENCRYPTED_DIR, "data.enc")
    with open(enc_path, 'wb') as f:
        f.write(iv + ciphertext)
    print(f"🔒 رمزنگاری شد: {enc_path}")
    os.remove(tar_path)
    return True

def run_full():
    success = True
    if not run_historical():
        success = False
    if not run_recent():
        success = False
    if not run_encrypt():
        success = False
    return success

def main():
    action = os.environ.get("ACTION", "full").lower()
    print(f"🚀 اجرای action: {action}")
    if action == "historical":
        success = run_historical()
    elif action == "recent":
        success = run_recent()
    elif action == "encrypt":
        success = run_encrypt()
    elif action == "full":
        success = run_full()
    else:
        print("❌ action نامعتبر")
        sys.exit(1)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
