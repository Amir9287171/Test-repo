#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
نسخه‌ی تک‌ارزی All_pipeline.py

  - نام ارز از env به اسم COIN خوانده می‌شود (مثلاً COIN=SOLUSDT).
  - داده‌ی ماهانه‌ی 1m همان ارز از data.binance.vision از صفر دانلود می‌شود.
  - خروجی در data/<COIN>/ و (اختیاری) data/All_Coins_Combined/ نوشته می‌شود.
  - رمزنگاری data.enc اختیاری است (ENCRYPT_OUTPUT=yes) و فقط برای سازگاری
    با ورک‌فلوهای قبلی نگه داشته شده؛ ورک‌فلو جدید به آن نیاز ندارد.

env های اختیاری:
  WRITE_COMBINED  yes|no  (پیش‌فرض yes)  نوشتن در data/All_Coins_Combined
  ENCRYPT_OUTPUT  yes|no  (پیش‌فرض yes)  ساخت encrypted_data/data.enc
  KEEP_ZIPS       yes|no  (پیش‌فرض no)   نگه‌داشتن ZIPها بعد از پردازش
  START_YEAR      پیش‌فرض 2018
"""

import os
import re
import sys
import time
import zipfile
import tarfile
import secrets
from datetime import datetime

import requests
import pandas as pd
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

# ========================== تنظیمات ==========================
INTERVAL = "1m"
TIMEFRAME = "1m"
BASE_URL = "https://data.binance.vision/data/spot/monthly/klines"
ZIPS_DIR = "zips"
OUTPUT_BASE = "data"
COMBINED_DIR = os.path.join(OUTPUT_BASE, "All_Coins_Combined")
ENCRYPTED_DIR = "encrypted_data"
DATA_PASSWORD_ENV = "DATA_PASSWORD"
START_YEAR = int(os.environ.get("START_YEAR", "2018"))

COIN = os.environ.get("COIN", "").strip().upper()
WRITE_COMBINED = os.environ.get("WRITE_COMBINED", "yes").lower() == "yes"
ENCRYPT_OUTPUT = os.environ.get("ENCRYPT_OUTPUT", "yes").lower() == "yes"
KEEP_ZIPS = os.environ.get("KEEP_ZIPS", "no").lower() == "yes"
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

    coin_dir = os.path.join(OUTPUT_BASE, coin)
    os.makedirs(coin_dir, exist_ok=True)

    cnt = 0
    for (y, m), grp in df.groupby(['year', 'month']):
        part1 = grp[grp['day'] <= 10]
        part2 = grp[(grp['day'] >= 11) & (grp['day'] <= 20)]
        part3 = grp[grp['day'] >= 21]
        for pn, pdf in [(1, part1), (2, part2), (3, part3)]:
            if pdf.empty:
                continue
            fname = get_filename(coin, y, m, pn)
            pdf.to_csv(os.path.join(coin_dir, fname), index=False)
            if WRITE_COMBINED:
                pdf.to_csv(os.path.join(COMBINED_DIR, fname), index=False)
            cnt += 1
    log(f"پردازش {zip_path} انجام شد: {cnt} فایل CSV جدید")
    return cnt


def download_one(url, local_path, attempts=3):
    """نتیجه: 'ok' | 'missing' (404) | 'error'"""
    tmp_path = local_path + ".part"
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.get(url, stream=True, timeout=60)
            if resp.status_code == 404:
                return "missing"
            resp.raise_for_status()
            with open(tmp_path, 'wb') as f:
                for chunk in resp.iter_content(1024 * 256):
                    f.write(chunk)
            os.replace(tmp_path, local_path)
            return "ok"
        except Exception as e:
            log(f"تلاش {attempt}/{attempts} ناموفق برای {os.path.basename(local_path)}: {e}", "WARNING")
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            time.sleep(2 * attempt)
    return "error"


def download_zips(coin):
    os.makedirs(ZIPS_DIR, exist_ok=True)
    now = datetime.now()
    ok, missing, errors = 0, 0, []

    log(f"شروع دانلود {coin} از {START_YEAR} تا {now.year}")
    for year in range(START_YEAR, now.year + 1):
        for month in range(1, 13):
            if year == now.year and month > now.month:
                break
            filename = f"{coin}-{INTERVAL}-{year}-{month:02d}.zip"
            url = f"{BASE_URL}/{coin}/{INTERVAL}/{filename}"
            local_path = os.path.join(ZIPS_DIR, filename)

            if os.path.exists(local_path):
                ok += 1
                continue

            result = download_one(url, local_path)
            if result == "ok":
                log(f"دانلود شد: {filename}")
                ok += 1
                time.sleep(0.3)
            elif result == "missing":
                missing += 1  # ماه‌های قبل از لیست شدن ارز یا ماه جاری؛ طبیعی است
            else:
                log(f"دانلود ناموفق (پس از چند تلاش): {filename}", "ERROR")
                errors.append(filename)

    log(f"دانلود تمام شد: {ok} موفق، {missing} موجود‌نبودن (404)، {len(errors)} خطا")
    return ok, errors


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

    log("شروع رمزنگاری با AES-256-CBC و scrypt")
    kdf = Scrypt(salt=b'salt', length=32, n=2**14, r=8, p=1, backend=default_backend())
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
    return True


def main():
    if not re.fullmatch(r"[A-Z0-9]{3,20}", COIN):
        log("متغیر محیطی COIN تنظیم نشده یا نامعتبر است (مثال: COIN=SOLUSDT)", "ERROR")
        sys.exit(1)
    if ENCRYPT_OUTPUT and not WRITE_COMBINED:
        log("ENCRYPT_OUTPUT=yes نیازمند WRITE_COMBINED=yes است", "ERROR")
        sys.exit(1)

    log(f"================== شروع Pipeline تک‌ارزی: {COIN} ({TIMEFRAME}) ==================")
    os.makedirs(os.path.join(OUTPUT_BASE, COIN), exist_ok=True)
    if WRITE_COMBINED:
        os.makedirs(COMBINED_DIR, exist_ok=True)

    ok, errors = download_zips(COIN)
    if errors:
        # داده‌ی ناقص نباید به بکتست و بعد به «انجام‌شده» برسد
        log(f"{len(errors)} فایل دانلود نشد؛ اجرا متوقف می‌شود تا نتیجه‌ی ناقص ثبت نشود.", "ERROR")
        sys.exit(2)
    if ok == 0:
        log(f"هیچ ZIP‌ای برای {COIN} پیدا نشد (نماد اشتباه است؟)", "ERROR")
        sys.exit(1)

    prefix = f"{COIN}-{INTERVAL}-"
    zips = sorted(f for f in os.listdir(ZIPS_DIR) if f.startswith(prefix) and f.endswith('.zip'))
    processed = 0
    for z in zips:
        zpath = os.path.join(ZIPS_DIR, z)
        processed += process_zip(zpath, COIN)
        if not KEEP_ZIPS:
            os.remove(zpath)
    log(f"کل فایل‌های CSV ساخته‌شده برای {COIN}: {processed}")

    if processed == 0:
        log("هیچ CSV‌ای ساخته نشد.", "ERROR")
        sys.exit(1)

    if ENCRYPT_OUTPUT:
        if not encrypt_folder():
            log("❌ رمزنگاری ناموفق!", "ERROR")
            sys.exit(1)
        log("✅ رمزنگاری با موفقیت انجام شد.")

    log("================== پایان Pipeline ==================")


if __name__ == "__main__":
    main()
