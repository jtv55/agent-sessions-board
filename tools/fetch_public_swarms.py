"""Fetch a few public Claude Code swarm traces and reduce them to public-swarms.json.

Source: semianalysisai/cc-traces-weka-with-subagents-051926 on Hugging Face (Apache-2.0).
Anonymised Claude Code sessions: timing, token counts, models and Task-tool sub-agent fan-out.
There is no message text and no tool names in the source.

The file is ~1 GB, so this reads three byte ranges and keeps only the traces listed in PICK.
Run:  python tools/fetch_public_swarms.py
"""
import json, sys, urllib.request, pathlib

REV = '78b029aad10404c2ffef3329001588f3326a234b'
URL = f'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-with-subagents-051926/resolve/{REV}/traces.jsonl'
RANGES = [(0, 11_000_000), (735_000_000, 746_000_000), (945_000_000, 956_000_000)]
PICK = ['00ac905e', '00f4cc77', '9e4c371a', '9edb5f53', '9a259b1b', 'ec9f0bd2']  # id prefixes
BLOCK = 64


def fetch(a, b):
    req = urllib.request.Request(URL, headers={'Range': f'bytes={a}-{b}'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def common_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def reduce(d):
    reqs = d['requests']
    main, subs = [], []
    prev = None
    for x in reqs:
        if x.get('type') == 'subagent':
            inner = x['requests']
            parent = None  # latest main request that started before this group
            for m in main:
                if m['t'] <= x['t']:
                    parent = m
            first = inner[0]
            reuse0 = min(first['in'], common_prefix(parent['h'], first['hash_ids']) * BLOCK) if parent else 0
            ends = [i['t'] + i['api_time'] for i in inner]
            subs.append({
                'id': x['agent_id'], 't0': round(inner[0]['t'], 2), 't1': round(max(ends), 2),
                'n': len(inner), 'in': sum(i['in'] for i in inner), 'out': sum(i['out'] for i in inner),
                'api': round(sum(i['api_time'] for i in inner), 2),
                'models': sorted({i['model'] for i in inner}),
                'firstIn': first['in'], 'reuse0': reuse0,
                'iv': [[round(i['t'], 2), round(i['t'] + i['api_time'], 2)] for i in inner],
            })
        else:
            r = min(x['in'], common_prefix(prev, x['hash_ids']) * BLOCK) if prev is not None else 0
            main.append({'t': x['t'], 'in': x['in'], 'out': x['out'], 'api': x['api_time'],
                         'think': x.get('think_time'), 'model': x['model'], 'reuse': r, 'h': x['hash_ids']})
            prev = x['hash_ids']
    return {
        'id': d['id'][:8], 'models': d['models'],
        'main': [[round(m['t'], 2), m['in'], m['out'], round(m['api'], 2),
                  None if m['think'] is None else round(m['think'], 2), m['reuse'], m['model']] for m in main],
        'subs': subs,
    }


def main():
    found = {}
    for k, (a, b) in enumerate(RANGES):
        raw = fetch(a, b).split(b'\n')
        lines = raw[:-1] if a == 0 else raw[1:-1]  # drop the cut first/last lines
        for ln in lines:
            if any(p.encode() in ln[:60] for p in PICK):
                d = json.loads(ln)
                if d['id'][:8] in PICK:
                    found[d['id'][:8]] = reduce(d)
        print('range', k, 'ok', len(lines), 'complete lines', file=sys.stderr)
    missing = [p for p in PICK if p not in found]
    if missing:
        sys.exit(f'missing traces: {missing}')
    out = {
        'source': 'semianalysisai/cc-traces-weka-with-subagents-051926',
        'rev': REV, 'license': 'Apache-2.0',
        'url': 'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-with-subagents-051926',
        'blockSize': BLOCK, 'traces': [found[p] for p in PICK],
    }
    p = pathlib.Path(__file__).resolve().parent.parent / 'public-swarms.json'
    p.write_text(json.dumps(out, separators=(',', ':')), encoding='utf8')
    print('wrote', p, p.stat().st_size, 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
