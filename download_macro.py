#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_macro.py
-----------------
دانلود داده‌های روزانهٔ بازار سهام آمریکا و کلان (داو جونز، S&P500، نزدک، VIX، دلار، بازده اوراق،
طلا، نفت و ...) بدون کلید API، بدون ثبت‌نام و بدون Secret.

برای هر نماد چند منبع رایگان به‌ترتیب امتحان می‌شود تا اولین منبعی که کل بازه را پوشش بدهد پیدا شود:
    Yahoo Finance  ->  FRED  ->  Stooq  ->  Binance (طلا: PAXG)  ->  Frankfurter (ارز)
اگر هیچ منبعی کل بازه را نداشت، بهترین پوشش جزئی ذخیره و در گزارش علامت partial می‌خورد.

خروجی (همه در یک فایل زیپ):
    macro_data/macro_data.zip
        macro_data/csv/<NAME>.csv          ستون‌ها: Date,Open,High,Low,Close,Volume
        macro_data/daily_close_all.csv     بستهٔ همهٔ نمادها در یک جدول
        macro_data/report.json             منبع هر نماد، تعداد ردیف، بازهٔ تاریخ، تلاش‌های ناموفق
        macro_data/README.txt
    macro_data/latest_report.json          همان گزارش، بدون نیاز به باز کردن زیپ
"""
import io
import json
import os
import random
import shutil
import sys
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

START_DATE = os.environ.get("START_DATE", "2017-10-01").strip() or "2017-10-01"
OUT_DIR = Path("macro_out")
CSV_DIR = OUT_DIR / "csv"
ZIP_DIR = Path("macro_data")
ZIP_PATH = ZIP_DIR / "macro_data.zip"
REQUIRED_FIRST = date(2018, 1, 10)   # اولین تاریخ داده باید حداکثر این روز باشد
MAX_STALE_DAYS = 10                  # آخرین تاریخ داده حداکثر این‌قدر روز قدیمی باشد
PAUSE = 0.4                          # مکث بین درخواست‌ها (ثانیه)

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# هر کاندیدا: (منبع, شناسه, دقیق؟)  — دقیق=False یعنی جایگزین/پروکسی است (مثلاً ETF به‌جای شاخص)
TARGETS = {
    "DJI":   ("Dow Jones Industrial Average", [("yahoo", "^DJI"), ("fred", "DJIA"), ("stooq", "^dji"),
                                               ("yahoo", "DIA", False), ("stooq", "dia.us", False)]),
    "SPX":   ("S&P 500", [("yahoo", "^GSPC"), ("fred", "SP500"), ("stooq", "^spx"),
                          ("yahoo", "SPY", False), ("stooq", "spy.us", False)]),
    "IXIC":  ("Nasdaq Composite", [("yahoo", "^IXIC"), ("fred", "NASDAQCOM"), ("stooq", "^ndq"),
                                   ("yahoo", "QQQ", False), ("stooq", "qqq.us", False)]),
    "NDX":   ("Nasdaq 100", [("yahoo", "^NDX"), ("fred", "NASDAQ100"), ("stooq", "^ndx"),
                             ("yahoo", "QQQ", False), ("stooq", "qqq.us", False)]),
    "RUT":   ("Russell 2000", [("yahoo", "^RUT"), ("stooq", "^rut"),
                               ("yahoo", "IWM", False), ("stooq", "iwm.us", False)]),
    "VIX":   ("CBOE Volatility Index", [("yahoo", "^VIX"), ("fred", "VIXCLS"), ("stooq", "^vix")]),
    "DXY":   ("US Dollar Index", [("yahoo", "DX-Y.NYB"), ("stooq", "dx.f"),
                                  ("fred", "DTWEXBGS", False), ("yahoo", "UUP", False)]),
    "US10Y": ("US 10-year Treasury yield", [("yahoo", "^TNX"), ("fred", "DGS10"), ("stooq", "10usy.b")]),
    "US2Y":  ("US 2-year Treasury yield", [("fred", "DGS2"), ("stooq", "2usy.b")]),
    "US3M":  ("US 3-month Treasury yield", [("yahoo", "^IRX"), ("fred", "DGS3MO")]),
    "CURVE_10Y2Y": ("10Y minus 2Y yield spread", [("fred", "T10Y2Y")]),
    "HY_SPREAD":    ("US high-yield credit spread (OAS)", [("fred", "BAMLH0A0HYM2")]),
    "GOLD":  ("Gold", [("yahoo", "GC=F"), ("stooq", "xauusd"), ("binance", "PAXGUSDT", False),
                       ("yahoo", "GLD", False), ("stooq", "gld.us", False)]),
    "SILVER": ("Silver", [("yahoo", "SI=F"), ("stooq", "xagusd"), ("yahoo", "SLV", False)]),
    "COPPER": ("Copper", [("yahoo", "HG=F"), ("stooq", "hg.f")]),
    "WTI":   ("WTI crude oil", [("yahoo", "CL=F"), ("fred", "DCOILWTICO"), ("stooq", "cl.f")]),
    "BRENT": ("Brent crude oil", [("yahoo", "BZ=F"), ("fred", "DCOILBRENTEU"), ("stooq", "lco.f")]),
    "EURUSD": ("EUR/USD", [("yahoo", "EURUSD=X"), ("fred", "DEXUSEU"), ("frankfurter", "EUR,invert"),
                           ("stooq", "eurusd")]),
    "USDJPY": ("USD/JPY", [("yahoo", "JPY=X"), ("fred", "DEXJPUS"), ("frankfurter", "JPY"),
                           ("stooq", "usdjpy")]),
}
CORE = ["DJI", "SPX", "VIX"]
COLS = ["Open", "High", "Low", "Close", "Volume"]


def log(msg):
    print(f"[{datetime.now(timezone.utc):%H:%M:%S}] {msg}", flush=True)


def http_get(url, params=None, tries=3, timeout=30):
    """(response, error) برمی‌گرداند؛ روی 429/5xx چند بار با مکث تکرار می‌کند."""
    last = "no attempt"
    for i in range(tries):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            if r.status_code == 200:
                return r, None
            last = f"HTTP {r.status_code}"
            if r.status_code in (400, 401, 403, 404, 451):
                break
        except requests.RequestException as e:
            last = f"{type(e).__name__}: {str(e)[:120]}"
        time.sleep(min(2 ** i + random.random(), 8))
    return None, last


def standardize(df):
    """ستون‌ها و ترتیب یکسان: Date, Open, High, Low, Close, Volume (فقط Close الزامی)."""
    df = df.copy()
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce").dt.normalize()
    for c in COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df.columns else float("nan")
    df = df.dropna(subset=["Date", "Close"])
    df = df[df["Date"] >= pd.Timestamp(START_DATE)]
    df = df.sort_values("Date").drop_duplicates("Date", keep="last").reset_index(drop=True)
    return df[["Date"] + COLS]


# ------------------------------ منابع ------------------------------
def fetch_yahoo(sym):
    p1 = int(datetime.fromisoformat(START_DATE).replace(tzinfo=timezone.utc).timestamp())
    p2 = int((datetime.now(timezone.utc) + timedelta(days=2)).timestamp())
    last = "no response"
    for host in ("query1", "query2"):
        url = f"https://{host}.finance.yahoo.com/v8/finance/chart/{quote(sym)}"
        r, err = http_get(url, params={"period1": p1, "period2": p2, "interval": "1d", "events": "history"}, tries=2)
        if r is None:
            last = err
            continue
        try:
            res = r.json()["chart"]["result"][0]
            ts = res.get("timestamp") or []
            if not ts:
                last = "empty result"
                continue
            q = res["indicators"]["quote"][0]
            off = int((res.get("meta") or {}).get("gmtoffset", 0) or 0)
            idx = pd.to_datetime([t + off for t in ts], unit="s")
            df = pd.DataFrame({"Date": idx, "Open": q.get("open"), "High": q.get("high"),
                               "Low": q.get("low"), "Close": q.get("close"), "Volume": q.get("volume")})
            return standardize(df), None
        except Exception as e:  # noqa: BLE001
            last = f"bad payload: {type(e).__name__}: {str(e)[:80]}"
    return None, last


def fetch_stooq(sym):
    d1 = START_DATE.replace("-", "")
    d2 = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y%m%d")
    r, err = http_get("https://stooq.com/q/d/l/", params={"s": sym, "i": "d", "d1": d1, "d2": d2}, tries=2)
    if r is None:
        return None, err
    text = r.text.strip()
    if not text.lower().startswith("date"):
        return None, "not CSV: " + text[:70].replace("\n", " ")
    try:
        df = pd.read_csv(io.StringIO(text))
        df.columns = [str(c).strip().title() for c in df.columns]
        return standardize(df), None
    except Exception as e:  # noqa: BLE001
        return None, f"parse error: {str(e)[:80]}"


def fetch_fred(series):
    r, err = http_get("https://fred.stlouisfed.org/graph/fredgraph.csv",
                      params={"id": series, "cosd": START_DATE}, tries=3)
    if r is None:
        return None, err
    text = r.text.strip()
    if text.startswith("<") or "," not in text.splitlines()[0]:
        return None, "not CSV: " + text[:70].replace("\n", " ")
    try:
        df = pd.read_csv(io.StringIO(text))
        c0, c1 = df.columns[:2]
        df = df.rename(columns={c0: "Date", c1: "Close"})
        return standardize(df), None
    except Exception as e:  # noqa: BLE001
        return None, f"parse error: {str(e)[:80]}"


def fetch_binance(symbol):
    start = int(datetime.fromisoformat(START_DATE).replace(tzinfo=timezone.utc).timestamp() * 1000)
    last = "no response"
    for host in ("https://data-api.binance.vision", "https://api.binance.com"):
        rows, cur, ok = [], start, True
        while True:
            r, err = http_get(host + "/api/v3/klines",
                              params={"symbol": symbol, "interval": "1d", "startTime": cur, "limit": 1000}, tries=2)
            if r is None:
                ok, last = False, err
                break
            try:
                data = r.json()
            except Exception as e:  # noqa: BLE001
                ok, last = False, f"bad JSON: {str(e)[:60]}"
                break
            if not isinstance(data, list) or not data:
                break
            rows += data
            if len(data) < 1000:
                break
            cur = data[-1][0] + 86400000
            time.sleep(0.2)
        if ok and rows:
            df = pd.DataFrame(rows).iloc[:, :6]
            df.columns = ["ts", "Open", "High", "Low", "Close", "Volume"]
            df["Date"] = pd.to_datetime(df["ts"], unit="ms")
            return standardize(df), None
        if ok:
            last = "no rows"
    return None, last


def fetch_frankfurter(spec):
    cur, _, mode = spec.partition(",")
    end = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    last = "no response"
    for base in ("https://api.frankfurter.dev/v1", "https://api.frankfurter.app"):
        r, err = http_get(f"{base}/{START_DATE}..{end}", params={"from": "USD", "to": cur}, tries=2)
        if r is None:
            last = err
            continue
        try:
            rates = r.json()["rates"]
            df = pd.DataFrame({"Date": list(rates.keys()), "Close": [v[cur] for v in rates.values()]})
            df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
            if mode == "invert":
                df["Close"] = 1.0 / df["Close"]
            return standardize(df), None
        except Exception as e:  # noqa: BLE001
            last = f"bad payload: {str(e)[:80]}"
    return None, last


FETCHERS = {"yahoo": fetch_yahoo, "stooq": fetch_stooq, "fred": fetch_fred,
            "binance": fetch_binance, "frankfurter": fetch_frankfurter}


# ------------------------------ منطق اصلی ------------------------------
def coverage(df):
    first, last = df["Date"].min().date(), df["Date"].max().date()
    full = first <= REQUIRED_FIRST and last >= date.today() - timedelta(days=MAX_STALE_DAYS)
    return first, last, full


def get_target(name, desc, cands):
    attempts, chosen, partial = [], None, None
    for cand in cands:
        src, ident = cand[0], cand[1]
        exact = cand[2] if len(cand) > 2 else True
        t0 = time.time()
        try:
            df, err = FETCHERS[src](ident)
        except Exception as e:  # noqa: BLE001
            df, err = None, f"crash: {type(e).__name__}: {str(e)[:80]}"
        att = {"source": src, "id": ident, "exact": exact, "seconds": round(time.time() - t0, 1)}
        if df is None or df.empty:
            att.update(ok=False, error=err or "empty")
            attempts.append(att)
            log(f"   x {name:12s} {src}:{ident} -> {att['error']}")
            time.sleep(PAUSE)
            continue
        first, last, full = coverage(df)
        att.update(ok=True, rows=len(df), first=str(first), last=str(last), full_coverage=full)
        attempts.append(att)
        log(f"   {'OK' if full else '~~'} {name:12s} {src}:{ident} rows={len(df)} {first} -> {last}")
        if full:
            chosen = (df, att)
            break
        if partial is None or (first, -len(df)) < (partial[2], -len(partial[0])):
            partial = (df, att, first)
        time.sleep(PAUSE)
    status = "ok"
    if chosen is None and partial is not None:
        chosen, status = (partial[0], partial[1]), "partial"
    elif chosen is None:
        status = "missing"
    info = {"name": name, "description": desc, "status": status, "attempts": attempts}
    if chosen:
        df, att = chosen
        info.update(source=att["source"], id=att["id"], exact=att["exact"], rows=len(df),
                    first=str(df["Date"].min().date()), last=str(df["Date"].max().date()))
        return df, info
    return None, info


def main():
    log(f"شروع دانلود داده‌های کلان از {START_DATE}")
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    ZIP_DIR.mkdir(parents=True, exist_ok=True)

    report = {"generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "start_date": START_DATE, "targets": {}}
    closes = {}
    for name, (desc, cands) in TARGETS.items():
        log(f"=== {name}: {desc}")
        df, info = get_target(name, desc, cands)
        report["targets"][name] = info
        if df is not None:
            out = df.copy()
            out["Date"] = out["Date"].dt.strftime("%Y-%m-%d")
            out.to_csv(CSV_DIR / f"{name}.csv", index=False)
            closes[name] = df.set_index("Date")["Close"]

    got = [n for n, i in report["targets"].items() if i["status"] in ("ok", "partial")]
    missing = [n for n, i in report["targets"].items() if i["status"] == "missing"]
    partial = [n for n, i in report["targets"].items() if i["status"] == "partial"]
    proxies = [n for n, i in report["targets"].items() if i.get("source") and not i.get("exact", True)]
    report["summary"] = {"downloaded": got, "partial": partial, "missing": missing, "proxy_used": proxies}

    if closes:
        pd.DataFrame(closes).sort_index().rename_axis("Date").reset_index().assign(
            Date=lambda d: d["Date"].dt.strftime("%Y-%m-%d")).to_csv(OUT_DIR / "daily_close_all.csv", index=False)

    (OUT_DIR / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "README.txt").write_text(
        "Daily market/macro data (free sources, no API keys).\n"
        "csv/<NAME>.csv : Date,Open,High,Low,Close,Volume (series from FRED have Close only).\n"
        "Date = trading-session date in the exchange's local time (US sessions close ~20:00-21:00 UTC).\n"
        "daily_close_all.csv : Close of every series in one table (empty where a market was closed).\n"
        "report.json : which source was used per series, row counts, date range, failed attempts.\n"
        "Series marked proxy in report.json (exact=false) are substitutes (ETF or broad dollar index).\n",
        encoding="utf-8")

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(OUT_DIR.rglob("*")):
            if p.is_file():
                z.write(p, Path("macro_data") / p.relative_to(OUT_DIR))
    shutil.copyfile(OUT_DIR / "report.json", ZIP_DIR / "latest_report.json")

    log("=================== خلاصه ===================")
    for n, i in report["targets"].items():
        tag = {"ok": "OK     ", "partial": "PARTIAL", "missing": "MISSING"}[i["status"]]
        extra = f"{i['source']}:{i['id']} rows={i['rows']} {i['first']}->{i['last']}" + ("" if i.get("exact", True) else "  (proxy)") if i.get("source") else ""
        log(f"{tag} {n:12s} {extra}")
    log(f"زیپ: {ZIP_PATH}  ({ZIP_PATH.stat().st_size/1024:.0f} KB)")
    if not any(n in got for n in CORE):
        log("هیچ‌کدام از نمادهای اصلی (DJI, SPX, VIX) دانلود نشد.")
        sys.exit(1)


if __name__ == "__main__":
    main()
