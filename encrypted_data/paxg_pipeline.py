#!/usr/bin/env python3
"""
اسکریپت واحد برای تمام مراحل PAXG:
- historical : دریافت داده‌های ۲۰۱۷ تا ۲۰۲۴
- recent     : دریافت داده‌های ۲۰۲۵ تا امروز (با پرچم)
- encrypt    : ساخت data.enc از پوشه داده موجود
- full       : اجرای هر سه مرحله به ترتیب
"""

import os
import sys
import tarfile
import secrets
import subprocess
from datetime import datetime
import pandas as pd
import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

# ======================== تنظیمات ========================
SYMBOL = "PAXGUSDT"
DATA_DIR = "data/All_Coins_Combined"
ENCRYPTED_DIR = "encrypted_data"
FLAG_FILE = os.path.join(ENCRYPTED_DIR, "data_2025_2026_done.flag")
PASSWORD_ENV = "DATA_PASSWORD"
# =========================================================

def fetch_binance_klines(symbol, start_str, end_str):
    """دریافت داده‌های روزانه از Binance و بازگرداندن DataFrame."""
    base = "https://api.binance.com/api/v3/klines"
    start_ts = int(datetime.strptime(start_str, "%Y-%m-%d").timestamp() * 1000)
    end_ts = int(datetime.strptime(end_str, "%Y-%m-%d").timestamp() * 1000)
    all_rows = []
    while start_ts < end_ts:
        params = {
            'symbol': symbol,
            'interval': '1d',
            'startTime': start_ts,
            'limit': 1000
        }
        resp = requests.get(base, params=params)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            break
        all_rows.extend(data)
        start_ts = data[-1][6] + 1
    if not all_rows:
        return pd.DataFrame()
    df = pd.DataFrame(all_rows, columns=[
        'open_time','open','high','low','close','volume',
        'close_time','quote_asset_volume','number_of_trades',
        'taker_buy_base','taker_buy_quote','ignore'
    ])
    df = df[['open_time','open','high','low','close','volume']]
    df['open_time'] = pd.to_datetime(df['open_time'], unit='ms')
    df.columns = ['date','open','high','low','close','volume']
    df = df.sort_values('date').reset_index(drop=True)
    df = df[(df['date'] >= start_str) & (df['date'] <= end_str)]
    return df

def save_csv(df, filename):
    """ذخیره CSV در DATA_DIR."""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    df.to_csv(path, index=False)
    print(f"💾 ذخیره شد: {path}")
    return path

def run_historical():
    """مرحله ۱: داده‌های تاریخی تا ۲۰۲۴."""
    print("🔄 مرحله ۱: دریافت داده‌های تاریخی (۲۰۱۷–۲۰۲۴)")
    df = fetch_binance_klines(SYMBOL, "2017-01-01", "2024-12-31")
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")
    print(f"✅ داده‌های تاریخی ذخیره شد (تعداد {len(df)} رکورد)")
    return True

def run_recent():
    """مرحله ۲: داده‌های ۲۰۲۵ تا امروز با بررسی پرچم."""
    force = os.environ.get("FORCE_REBUILD", "no").lower() == "yes"
    if os.path.exists(FLAG_FILE) and not force:
        print("ℹ️ پرچم وجود دارد و force_rebuild=no، از مرحله recent صرف‌نظر می‌شود.")
        return True  # بدون خطا
    print("🔄 مرحله ۲: دریافت داده‌های ۲۰۲۵–تا امروز")
    today = datetime.now().strftime("%Y-%m-%d")
    df = fetch_binance_klines(SYMBOL, "2025-01-01", today)
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")  # بازنویسی فایل (داده‌ها جمع می‌شوند)
    # ایجاد پرچم
    os.makedirs(os.path.dirname(FLAG_FILE), exist_ok=True)
    with open(FLAG_FILE, 'w') as f:
        f.write(datetime.now().isoformat())
    print(f"✅ داده‌های جدید ذخیره و پرچم ایجاد شد (تعداد {len(df)} رکورد)")
    return True

def run_encrypt():
    """مرحله ۳: فشرده‌سازی و رمزنگاری پوشه داده به data.enc."""
    password = os.environ.get(PASSWORD_ENV)
    if not password:
        print(f"❌ متغیر محیطی {PASSWORD_ENV} تنظیم نشده است.")
        return False

    if not os.path.isdir(DATA_DIR) or not os.listdir(DATA_DIR):
        print("❌ پوشه داده خالی یا وجود ندارد. ابتدا داده‌ها را دریافت کنید.")
        return False

    # ۱. فشرده‌سازی
    tar_path = "data.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(DATA_DIR, arcname=os.path.basename(DATA_DIR))
    print(f"📦 فشرده‌سازی انجام شد: {tar_path}")

    # ۲. رمزنگاری با AES-256-CBC + scrypt (نمک ثابت 'salt')
    salt = b'salt'
    kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1, backend=default_backend())
    key = kdf.derive(password.encode('utf-8'))
    iv = secrets.token_bytes(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    with open(tar_path, 'rb') as f:
        plaintext = f.read()
    # Padding PKCS7
    pad_len = 16 - (len(plaintext) % 16)
    plaintext += bytes([pad_len]) * pad_len
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()

    os.makedirs(ENCRYPTED_DIR, exist_ok=True)
    enc_path = os.path.join(ENCRYPTED_DIR, "data.enc")
    with open(enc_path, 'wb') as f:
        f.write(iv + ciphertext)
    print(f"🔒 رمزنگاری شد: {enc_path}")

    os.remove(tar_path)
    print("🧹 فایل موقت حذف شد.")
    return True

def run_full():
    """اجرای هر سه مرحله به ترتیب."""
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
        print(f"❌ action نامعتبر: {action}")
        sys.exit(1)

    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
