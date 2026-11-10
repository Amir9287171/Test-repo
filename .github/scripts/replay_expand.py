#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باز کردن single_coin_replay_config.json به فهرست «واریانت»ها — بدون ساختن هیچ فایل استراتژی.

هر واریانت = (استراتژی پایه، پلکان یا None، آفست ورود). خروجی‌ها:
  --manifest          فایل JSON کامل واریانت‌ها (موتور بکتست و مرحله‌ی متادیتای loop از آن می‌خوانند)
  --out-tools-config  config موقت هم‌فرمت single_coin_config.json برای single_coin_tools.py
                      (نام مجازی هر واریانت: <BASE>__<tag>.js؛ فایل واقعی ندارد)
  --bases-file        فهرست استراتژی‌های پایه
  --env-file          خطوط KEY=VALUE (مثلاً $GITHUB_ENV)

فرمت config (کلیدهایی که با _ شروع شوند نادیده گرفته می‌شوند):
{
  "coins": ["BTCUSDT"],
  "entries_source": "aggregated",                      # پوشه‌ی aggregated مخزن سوم (یکپارچه‌ی loop_analysis)؛ یا "single_coin_aggregated" / "now-test-repo"
  "max_wait_minutes": 60,
  "include_baseline": true,                            # بازپخش خودِ استراتژی (پلکان و ورود اصلی) برای مقایسه
  "strategies": {"1": "اسم-بلند.js@1h", "2": "دیگری.js#BTCUSDT,ETHUSDT"},   # شماره → استراتژی پایه (@ = فقط این تایم‌فریم‌ها، # = فقط این ارزها؛ بدون # = همه‌ی coins)
  "ladders": {"LadFib": {"stopLossInitial": 0.4, "stages": [...], "use": [1, 2]}},   # use = شماره‌ها یا "all"
  "entry_offsets": {"-0.4": [1, 2], "0.4": "all"},     # x٪ علامت‌دار نسبت به قیمت ورود → شماره‌ها
  "combos": [{"ladder": "Tight", "x": -0.4, "use": [1]}]   # پلکان و x با هم
}
"""
import argparse
import json
import math
import os
import re
import sys

ALL_TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '24h']
STRAT_RX = re.compile(r'[A-Za-z0-9._+-]+\.js')
COIN_RX = re.compile(r'[A-Z0-9]{3,20}')
LABEL_RX = re.compile(r'[A-Za-z0-9.+-]+')       # نام پلکان: بدون زیرخط
SOURCES = ('aggregated', 'single_coin_aggregated', 'now-test-repo')


def die(msg):
    print(f'❌ {msg}')
    sys.exit(1)


def num(v, what):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        die(f'{what} باید عدد معتبر باشد (مقدار: {v!r}).')
    return float(v) if isinstance(v, float) else v


def fmt(x):
    return '%g' % x


def off_tag(x):
    return ('m' if x < 0 else 'p') + fmt(abs(x))


def parse_strategies(cfg, sdir):
    raw = cfg.get('strategies')
    if not isinstance(raw, dict) or not raw:
        die('«strategies» باید آبجکت غیرخالی «شماره → نام فایل» باشد؛ مثلاً {"1": "name.js@1h"}.')
    out = {}
    for sid, item in raw.items():
        if str(sid).startswith('_'):
            continue
        head, _, coin_part = str(item).strip().partition('#')
        name, _, tf_part = head.partition('@')
        name = name.strip()
        if not STRAT_RX.fullmatch(name):
            die(f"نام استراتژی نامعتبر برای شماره {sid}: '{item}'")
        tfs = [t.strip() for t in tf_part.split(',') if t.strip()]
        bad = [t for t in tfs if t not in ALL_TFS]
        if bad:
            die(f"تایم‌فریم نامعتبر در '{item}': {bad} (مجاز: {', '.join(ALL_TFS)})")
        if not os.path.isfile(os.path.join(sdir, name)):
            die(f'{sdir}/{name} (شماره {sid}) در مخزن وجود ندارد.')
        scoins = []
        for c in coin_part.split(','):
            c = re.sub(r'\s', '', c).upper()
            if not c:
                continue
            if not COIN_RX.fullmatch(c):
                die(f"ارز نامعتبر در '{item}': {c}")
            if c not in scoins:
                scoins.append(c)
        if '#' in str(item) and not scoins:
            die(f"بعد از # در '{item}' هیچ ارزی نیامده.")
        out[str(sid)] = {'file': name, 'key': name[:-3], 'tfs': ','.join(t for t in ALL_TFS if t in tfs), 'coins': scoins}
    if not out:
        die('هیچ استراتژی‌ای تعریف نشده.')
    return out


def resolve_use(use, strategies, where):
    if use == 'all' or use == '*':
        return list(strategies)
    if not isinstance(use, list) or not use:
        die(f'{where}: مقدار use باید لیست شماره‌ها یا "all" باشد.')
    ids = []
    for u in use:
        u = str(u)
        if u not in strategies:
            die(f'{where}: شماره‌ی استراتژی {u} در بخش strategies تعریف نشده.')
        if u not in ids:
            ids.append(u)
    return ids


def parse_ladders(cfg):
    lad = cfg.get('ladders', {}) or {}
    if not isinstance(lad, dict):
        die('«ladders» باید آبجکت باشد.')
    res = {}
    for name, spec in lad.items():
        if name.startswith('_'):
            continue
        if not LABEL_RX.fullmatch(name):
            die(f"نام پلکان '{name}' نامعتبر است (فقط حروف انگلیسی، عدد و . + - ؛ بدون زیرخط/فاصله).")
        if not isinstance(spec, dict):
            die(f"پلکان '{name}' باید آبجکت باشد.")
        sl = num(spec.get('stopLossInitial'), f'{name}.stopLossInitial')
        if sl <= 0:
            die(f'{name}.stopLossInitial باید مثبت باشد (درصد).')
        stages, last = [], -1
        for i, s in enumerate(spec.get('stages', []) or []):
            if not isinstance(s, dict):
                die(f'{name}.stages[{i}] باید آبجکت باشد.')
            mp = num(s.get('movePercent'), f'{name}.stages[{i}].movePercent')
            sp = num(s.get('stopLossPercent'), f'{name}.stages[{i}].stopLossPercent')
            if mp <= last:
                die(f'{name}.stages: movePercent باید اکیداً صعودی باشد (ایندکس {i}).')
            last = mp
            stages.append({'movePercent': mp, 'stopLossPercent': sp})
        res[name] = {'name': name, 'stopLossInitial': sl, 'stages': stages, 'use': spec.get('use')}
    return res


def parse_x(v, where):
    try:
        x = float(v)
    except Exception:
        die(f"{where}: مقدار x نامعتبر ({v!r}).")
    if not math.isfinite(x) or abs(x) > 50:
        die(f'{where}: x={v} غیرمنطقی است (حداکثر ۵۰٪).')
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', default='single_coin_replay_config.json')
    ap.add_argument('--strategies-dir', default='strategies')
    ap.add_argument('--manifest')
    ap.add_argument('--out-tools-config')
    ap.add_argument('--bases-file')
    ap.add_argument('--env-file')
    a = ap.parse_args()

    try:
        with open(a.config, encoding='utf-8') as f:
            cfg = json.load(f)
    except Exception as e:
        die(f'{a.config} وجود ندارد یا JSON نامعتبر است ({e}).')
    if not isinstance(cfg, dict):
        die('config باید یک آبجکت JSON باشد.')

    source = cfg.get('entries_source', 'aggregated')
    if source not in SOURCES:
        die(f"entries_source نامعتبر: '{source}' (مجاز: {', '.join(SOURCES)}).")
    wait = cfg.get('max_wait_minutes', 60)
    if isinstance(wait, bool) or not isinstance(wait, int) or not (1 <= wait <= 10080):
        die('max_wait_minutes باید عدد صحیح بین ۱ و ۱۰۰۸۰ باشد.')
    coins = cfg.get('coins')
    if not isinstance(coins, list) or not coins:
        die('«coins» باید لیست غیرخالی باشد.')

    strategies = parse_strategies(cfg, a.strategies_dir)
    ladders = parse_ladders(cfg)

    variants = {}          # key → واریانت (ترتیب درج حفظ می‌شود)

    def add(sid, ladder, x):
        st = strategies[sid]
        if ladder is None and x == 0:
            tag = 'BASE'
        else:
            parts = []
            if ladder is not None:
                parts.append(f'L-{ladder["name"]}')
            if x != 0:
                parts.append(f'E-{off_tag(x)}')
            tag = '__'.join(parts)
        key = f"{st['key']}__{tag}"
        if len(key) > 200:
            die(f'نام واریانت بیش از حد طولانی است: {key}')
        if key in variants:
            v0 = variants[key]                      # همان واریانت از دو شماره: ارزها ادغام می‌شوند (خالی = همه)
            if v0['coins'] and st['coins']:
                v0['coins'] += [c for c in st['coins'] if c not in v0['coins']]
            else:
                v0['coins'] = []
            return
        variants[key] = {
            'key': key, 'file': key + '.js', 'tag': tag, 'baseFile': st['file'], 'baseKey': st['key'],
            'tfs': st['tfs'], 'coins': list(st['coins']), 'strategyId': sid,
            'ladder': ({'name': ladder['name'], 'stopLossInitial': ladder['stopLossInitial'], 'stages': ladder['stages']}
                       if ladder is not None else None),
            'offsetPercent': x, 'maxWaitMinutes': wait,
        }

    if cfg.get('include_baseline', True):
        for sid in strategies:
            add(sid, None, 0.0)
    for name, lad in ladders.items():
        if lad['use'] is None:
            continue                                   # فقط برای combos تعریف شده
        for sid in resolve_use(lad['use'], strategies, f'ladders.{name}.use'):
            add(sid, lad, 0.0)
    offs = cfg.get('entry_offsets', {}) or {}
    if not isinstance(offs, dict):
        die('«entry_offsets» باید آبجکت «x → شماره‌ها» باشد؛ مثلاً {"-0.4": [1, 2]}.')
    for xs, use in offs.items():
        if str(xs).startswith('_'):
            continue
        x = parse_x(xs, 'entry_offsets')
        if x == 0:
            continue
        for sid in resolve_use(use, strategies, f'entry_offsets[{xs}]'):
            add(sid, None, x)
    for i, c in enumerate(cfg.get('combos', []) or []):
        if not isinstance(c, dict):
            die(f'combos[{i}] باید آبجکت باشد.')
        lname = c.get('ladder')
        if lname is not None and lname not in ladders:
            die(f"combos[{i}]: پلکان '{lname}' در بخش ladders تعریف نشده.")
        x = parse_x(c.get('x', 0), f'combos[{i}]')
        for sid in resolve_use(c.get('use'), strategies, f'combos[{i}].use'):
            add(sid, ladders[lname] if lname is not None else None, x)

    if not variants:
        die('هیچ واریانتی ساخته نشد (include_baseline خاموش است و هیچ پلکان/x/combo تعریف نشده).')
    if len(variants) > 300:
        print(f'::warning::{len(variants)} واریانت ساخته شد؛ تعداد زیاد است و اجرا طولانی می‌شود.')

    print(f'🔁 REPLAY: {len(strategies)} استراتژی پایه → {len(variants)} واریانت | منبع ورود: {source} | انتظار: {wait} کندل ۱ دقیقه‌ای')
    for v in variants.values():
        lad = f"پلکان {v['ladder']['name']}" if v['ladder'] else 'پلکان خود استراتژی'
        cs = ','.join(v['coins']) if v['coins'] else 'همه'
        print(f"   • [{v['strategyId']}] {v['tag']:<28} {lad} | آفست {fmt(v['offsetPercent'])}٪ | ارز: {cs}")

    if a.manifest:
        with open(a.manifest, 'w', encoding='utf-8') as f:
            json.dump({'entriesSource': source, 'maxWaitMinutes': wait, 'order': list(variants), 'variants': variants},
                      f, ensure_ascii=False)
    only = {x.strip().partition('@')[0].removesuffix('.js')
            for x in os.environ.get('REPLAY_ONLY_STRATEGIES', '').split(',') if x.strip()}
    sel = [v for v in variants.values() if not only or v['key'] in only or v['baseKey'] in only or v['strategyId'] in only]
    if only:
        print(f'🎯 فیلتر only_strategies: {sorted(only)} → {len(sel)} از {len(variants)} واریانت')
    if not sel:
        die('بعد از اعمال فیلتر only_strategies هیچ واریانتی نماند.')
    if a.out_tools_config:
        tc = {'strategies': [v['file'] + (f"@{v['tfs']}" if v['tfs'] else '') + (f"#{','.join(v['coins'])}" if v['coins'] else '') for v in sel], 'coins': coins}
        with open(a.out_tools_config, 'w', encoding='utf-8') as f:
            json.dump(tc, f, ensure_ascii=False)
        print(f'📝 config موقت ابزار: {a.out_tools_config} ({len(sel)} واحد)')
    if a.bases_file:
        with open(a.bases_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(sorted({s['key'] for s in strategies.values()})) + '\n')
    if a.env_file:
        with open(a.env_file, 'a', encoding='utf-8') as f:
            f.write(f'REPLAY_ENTRIES_SOURCE={source}\n')


if __name__ == '__main__':
    main()
