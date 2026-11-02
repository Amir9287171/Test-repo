#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import zipfile
import tarfile
import secrets
import requests
import pandas as pd
import time
from datetime import datetime
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

# ========================== تنظیمات ==========================
SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "PAXGUSDT"
]
INTERVAL = "1m"
BASE_URL = "https://data.binance.vision/data/spot/monthly/klines"
ZIPS_DIR = "zips"
OUTPUT_BASE = "data"
COMBINED_DIR = os.path.join(OUTPUT_BASE, "All_Coins_Combined")
ENCRYPTED_DIR = "encrypted_data"
DATA_PASSWORD_ENV = "DATA_PASSWORD"
TIMEFRAME = "1m"
START_YEAR = 2018
# ============================================================

def log(msg, level="INFO"):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {level}: {msg}")
    sys.stdout.flush()

def days_in_month(year, month):
    if month == 2:
        return 29 if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0) else 28
    return 30 if month in [4, 6, 9, 11] else 31

def ts_to_datetime(ts):
    try:
        if pd.isna(ts):
            return pd.NaT
        num = int(float(ts))
        s = str(num)
        l = len(s)
        if l >= 19:
            seconds = num // 1_000_000_000
        elif l == 16:
            seconds = num // 1_000_000
        elif l == 13:
            seconds = num // 1_000
        else:
            seconds = num
        return pd.to_datetime(seconds, unit='s', utc=True)
    except Exception:
        return pd.NaT

def read_csv_from_zip(zip_path):
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            csv_files = [f for f in zf.namelist() if f.endswith('.csv') and not f.startswith('__')]
            if not csv_files:
                log(f"هیچ فایل CSV در {zip_path} یافت نشد", "WARNING")
                return None
            with zf.open(csv_files[0]) as f:
                df = pd.read_csv(f, header=None, usecols=range(6),
                                 names=['timestamp', 'open', 'high', 'low', 'close', 'volume'],
                                 on_bad_lines='skip')
        if df.empty:
            return None
        df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce')
        df = df.dropna(subset=['timestamp'])
        df['_time'] = df['timestamp'].apply(ts_to_datetime)
        df = df.dropna(subset=['_time'])
        df = df.sort_values('_time').reset_index(drop=True)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df['volume'] = df['volume'].fillna(0.0)
        return df[['_time', 'open', 'high', 'low', 'close', 'volume']].rename(columns={'_time': 'timestamp'})
    except Exception as e:
        log(f"خطا در خواندن {zip_path}: {e}", "ERROR")
        return None

def get_filename(coin, year, month, part):
    dim = days_in_month(year, month)
    if part == 1:
        s, e = f'{year}-{month:02d}-01', f'{year}-{month:02d}-10'
    elif part == 2:
        s, e = f'{year}-{month:02d}-11', f'{year}-{month:02d}-20'
    else:
        s, e = f'{year}-{month:02d}-21', f'{year}-{month:02d}-{dim}'
    return f"{coin}-{TIMEFRAME}-{s}_{e}.csv"

def process_zip(zip_path, coin):
    log(f"شروع پردازش {zip_path}")
    df = read_csv_from_zip(zip_path)
    if df is None or df.empty:
        log(f"ZIP خالی یا بی‌اعتبار: {zip_path}", "WARNING")
        return 0

    df['year'] = df['timestamp'].dt.year
    df['month'] = df['timestamp'].dt.month
    df['day'] = df['timestamp'].dt.day

    cnt = 0
    for (y, m), grp in df.groupby(['year', 'month']):
        part1 = grp[grp['day'] <= 10]
        part2 = grp[(grp['day'] >= 11) & (grp['day'] <= 20)]
        part3 = grp[grp['day'] >= 21]
        for pn, pdf in [(1, part1), (2, part2), (3, part3)]:
            if pdf.empty:
                continue
            fname = get_filename(coin, y, m, pn)
            # ذخیره در All_Coins_Combined
            combined_path = os.path.join(COMBINED_DIR, fname)
            pdf.to_csv(combined_path, index=False)
            # ذخیره در پوشه مخصوص سکه
            coin_dir = os.path.join(OUTPUT_BASE, coin)
            os.makedirs(coin_dir, exist_ok=True)
            pdf.to_csv(os.path.join(coin_dir, fname), index=False)
            cnt += 1
    log(f"پردازش {zip_path} انجام شد: {cnt} فایل CSV جدید")
    return cnt

def download_zips():
    os.makedirs(ZIPS_DIR, exist_ok=True)
    total = 0
    current_year = datetime.now().year
    current_month = datetime.now().month

    for symbol in SYMBOLS:
        log(f"شروع دانلود برای {symbol} از {START_YEAR} تا {current_year}")
        for year in range(START_YEAR, current_year + 1):
            for month in range(1, 13):
                if year == current_year and month > current_month:
                    break
                filename = f"{symbol}-{INTERVAL}-{year}-{month:02d}.zip"
                url = f"{BASE_URL}/{symbol}/{INTERVAL}/{filename}"
                local_path = os.path.join(ZIPS_DIR, filename)

                if os.path.exists(local_path):
                    log(f"از قبل موجود: {filename}", "INFO")
                    total += 1
                    continue

                try:
                    resp = requests.get(url, stream=True, timeout=30)
                    if resp.status_code == 404:
                        log(f"وجود ندارد (۴۰۴): {filename}", "WARNING")
                        continue
                    resp.raise_for_status()
                    with open(local_path, 'wb') as f:
                        for chunk in resp.iter_content(8192):
                            f.write(chunk)
                    log(f"دانلود شد: {filename}", "INFO")
                    total += 1
                except Exception as e:
                    log(f"خطا در دانلود {filename}: {e}", "ERROR")
                time.sleep(0.5)

    log(f"دانلود کامل شد. تعداد کل ZIP: {total}")
    return total

def encrypt_folder():
    password = os.environ.get(DATA_PASSWORD_ENV)
    if not password:
        log(f"متغیر محیطی {DATA_PASSWORD_ENV} تنظیم نشده است!", "ERROR")
        return False

    if not os.path.isdir(COMBINED_DIR) or not os.listdir(COMBINED_DIR):
        log(f"پوشه {COMBINED_DIR} خالی یا وجود ندارد!", "ERROR")
        return False

    tar_path = "data.tar.gz"
    log(f"در حال فشرده‌سازی {COMBINED_DIR} به {tar_path}")
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(COMBINED_DIR, arcname=os.path.basename(COMBINED_DIR))
    log(f"فشرده‌سازی انجام شد: {tar_path}")

    log("شروع رمزنگاری با AES-256-CBC و scrypt")
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
    log(f"رمزنگاری شد: {enc_path}")

    os.remove(tar_path)
    log("فایل موقت data.tar.gz حذف شد")
    return True

def main():
    log("================== شروع Pipeline برای ۵ ارز (۱ دقیقه) ==================")

    # ایجاد پوشه‌های لازم
    os.makedirs(COMBINED_DIR, exist_ok=True)
    os.makedirs(ENCRYPTED_DIR, exist_ok=True)

    # دانلود ZIPها
    zip_count = download_zips()
    if zip_count == 0:
        log("هیچ فایل ZIP جدیدی دانلود نشد.", "WARNING")

    # پردازش همه فایل‌های ZIP (فقط ۵ ارز)
    all_zips = [f for f in os.listdir(ZIPS_DIR) if f.endswith('.zip')]
    if not all_zips:
        log("هیچ فایل ZIP در پوشه zips وجود ندارد!", "ERROR")
        sys.exit(1)

    log(f"تعداد کل فایل‌های ZIP موجود: {len(all_zips)}")
    processed = 0
    for z in all_zips:
        coin = z.split('-')[0]
        if coin not in SYMBOLS:
            log(f"رد کردن {z} (سمبل {coin} در لیست نیست)", "INFO")
            continue
        log(f"پردازش {z} ...")
        added = process_zip(os.path.join(ZIPS_DIR, z), coin)
        processed += added
    log(f"کل فایل‌های CSV جدید ایجاد شده: {processed}")

    # رمزنگاری
    log("شروع مرحله رمزنگاری ...")
    if encrypt_folder():
        log("✅ رمزنگاری با موفقیت انجام شد.")
    else:
        log("❌ رمزنگاری ناموفق!", "ERROR")
        sys.exit(1)

    # گزارش نهایی
    csv_count = len([f for f in os.listdir(COMBINED_DIR) if f.endswith('.csv')])
    log(f"🎯 کل فایل‌های CSV در All_Coins_Combined: {csv_count}")
    log("================== پایان Pipeline ==================")

if __name__ == "__main__":
    main()
