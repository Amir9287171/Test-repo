#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ابزار مشترک single_coin_backtest.yml و single_coin_loop.yml

حالت‌ها (آرگومان اول):
  plan    انتخاب jobهای (استراتژی، ارز) برای این اجرا (نیمه‌کاره‌ها اول)
  loop    شمارش jobهای باقی‌مانده (برای single_coin_loop.yml)
  matrix  ساخت ماتریس چانک‌ها و plan.json
  verify  راستی‌آزمایی چانک‌های خروجی بکتست (finalize)
  merge   ادغام نتایج تأییدشده در clone مخزن سوم و نوشتن _chunks/_done (finalize)

فرمت config:
  "strategies": ["a.js", "b.js@1h", "c.js@30m,1h"]   یا   "strategy": "a.js@1h"
  بدون @ یعنی همه‌ی تایم‌فریم‌ها؛ با @ فقط همان تایم‌فریم‌ها (--timeframes-only).
  اگر یک فایل چند بار بیاید (مثلاً x.js@1h و x.js@30m) تایم‌فریم‌ها ادغام می‌شوند.
"""
import datetime
import glob
import json
import math
import os
import re
import shutil
import sys

ALL_TFS = ['5m', '15m', '30m', '1h', '4h', '24h']
NAME_RX = re.compile(r'[A-Za-z0-9._+-]+\.js')
COIN_RX = re.compile(r'[A-Z0-9]{3,20}')
MAX_MATRIX = 256


# ---------------------------------------------------------------- helpers
def out(key, value):
    path = os.environ.get('GITHUB_OUTPUT')
    line = f'{key}={value}\n'
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(line)
    else:
        print('[output]', line, end='')


def die(msg):
    print(f'❌ {msg}')
    sys.exit(1)


def load_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def canon(tfs):
    s = set(tfs)
    return [t for t in ALL_TFS if t in s]


def req_tfs(tfs_str):
    """رشته‌ی 'a,b' → لیست تایم‌فریم‌های درخواستی؛ خالی = همه."""
    parts = [t.strip() for t in (tfs_str or '').split(',') if t.strip()]
    return canon(parts) if parts else list(ALL_TFS)


def covers(have, need):
    return set(need) <= set(have)


def jdump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


# ---------------------------------------------------------------- config
def parse_strategies(cfg, strategies_dir=None):
    raw = cfg['strategies'] if isinstance(cfg.get('strategies'), list) else [cfg.get('strategy', '')]
    if not raw:
        die('لیست استراتژی در config خالی است.')
    merged, order = {}, []
    for item in raw:
        name, _, tf_part = str(item).strip().partition('@')
        name = name.strip()
        if not NAME_RX.fullmatch(name):
            die(f"نام استراتژی نامعتبر: '{item}'")
        tfs = [t.strip() for t in tf_part.split(',') if t.strip()]
        bad = [t for t in tfs if t not in ALL_TFS]
        if bad:
            die(f"تایم‌فریم نامعتبر در '{item}': {bad} (مجاز: {', '.join(ALL_TFS)})")
        if strategies_dir is not None and not os.path.isfile(os.path.join(strategies_dir, name)):
            die(f'{strategies_dir}/{name} در مخزن وجود ندارد.')
        if name not in merged:
            order.append(name)
            merged[name] = set(tfs) if tfs else None          # None = همه
        elif merged[name] is None or not tfs:
            merged[name] = None
        else:
            merged[name] |= set(tfs)
    return [{'file': n, 'key': n[:-3], 'tfs': ','.join(canon(merged[n])) if merged[n] else ''} for n in order]


def parse_coins(cfg):
    coins = []
    for c in cfg.get('coins', []):
        c = re.sub(r'\s', '', str(c).upper())
        if COIN_RX.fullmatch(c) and c not in coins:
            coins.append(c)
    return coins


def build_pairs():
    cfg = load_json(os.environ.get('CONFIG', 'single_coin_config.json'))
    if not isinstance(cfg, dict):
        die('single_coin_config.json وجود ندارد یا JSON نامعتبر است.')
    check_dir = 'strategies' if os.environ.get('MODE_CHECK_FILES') == '1' else None
    strats = parse_strategies(cfg, check_dir)
    coins = parse_coins(cfg)

    only_s = {x.strip().partition('@')[0].removesuffix('.js') for x in os.environ.get('ONLY_STRATEGIES', '').split(',') if x.strip()}
    if only_s:
        strats = [s for s in strats if s['key'] in only_s]
        print(f'🎯 فیلتر only_strategies: {[s["file"] for s in strats]}')
    only_c = {re.sub(r'\s', '', x).upper() for x in os.environ.get('ONLY_COINS', '').split(',') if x.strip()}
    if only_c:
        coins = [c for c in coins if c in only_c]
        print(f'🎯 فیلتر only_coins: {coins}')
    return [{'coin': co, 'strategy': s['file'], 'key': s['key'], 'tfs': s['tfs']} for s in strats for co in coins]


# ---------------------------------------------------------------- done / partial
def is_done(root, pair):
    co, key, req = pair['coin'], pair['key'], req_tfs(pair['tfs'])
    p = f'{root}/_done/{co}/{key}.json'
    if os.path.isfile(p):
        d = load_json(p) or {}
        return covers(d.get('tfs') or ALL_TFS, req)
    legacy = f'{root}/_done/{co}.json'                     # نشانه‌ی قدیمی
    if os.path.isfile(legacy):
        d = load_json(legacy) or {}
        return d.get('strategy') == pair['strategy'] and covers(d.get('tfs') or ALL_TFS, req)
    return False


def is_partial(root, pair):
    d = f"{root}/_chunks/{pair['coin']}/{pair['key']}"
    return os.path.isdir(d) and any(f.endswith('.json') for f in os.listdir(d))


def classify(pairs, root, force):
    done, partial, fresh = 0, [], []
    for p in pairs:
        if not force and is_done(root, p):
            done += 1
            print(f"⏭️ {p['coin']} / {p['key']}: انجام‌شده؛ رد می‌شود.")
            continue
        (partial if is_partial(root, p) else fresh).append(p)
    return done, partial, fresh


# ---------------------------------------------------------------- commands
def cmd_plan():
    os.environ['MODE_CHECK_FILES'] = '1'
    root = os.environ['ROOT']
    force = os.environ.get('FORCE') == 'yes'
    max_jobs = max(1, int(os.environ.get('MAX_JOBS') or 10))
    pairs = build_pairs()
    print(f'📋 کل ترکیب‌ها: {len(pairs)}')
    done, partial, fresh = classify(pairs, root, force)
    allp = partial + fresh
    sel = allp[:max_jobs]
    print(f'📊 انجام‌شده: {done} | نیمه‌کاره: {len(partial)} | تازه: {len(fresh)} | '
          f'انتخاب‌شده برای این اجرا: {len(sel)} (سقف {max_jobs})')
    if len(allp) > len(sel):
        print(f'ℹ️ {len(allp) - len(sel)} job به اجرای بعد موکول می‌شود.')
    for p in sel:
        print(f"   • {p['coin']} / {p['key']}" + (f" @ {p['tfs']}" if p['tfs'] else ' (همه‌ی تایم‌فریم‌ها)'))
    out('pairs', jdump(sel))
    out('coins', jdump(sorted({p['coin'] for p in sel})))
    out('has_work', 'true' if sel else 'false')


def cmd_loop():
    root = os.environ['ROOT']
    pairs = build_pairs()
    done, partial, fresh = classify(pairs, root, False)
    remaining = partial + fresh
    print(f'📊 انجام‌شده: {done} | باقی‌مانده: {len(remaining)} (نیمه‌کاره: {len(partial)})')
    for p in remaining[:20]:
        print(f"   • {p['coin']} / {p['key']}")
    out('remaining', len(remaining))


def cmd_matrix():
    pairs = json.loads(os.environ['PAIRS_JSON'])
    force = os.environ.get('FORCE') == 'yes'
    chunk = int(os.environ.get('CHUNK_SIZE', '66'))
    big = int(os.environ.get('BIG_COIN_FILES', '1000'))
    big_size = int(os.environ.get('BIG_COIN_CHUNK_SIZE', '33'))

    plan_pairs, jobs, skipped_full = [], [], 0
    for p in pairs:
        co, key = p['coin'], p['key']
        meta = load_json(f'/tmp/meta/{co}.json')
        if not meta:
            print(f'⚠️ {co} / {key}: داده‌ی ارز آماده نشد؛ به اجرای بعد موکول می‌شود.')
            continue
        names = meta['names']
        size = big_size if len(names) > big else chunk          # ارز بزرگ → چانک کوچک‌تر
        n = math.ceil(len(names) / size)
        need = req_tfs(p['tfs'])
        chunks, to_run = [], 0
        for i in range(n):
            s = i * size
            sl = names[s:s + size]
            done = False
            if not force:
                m = load_json(f'/tmp/third_state/_chunks/{co}/{key}/{s}.json')
                done = (isinstance(m, dict) and m.get('fileNames') == sl
                        and covers(m.get('tfLabels') or ALL_TFS, need))
            to_run += 0 if done else 1
            chunks.append({'start': s, 'names': sl, 'done': done})

        if jobs and len(jobs) + to_run > MAX_MATRIX:
            print(f'::warning::ظرفیت ماتریس ({MAX_MATRIX}) پر شد؛ {co} / {key} ({to_run} چانک) به اجرای بعد موکول شد.')
            skipped_full += 1
            continue
        if to_run > MAX_MATRIX:
            print(f'::warning::{co} / {key} به‌تنهایی {to_run} چانک دارد (سقف ماتریس {MAX_MATRIX})؛ در این اجرا رد شد.')
            skipped_full += 1
            continue
        for ch in chunks:
            if not ch['done']:
                jobs.append({'id': len(jobs), 'coin': co, 'strategy': p['strategy'], 'key': key, 'tfs': p['tfs'],
                             'size': size, 'start': ch['start'], 'names': ch['names']})
        plan_pairs.append({'coin': co, 'strategy': p['strategy'], 'key': key, 'tfs': p['tfs'], 'size': size, 'chunks': chunks})
        print(f"📦 {co} / {key}: {len(names)} فایل | اندازه‌ی چانک {size} → {n} چانک "
              f"({to_run} برای اجرا، {n - to_run} از قبل کامل)" + (f" | تایم‌فریم: {p['tfs']}" if p['tfs'] else ''))

    os.makedirs('/tmp/run-plan', exist_ok=True)
    with open('/tmp/run-plan/plan.json', 'w', encoding='utf-8') as f:
        json.dump({'pairs': plan_pairs, 'jobs': jobs}, f, ensure_ascii=False, separators=(',', ':'))

    total = len(jobs)
    if not plan_pairs:
        out('has_plan', 'false'); out('has_chunks', 'false')
        print('⚠️ هیچ jobی آماده نشد.')
        return
    out('has_plan', 'true')
    if total == 0:
        out('has_chunks', 'false')
        print('ℹ️ همه‌ی چانک‌ها از قبل کامل‌اند؛ فقط نشانه‌ی _done ثبت می‌شود.')
    else:
        out('has_chunks', 'true')
        out('matrix', jdump({'include': [{'id': j['id'], 'coin': j['coin'], 'strategy': j['strategy'],
                                          'chunk': j['start'], 'size': j['size'], 'tfs': j['tfs']} for j in jobs]}))
    par = min(total, 20)
    print(f'✅ کل جاب‌های بکتست: {total} (حداکثر موازی‌سازی واقعی: {par} از ۲۰)')
    if skipped_full:
        print(f'::warning::{skipped_full} job به‌خاطر پر شدن ماتریس به اجرای بعد موکول شد.')
    summ = os.environ.get('GITHUB_STEP_SUMMARY')
    if summ:
        with open(summ, 'a', encoding='utf-8') as f:
            f.write(f'### ماتریس بکتست\n- جاب‌های این اجرا: **{total}** (موازی تا ۲۰)\n'
                    f'- موکول‌شده به اجرای بعد (ظرفیت ماتریس): **{skipped_full}**\n')


def cmd_verify():
    plan = load_json('/tmp/run-plan/plan.json') or {'jobs': []}
    jobs = {j['id']: j for j in plan['jobs']}
    for d in ('/tmp/stage', '/tmp/stage_chunks'):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    run_id = os.environ.get('RUN_ID', '')
    total = ok = skipped = 0
    for ad in sorted(glob.glob('/tmp/chunk_out/chunk-output-*/')):
        total += 1
        name = os.path.basename(ad.rstrip('/'))
        try:
            job = jobs[int(name.removeprefix('chunk-output-'))]
        except Exception:
            print(f'❌ [{name}] در plan نیست؛ نادیده گرفته شد.'); skipped += 1; continue
        co, key, start = job['coin'], job['key'], job['start']
        tag = f'[{name}] {co}/{key}/{start}'
        res = os.path.join(ad, 'results')
        if not os.path.isfile(os.path.join(res, '.chunk_ok')):
            print(f'⏳ {tag} پایان سالم نداشت (شکست یا تمام‌شدن بودجه)؛ به اجرای بعد می‌ماند.'); skipped += 1; continue
        m = load_json(os.path.join(res, f'.manifest_{key}_{start}.json'))
        if not isinstance(m, dict):
            print(f'❌ {tag} منیفست یافت نشد.'); skipped += 1; continue
        if m.get('fileNames') != job['names']:
            print(f'❌ {tag} فهرست فایل‌های منیفست با plan نمی‌خواند.'); skipped += 1; continue
        labels = m.get('tfLabels') or []
        if not labels or set(labels) != set(req_tfs(job['tfs'])):
            print(f'❌ {tag} تایم‌فریم‌های منیفست ({labels}) با درخواست ({req_tfs(job["tfs"])}) نمی‌خواند.'); skipped += 1; continue
        missing = sum(1 for fn in m['fileNames'] for tf in labels
                      if not os.path.isfile(os.path.join(res, f'{key}_{tf}', fn, 'results.enc')))
        if missing:
            print(f'❌ {tag} {missing} خروجی غایب است؛ چانک نادیده گرفته شد.'); skipped += 1; continue

        print(f'✅ {tag} تأیید شد.')
        shutil.copytree(res, f'/tmp/stage/{co}', dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('.manifest_*', '.chunk_ok'))
        mdir = f'/tmp/stage_chunks/{co}/{key}'
        os.makedirs(mdir, exist_ok=True)
        with open(f'{mdir}/{start}.json', 'w', encoding='utf-8') as f:
            json.dump({'coin': co, 'strategy': key, 'start': start, 'fileNames': m['fileNames'],
                       'tfLabels': canon(labels), 'run_id': run_id, 'uploaded_at': now_iso()},
                      f, ensure_ascii=False, separators=(',', ':'))
        ok += 1
    print(f'📊 {total} آرتیفکت دریافت شد | {ok} چانک تأیید | {skipped} ناقص (به اجرای بعد)')
    out('verified_count', ok)


def cmd_merge():
    root = os.environ['ROOT']
    force = os.environ.get('FORCE') == 'yes'
    run_id = os.environ.get('RUN_ID', '')
    plan = load_json('/tmp/run-plan/plan.json') or {'pairs': []}
    os.makedirs(f'{root}/_done', exist_ok=True)
    os.makedirs(f'{root}/_chunks', exist_ok=True)

    # ۱) نتایج چانک‌های تأییدشده
    for d in sorted(glob.glob('/tmp/stage/*/')):
        co = os.path.basename(d.rstrip('/'))
        shutil.copytree(d, f'{root}/{co}', dirs_exist_ok=True)
    # ۲) نشانه‌ی چانک‌ها (اگر همان فایل‌ها قبلاً با تایم‌فریم دیگری ثبت شده، تایم‌فریم‌ها ادغام می‌شوند)
    for mp in sorted(glob.glob('/tmp/stage_chunks/*/*/*.json')):
        rel = os.path.relpath(mp, '/tmp/stage_chunks')
        dest = f'{root}/_chunks/{rel}'
        new = load_json(mp)
        old = load_json(dest)
        if isinstance(old, dict) and old.get('fileNames') == new['fileNames']:
            new['tfLabels'] = canon(set(old.get('tfLabels') or ALL_TFS) | set(new['tfLabels']))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f:
            json.dump(new, f, ensure_ascii=False, separators=(',', ':'))

    # ۳) _done فقط برای jobهایی که همه‌ی چانک‌هایشان کامل است
    n_done = n_part = 0
    for p in plan['pairs']:
        co, key, need = p['coin'], p['key'], req_tfs(p['tfs'])
        complete = True
        for ch in p['chunks']:
            base = '/tmp/stage_chunks' if force else f'{root}/_chunks'      # با force فقط چانک‌های همین اجرا
            m = load_json(f"{base}/{co}/{key}/{ch['start']}.json")
            if not (isinstance(m, dict) and m.get('fileNames') == ch['names']
                    and covers(m.get('tfLabels') or ALL_TFS, need)):
                complete = False
                break
        if not complete:
            print(f'🟡 {co} / {key} هنوز کامل نیست؛ اجرای بعد ادامه می‌دهد.')
            n_part += 1
            continue
        dp = f'{root}/_done/{co}/{key}.json'
        old = load_json(dp) if os.path.isfile(dp) else None
        if old is not None and not force and covers(old.get('tfs') or ALL_TFS, need):
            continue
        tfs = canon(set(need) | set((old or {}).get('tfs') or [])) if old is not None and not force else need
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        with open(dp, 'w', encoding='utf-8') as f:
            json.dump({'coin': co, 'strategy': p['strategy'], 'key': key, 'tfs': tfs, 'uploaded_at': now_iso(),
                       'run_id': run_id, 'chunks': len(p['chunks']),
                       'files': sum(len(c['names']) for c in p['chunks'])}, f, ensure_ascii=False, indent=2)
        print(f'🟢 {co} / {key} کامل شد (تایم‌فریم: {",".join(tfs)}) → _done ثبت شد.')
        n_done += 1
    out('n_done', n_done)
    out('n_part', n_part)


if __name__ == '__main__':
    cmds = {'plan': cmd_plan, 'loop': cmd_loop, 'matrix': cmd_matrix, 'verify': cmd_verify, 'merge': cmd_merge}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        die(f'استفاده: single_coin_tools.py {{{"|".join(cmds)}}}')
    cmds[sys.argv[1]]()
