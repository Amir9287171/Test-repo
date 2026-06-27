#!/usr/bin/env python3
"""
فقط بایننس - با پروکسی برای دور زدن تحریم
"""

import os
import sys
import tarfile
import secrets
import time
from datetime import datetime
import pandas as pd
import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

SYMBOL = "PAXGUSDT"
DATA_DIR = "data/All_Coins_Combined"
ENCRYPTED_DIR = "encrypted_data"
FLAG_FILE = os.path.join(ENCRYPTED_DIR, "data_2025_2026_done.flag")
PASSWORD_ENV = "DATA_PASSWORD"

def fetch_binance(symbol, start_str, end_str):
    """فقط بایننس با ۳ روش مختلف"""
    start_ts = int(datetime.strptime(start_str, "%Y-%m-%d").timestamp() * 1000)
    end_ts = int(datetime.strptime(end_str, "%Y-%m-%d").timestamp() * 1000)
    
    # روش‌های مختلف برای دریافت از بایننس
    methods = [
        # روش ۱: ساب‌دامین‌های مختلف
        lambda: fetch_direct(symbol, start_ts, end_ts),
        # روش ۲: با پروکسی CORS
        lambda: fetch_with_proxy(symbol, start_ts, end_ts),
        # روش ۳: با هدرهای شبیه‌سازی مرورگر
        lambda: fetch_with_browser_headers(symbol, start_ts, end_ts)
    ]
    
    for i, method in enumerate(methods, 1):
        print(f"🔄 روش {i} از ۳ ...")
        try:
            df = method()
            if df is not None and not df.empty:
                print(f"✅ روش {i} موفق بود")
                return df
        except Exception as e:
            print(f"❌ روش {i} شکست: {str(e)[:100]}")
            time.sleep(1)
    
    return pd.DataFrame()

def fetch_direct(symbol, start_ts, end_ts):
    """روش ۱: ساب‌دامین‌های مختلف بایننس"""
    base_urls = [
        'https://api.binance.com',
        'https://api1.binance.com', 
        'https://api2.binance.com',
        'https://api3.binance.com'
    ]
    
    for base in base_urls:
        try:
            all_data = []
            temp_start = start_ts
            while temp_start < end_ts:
                params = {
                    'symbol': symbol,
                    'interval': '1d',
                    'startTime': temp_start,
                    'limit': 1000
                }
                resp = requests.get(
                    f"{base}/api/v3/klines",
                    params=params,
                    timeout=30,
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                
                if resp.status_code == 451:
                    print(f"⚠️ تحریم از {base}")
                    break
                    
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                all_data.extend(data)
                temp_start = data[-1][6] + 1
            
            if all_data:
                return convert_to_df(all_data, start_ts, end_ts)
                
        except Exception as e:
            continue
    
    return None

def fetch_with_proxy(symbol, start_ts, end_ts):
    """روش ۲: از طریق پروکسی CORS"""
    proxy_urls = [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url='
    ]
    
    for proxy in proxy_urls:
        try:
            all_data = []
            temp_start = start_ts
            while temp_start < end_ts:
                params = {
                    'symbol': symbol,
                    'interval': '1d',
                    'startTime': temp_start,
                    'limit': 1000
                }
                binance_url = f"https://api.binance.com/api/v3/klines?{requests.compat.urlencode(params)}"
                target_url = proxy + binance_url
                
                resp = requests.get(target_url, timeout=30)
                
                if resp.status_code == 403 or resp.status_code == 451:
                    print(f"⚠️ تحریم از پروکسی {proxy}")
                    break
                    
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                all_data.extend(data)
                temp_start = data[-1][6] + 1
            
            if all_data:
                return convert_to_df(all_data, start_ts, end_ts)
                
        except Exception as e:
            continue
    
    return None

def fetch_with_browser_headers(symbol, start_ts, end_ts):
    """روش ۳: با هدرهای شبیه‌سازی مرورگر واقعی"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.binance.com/',
        'Origin': 'https://www.binance.com'
    }
    
    try:
        all_data = []
        temp_start = start_ts
        while temp_start < end_ts:
            params = {
                'symbol': symbol,
                'interval': '1d',
                'startTime': temp_start,
                'limit': 1000
            }
            resp = requests.get(
                'https://api.binance.com/api/v3/klines',
                params=params,
                headers=headers,
                timeout=30
            )
            
            if resp.status_code == 451:
                print("⚠️ تحریم با هدرهای مرورگر")
                break
                
            resp.raise_for_status()
            data = resp.json()
            if not data:
                break
            all_data.extend(data)
            temp_start = data[-1][6] + 1
        
        if all_data:
            return convert_to_df(all_data, start_ts, end_ts)
            
    except Exception as e:
        pass
    
    return None

def convert_to_df(data, start_ts, end_ts):
    """تبدیل داده‌های بایننس به DataFrame"""
    df = pd.DataFrame(data, columns=[
        'open_time','open','high','low','close','volume',
        'close_time','quote_asset_volume','number_of_trades',
        'taker_buy_base','taker_buy_quote','ignore'
    ])
    df = df[['open_time','open','high','low','close','volume']]
    df['open_time'] = pd.to_datetime(df['open_time'], unit='ms')
    df.columns = ['date','open','high','low','close','volume']
    df = df.sort_values('date').reset_index(drop=True)
    return df

def save_csv(df, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    df.to_csv(path, index=False)
    print(f"💾 ذخیره شد: {path}")
    return path

def run_historical():
    print("🔄 دریافت داده‌های تاریخی (۲۰۱۷–۲۰۲۴)")
    df = fetch_binance(SYMBOL, "2017-01-01", "2024-12-31")
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")
    print(f"✅ {len(df)} رکورد ذخیره شد")
    return True

def run_recent():
    force = os.environ.get("FORCE_REBUILD", "no").lower() == "yes"
    if os.path.exists(FLAG_FILE) and not force:
        print("ℹ️ پرچم وجود دارد، مرحله recent رد شد")
        return True
    print("🔄 دریافت داده‌های ۲۰۲۵–تا امروز")
    today = datetime.now().strftime("%Y-%m-%d")
    df = fetch_binance(SYMBOL, "2025-01-01", today)
    if df.empty:
        print("❌ داده‌ای دریافت نشد.")
        return False
    save_csv(df, f"{SYMBOL}.csv")
    os.makedirs(os.path.dirname(FLAG_FILE), exist_ok=True)
    with open(FLAG_FILE, 'w') as f:
        f.write(datetime.now().isoformat())
    print(f"✅ {len(df)} رکورد جدید ذخیره شد")
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
