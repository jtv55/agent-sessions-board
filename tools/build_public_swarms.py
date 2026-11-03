"""Build public-swarms.json (v2) from public agent logs. Run: python tools/build_public_swarms.py

Three lenses, all from openly licensed Hugging Face datasets pinned to a revision:
  deep   Real Claude Code transcripts (parent session + linked sub-agent transcripts): crispwisp/wisp-claude-code-sessions (MIT),
         armand0e/claude-fable-5-claude-code (MIT), trace-commons/agent-traces (CC-BY-4.0).
  fleet  CooperBench: 368 two-agent coop runs and 368 matched solo runs (MIT), per-agent cost, tokens, status, patch size, test outcomes.
  prod   SemiAnalysis production Claude Code traces with sub-agent fan-out (Apache-2.0): timing and token counts only.

Downloads are cached in tools/.cache (or $SWARM_CACHE). No message text is stored beyond a short title per agent.
"""
import csv, json, os, re, sys, collections, datetime, urllib.request, urllib.parse, pathlib, io

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(os.environ.get('SWARM_CACHE') or ROOT / 'tools' / '.cache')
csv.field_size_limit(10 ** 9)

REV = {
    'wisp': ('crispwisp/wisp-claude-code-sessions', 'c2c90b59174318ab0b163ec9c9ac82bb879288ce', 'MIT'),
    'fable': ('armand0e/claude-fable-5-claude-code', '7388ef96f3179f23b6b3618b96572f1aa9b84510', 'MIT'),
    'tc': ('trace-commons/agent-traces', '112ebd4d03ce852b00e935d523107c3d0c9a65bf', 'CC-BY-4.0'),
    'coop': ('CooperBench/qwen9b-coop-claude-code', '6013d5c8c6ad78498bcd9d8dd1635aa0dd97abae', 'MIT'),
    'solo': ('CooperBench/qwen9b-solo-claude-code', '7394d24338afee35bea8d65c8e2304ed52aebe37', 'MIT'),
    'semi': ('semianalysisai/cc-traces-weka-with-subagents-051926', '78b029aad10404c2ffef3329001588f3326a234b', 'Apache-2.0'),
}


def url(key, path):
    repo, rev, _ = REV[key]
    return f'https://huggingface.co/datasets/{repo}/resolve/{rev}/{urllib.parse.quote(path)}'


def fetch(key, path, name=None):
    out = CACHE / key / (name or path.split('/')[-1])
    if out.exists() and out.stat().st_size:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    print('download', key, path.split('/')[-1], file=sys.stderr)
    urllib.request.urlretrieve(url(key, path), out)
    return out


def listing(key):
    repo, rev, _ = REV[key]
    with urllib.request.urlopen(f'https://huggingface.co/api/datasets/{repo}/tree/{rev}?recursive=true&expand=false', timeout=60) as r:
        out = json.load(r)
    return [x['path'] for x in out if x['type'] == 'file']


# ---------- Claude Code transcript parsing ----------

R, B, V, C, O, W = 0, 1, 2, 3, 4, 5   # research, build, verify, coordinate, operate, rework
RESEARCH = {'Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'NotebookRead'}
BUILD = {'Edit', 'Write', 'NotebookEdit', 'MultiEdit'}
COORD = {'Task', 'Agent', 'Workflow', 'TaskOutput', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskStop', 'TodoWrite', 'Skill',
         'ScheduleWakeup', 'SendMessage', 'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'StructuredOutput', 'CronCreate', 'CronDelete', 'CronList', 'Monitor'}
SHELL = {'Bash', 'PowerShell'}
TEST_RE = re.compile(r'\b(pytest|unittest|jest|vitest|mocha|cargo\s+(test|check|clippy)|go\s+(test|vet)|npm\s+(run\s+)?(test|lint|build)|yarn\s+(test|lint|build)|pnpm\s+(test|lint|build)|tsc|eslint|ruff|flake8|mypy|make\s+(test|check)|ctest|bun\s+test|verify|validate)\b', re.I)
RESEARCH_SH = re.compile(r'^(ls|cat|head|tail|grep|rg|find|pwd|echo|wc|which|stat|file|tree|df|du|ps|env|date|type|dir|get-content|get-childitem|select-string|git\s+(status|log|diff|show|branch)|sed\s+-n)\b', re.I)
EXT_RE = re.compile(r'\b(curl|wget|ssh|scp|rsync|git\s+push|git\s+pull|git\s+clone|pip\s+install|npm\s+install|apt|brew|docker\s+pull|invoke-webrequest)\b', re.I)
COMMIT_RE = re.compile(r'git\s+commit')
CORRECTION_RE = re.compile(r"^\s*(no[,. !]|nope|wrong|that'?s not|not what|undo|revert|stop|don'?t|why did you|you (broke|missed|forgot)|actually|instead|i (said|meant|asked))", re.I)
ROLE_RULES = [
    ('Verifier', re.compile(r'adversar|verify|confirm|double-?check|validate|reproduce', re.I)),
    ('Reviewer', re.compile(r'audit|review|critique|inspect|assess|evaluate', re.I)),
    ('Tester', re.compile(r'\btest(s|ing)?\b|\bqa\b', re.I)),
    ('Planner', re.compile(r'synthes|summari[sz]e|\bplan\b|\brank\b|design|propose|roadmap|decide', re.I)),
    ('Builder', re.compile(r'implement|\bwrite\b|\bbuild\b|\bcreate\b|\bfix\b|refactor|\badd\b|generate|port\b', re.I)),
    ('Researcher', re.compile(r'analy[sz]e|investigat|research|survey|explore|\bfind\b|look (up|into)|read through|search', re.I)),
]
EXPECTS = {'Verifier': V, 'Tester': V, 'Reviewer': R, 'Researcher': R, 'Planner': R, 'Builder': B}


def label_subs(subs):
    """Titles and roles from the part of each brief that differs from its siblings (briefs share a long preamble)."""
    n = len(subs)
    lines = [[l.strip() for l in a['_brief'].split('\n') if l.strip()] for a in subs]
    cnt = collections.Counter(l for ls in lines for l in set(ls))
    for a, ls in zip(subs, lines):
        brief = a['_brief']
        m = re.search(r'\(dimension:\s*([^)]+)\)', brief)
        distinct = [l for l in ls if cnt[l] < max(2, 0.5 * n)] if n >= 3 else ls
        text = ' '.join(distinct) or brief
        role = role_of(text + ' ' + brief)
        if m:
            title = ('Verify: ' if role == 'Verifier' else 'Audit: ') + m.group(1)
        else:
            title = re.sub(r'^(You are|You\'re)\s+', '', (distinct[0] if distinct else (ls[-1] if ls else '')))
        a['title'], a['role'] = short(title, 80), role


def short(s, n=90):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n - 1] + '…'


def role_of(text):
    """Role whose keywords appear most often in the text; ties go to the earlier rule."""
    best, score = 'Generalist', 0
    for name, rx in ROLE_RULES:
        k = len(rx.findall((text or '')[:3000]))
        if k > score:
            best, score = name, k
    return best


def ts(s):
    try:
        return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
    except Exception:
        return None


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return '\n'.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text')
    return ''


def parse_agent(path, t0=None, main=False):
    """One transcript file -> compact agent record. t0 = session start (epoch s) for relative times."""
    turns = {}            # message.id -> dict(first ts, usage, model, stop)
    events = []           # [t, bucket, err]
    pend = {}             # tool_use_id -> index into events
    tools = collections.Counter()
    first_ts = last_ts = None
    brief = None
    human = corr = interrupts = compactions = api_err = commits = 0
    lines_add = lines_del = tests = tests_fail = ext = 0
    tool_out_chars = 0
    tool_out = collections.Counter()   # tool name -> result chars
    tool_name = {}                      # tool_use_id -> name
    ext_ids = {}                        # tool_use_id -> (name, t) for calls that leave the sandbox
    ext_calls = []                      # [abs t, name, result chars]
    tool_sec = 0.0
    use_ts = {}
    last_err = False
    since_err = 99
    cwd = None
    hours = [0] * 24
    last_tool = None
    title = None
    first_build_turn = None
    last_assistant = None
    n_recs = 0
    with open(path, encoding='utf8', errors='replace') as f:
        for ln in f:
            try:
                r = json.loads(ln)
            except Exception:
                continue
            n_recs += 1
            t = ts(r.get('timestamp') or '')
            if t is not None:
                first_ts = t if first_ts is None else min(first_ts, t)
                last_ts = t if last_ts is None else max(last_ts, t)
            cwd = cwd or r.get('cwd')
            typ = r.get('type')
            if typ == 'custom-title' and not title:
                title = r.get('customTitle')
            if typ == 'system' and r.get('subtype') == 'compact_boundary':
                compactions += 1
            m = r.get('message') if isinstance(r.get('message'), dict) else None
            if typ == 'assistant' and m:
                mid = m.get('id') or r.get('uuid')
                tr = turns.setdefault(mid, {'t': t, 'm': None, 'u': None, 'stop': None})
                if m.get('model'):
                    tr['m'] = m['model']
                if isinstance(m.get('usage'), dict):
                    tr['u'] = m['usage']
                tr['stop'] = m.get('stop_reason') or tr['stop']
                if r.get('isApiErrorMessage') or m.get('model') == '<synthetic>':
                    api_err += 1
                last_assistant = None
                for c in m.get('content') or []:
                    if not (isinstance(c, dict) and c.get('type') == 'tool_use'):
                        continue
                    name, inp = c.get('name') or '?', c.get('input') or {}
                    tools[name] += 1
                    ext0 = ext
                    tool_name[c.get('id')] = name
                    last_assistant = name
                    b = O
                    if name in RESEARCH: b = R
                    elif name in BUILD: b = B
                    elif name in COORD or name.startswith('mcp__') and False: b = C
                    elif name in SHELL:
                        cmd = (inp.get('command') or '') if isinstance(inp, dict) else ''
                        first = re.sub(r'^(cd\s+\S+\s*(&&|;)\s*)+', '', cmd.strip())
                        if TEST_RE.search(cmd): b = V
                        elif RESEARCH_SH.match(first): b = R
                        else: b = O
                        if COMMIT_RE.search(cmd): commits += 1
                        if EXT_RE.search(cmd): ext += 1
                    elif name.startswith('mcp__'):
                        b = O; ext += 1
                    if name in ('WebSearch', 'WebFetch'): ext += 1
                    if ext > ext0: ext_ids[c.get('id')] = (name, t)
                    if name == 'Write' and isinstance(inp, dict):
                        lines_add += str(inp.get('content', '')).count('\n') + 1
                    elif name in ('Edit', 'MultiEdit') and isinstance(inp, dict):
                        lines_add += str(inp.get('new_string', '')).count('\n') + 1 if inp.get('new_string') else 0
                        lines_del += str(inp.get('old_string', '')).count('\n') + 1 if inp.get('old_string') else 0
                    if b == B and first_build_turn is None:
                        first_build_turn = mid
                    rework = last_err and since_err <= 2 and b != C
                    idx = len(events)
                    events.append([None if t is None else t, W if rework else b, 0, b])
                    pend[c.get('id')] = idx
                    use_ts[c.get('id')] = t
                    since_err += 1
                    if t is not None:
                        hours[datetime.datetime.fromtimestamp(t, datetime.timezone.utc).hour] += 1
            elif typ == 'user' and m:
                content = m.get('content')
                if isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict) and c.get('type') == 'tool_result':
                            idx = pend.pop(c.get('tool_use_id'), None)
                            err = bool(c.get('is_error'))
                            body = c.get('content')
                            nchars = len(body) if isinstance(body, str) else len(json.dumps(body)) if body else 0
                            tool_out_chars += nchars
                            tool_out[tool_name.get(c.get('tool_use_id'), '?')] += nchars
                            if c.get('tool_use_id') in ext_ids:
                                en, et = ext_ids[c.get('tool_use_id')]
                                if et is not None: ext_calls.append([et, en, nchars])
                            u = use_ts.pop(c.get('tool_use_id'), None)
                            if u is not None and t is not None and 0 <= t - u < 3600:
                                tool_sec += t - u
                            if idx is not None:
                                events[idx][2] = 1 if err else 0
                                if events[idx][3] == V:
                                    tests += 1
                                    if err: tests_fail += 1
                            last_err = err
                            since_err = 0 if err else since_err
                body = text_of(content)
                is_tool = isinstance(content, list) and any(isinstance(c, dict) and c.get('type') == 'tool_result' for c in content)
                if body and not is_tool and not r.get('isMeta'):
                    if brief is None and not body.lstrip().startswith('<'):
                        brief = body
                    if main and not r.get('isSidechain') and not body.lstrip().startswith('<'):
                        if body.startswith('[Request interrupted'):
                            interrupts += 1
                        else:
                            human += 1
                            if CORRECTION_RE.search(body): corr += 1
    # per-turn aggregates
    tin = tcr = tcc = tout = 0
    ramp = 0
    seen_build = False
    mods = collections.Counter()
    order = sorted(turns.items(), key=lambda kv: (kv[1]['t'] or 0))
    for mid, tr in order:
        u = tr['u'] or {}
        i, cr, cc, o = u.get('input_tokens', 0) or 0, u.get('cache_read_input_tokens', 0) or 0, u.get('cache_creation_input_tokens', 0) or 0, u.get('output_tokens', 0) or 0
        tin += i; tcr += cr; tcc += cc; tout += o
        if tr['m'] and tr['m'] != '<synthetic>': mods[tr['m']] += 1
        if mid == first_build_turn: seen_build = True
        if not seen_build: ramp += i + cc + o
    ev_t0 = t0 if t0 is not None else first_ts
    ev = []
    for e in events:
        if e[0] is None: continue
        ev.append([round(e[0] - ev_t0, 1), e[1], e[2]])
    ev.sort()
    gaps = [ev[i + 1][0] - ev[i][0] for i in range(len(ev) - 1)]
    idle = sum(g for g in gaps if g > 120)
    ooo = [[round(ev[i][0]), round(g)] for i, g in enumerate(gaps) if g > 900][:12]
    status = 'ok'
    if api_err and not turns.keys() - {k for k, v in turns.items() if v['m'] == '<synthetic>'}: status = 'dead'
    elif last_assistant and last_assistant != 'StructuredOutput' and pend: status = 'cut'
    model = mods.most_common(1)[0][0] if mods else None
    out = {
        'title': short(title or brief or '', 90), 'role': 'Orchestrator' if main else role_of(brief or title or ''), 'model': model, 'models': dict(mods),
        '_brief': (brief or '')[:3000],
        't0': round((first_ts or 0) - ev_t0, 1), 't1': round((last_ts or 0) - ev_t0, 1), 'turns': len(turns),
        'tok': [tin, tcr, tcc, tout], 'tools': dict(tools), 'errs': sum(1 for e in events if e[2]),
        'idle': round(idle), 'ooo': ooo, 'status': status, 'ramp': ramp,
        'edits': tools.get('Edit', 0) + tools.get('MultiEdit', 0), 'writes': tools.get('Write', 0), 'add': lines_add, 'del': lines_del,
        'commits': commits, 'tests': tests, 'testsFail': tests_fail, 'ext': ext, 'toolKB': round(tool_out_chars / 1024), 'toolSec': round(tool_sec),
        'toolOut': {k: round(v / 1024, 1) for k, v in tool_out.items()},
        'extCalls': [[round(a - ev_t0, 1), n, c] for a, n, c in sorted(ext_calls)],
        'apiErr': api_err, 'ev': ev,
    }
    if main:
        out.update({'human': human, 'corr': corr, 'interrupts': interrupts, 'compactions': compactions, 'cwd': cwd, 'hours': hours,
                    'startedAt': datetime.datetime.fromtimestamp(first_ts, datetime.timezone.utc).isoformat() if first_ts else None})
    else:
        out['hours'] = hours
    return out, first_ts


def platform_of(cwd, tools):
    c = cwd or ''
    if 'PowerShell' in tools or re.match(r'^[A-Za-z]:[\\/]', c): return 'Windows'
    if c.startswith('/Users') or c.startswith('/var/folders'): return 'macOS'
    if c.startswith('/home') or c.startswith('/root'): return 'Linux'
    return 'Unknown'


def build_session(key, parent_path, sub_paths, sid):
    main, ft = parse_agent(parent_path, None, main=True)
    t0 = ft
    agents = [dict(main, id='main', name='Main agent', layer=0, squad=None)]
    subs = []
    for sp, squad in sub_paths:
        a, st = parse_agent(sp, t0)
        if a['turns'] < 1: continue
        subs.append((st or 0, a, squad))
    subs.sort(key=lambda x: x[0])
    if subs and not any(s[2] for s in subs):  # no workflow ids: cluster by start proximity
        cur, last = 0, None
        relab = []
        for st, a, _ in subs:
            if last is None or st - last > 300: cur += 1
            relab.append((st, a, 'S%d' % cur)); last = st
        subs = relab
    label_subs([s[1] for s in subs])
    for i, (st, a, squad) in enumerate(subs):
        agents.append(dict(a, id='a%d' % (i + 1), name='Sub-agent %d' % (i + 1), layer=2, squad=squad))
    for a in agents:
        a.pop('_brief', None)
    all_tools = collections.Counter()
    for a in agents:
        all_tools.update(a['tools'])
    hours = [sum(a['hours'][h] for a in agents) for h in range(24)]
    for a in agents: a.pop('hours', None)
    main_rec = agents[0]
    sess = {
        'id': sid[:8], 'src': key, 'lens': 'deep', 'title': main_rec['title'] or sid[:8], 'start': main_rec.pop('startedAt'),
        'platform': platform_of(main_rec.get('cwd'), all_tools), 'hosting': 'api', 'human': main_rec.pop('human'), 'corr': main_rec.pop('corr'),
        'interrupts': main_rec.pop('interrupts'), 'compactions': main_rec.pop('compactions'), 'hours': hours, 'agents': agents,
    }
    main_rec.pop('cwd', None)
    return sess


# ---------- fleet (CooperBench) ----------

def build_fleet():
    co = list(csv.DictReader(open(fetch('coop', 'index.csv', 'coop_index.csv'), encoding='utf8')))
    so = list(csv.DictReader(open(fetch('solo', 'index.csv', 'solo_index.csv'), encoding='utf8')))
    repos = sorted({r['repo'] for r in co})
    ri = {r: i for i, r in enumerate(repos)}
    ep = lambda s: int(datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc).timestamp()) if s else None
    mg = {'clean': 'c', 'conflicts': 'x', 'missing_input': 'm', 'identical': 'i'}

    def ag(a, passed=None):
        return [0 if a['status'] == 'Submitted' else 1, round(a['cost'], 3), a['steps'], a['input_tokens'], a['output_tokens'], a['patch_lines'], None if passed is None else int(bool(passed))]
    coop, solo = [], []
    for r in co:
        m = json.loads(r['metadata']); e = m.get('eval') or {}
        a1, a2 = m['agents']['agent1'], m['agents']['agent2']
        coop.append({'r': ri[r['repo']], 't': r['task_id'], 'f': r['features'], 's': ep(m['started_at']), 'd': round(m['duration_seconds']), 'm': m.get('messages_sent') or 0,
                     'mg': mg.get((e.get('merge') or {}).get('status'), '?'), 'ap': [(e.get('apply_status') or {}).get('agent1', '?')[0], (e.get('apply_status') or {}).get('agent2', '?')[0]],
                     'a': [ag(a1, (e.get('feature1') or {}).get('passed')), ag(a2, (e.get('feature2') or {}).get('passed'))]})
    for r in so:
        m = json.loads(r['metadata']); e = m.get('eval') or {}
        a = m['agent']
        solo.append({'r': ri.get(r['repo'], -1), 't': r['task_id'], 'f': r['features'], 's': ep(m['started_at']), 'd': round(m['duration_seconds']),
                     'a': ag(a), 'p': [int(bool((e.get('feature1') or {}).get('passed'))), int(bool((e.get('feature2') or {}).get('passed')))]})
    return {'repos': repos, 'coop': coop, 'solo': solo, 'model': 'Qwen/Qwen3.5-9B', 'harness': 'claude_code', 'hosting': 'self-hosted (vLLM on Modal H100)'}


# ---------- production timing (SemiAnalysis) ----------

def common_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y: break
        n += 1
    return n


def reduce_semi(d):
    main, subs, prev = [], [], None
    for x in d['requests']:
        if x.get('type') == 'subagent':
            inner = x['requests']
            parent = None
            for mm in main:
                if mm['t'] <= x['t']: parent = mm
            first = inner[0]
            reuse0 = min(first['in'], common_prefix(parent['h'], first['hash_ids']) * 64) if parent else 0
            ends = [i['t'] + i['api_time'] for i in inner]
            subs.append({'t0': round(inner[0]['t'], 2), 't1': round(max(ends), 2), 'n': len(inner), 'in': sum(i['in'] for i in inner), 'out': sum(i['out'] for i in inner),
                         'api': round(sum(i['api_time'] for i in inner), 2), 'models': sorted({i['model'] for i in inner}), 'firstIn': first['in'], 'reuse0': reuse0,
                         'iv': [[round(i['t'], 2), round(i['t'] + i['api_time'], 2)] for i in inner]})
        else:
            rr = min(x['in'], common_prefix(prev, x['hash_ids']) * 64) if prev is not None else 0
            main.append({'t': x['t'], 'in': x['in'], 'out': x['out'], 'api': x['api_time'], 'think': x.get('think_time'), 'model': x['model'], 'reuse': rr, 'h': x['hash_ids']})
            prev = x['hash_ids']
    return {'id': d['id'][:8], 'models': d['models'],
            'main': [[round(m['t'], 2), m['in'], m['out'], round(m['api'], 2), None if m['think'] is None else round(m['think'], 2), m['reuse'], m['model']] for m in main], 'subs': subs}


SEMI_RANGES = [(0, 11_000_000), (735_000_000, 746_000_000), (945_000_000, 956_000_000)]
SEMI_PICK = ['00ac905e', '00f4cc77', '9e4c371a', '9edb5f53', '9a259b1b', 'ec9f0bd2']


def build_prod():
    found = {}
    for a, b in SEMI_RANGES:
        cache = CACHE / 'semi' / f'{a}.bin'
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            print('download semi range', a, file=sys.stderr)
            req = urllib.request.Request(url('semi', 'traces.jsonl'), headers={'Range': f'bytes={a}-{b}'})
            cache.write_bytes(urllib.request.urlopen(req, timeout=300).read())
        raw = cache.read_bytes().split(b'\n')
        for ln in (raw[:-1] if a == 0 else raw[1:-1]):
            if any(p.encode() in ln[:60] for p in SEMI_PICK):
                d = json.loads(ln)
                if d['id'][:8] in SEMI_PICK: found[d['id'][:8]] = reduce_semi(d)
    missing = [p for p in SEMI_PICK if p not in found]
    if missing: sys.exit(f'missing semianalysis traces: {missing}')
    return [found[p] for p in SEMI_PICK]


# ---------- assemble ----------

SWARMS = [('wisp', 'df04f351-9677-4723-b621-7fb5a597caba'), ('fable', '602033e7-dc55-4b7f-909f-1c67135d8f4b'), ('fable', 'f956721a-0af7-4bdc-8678-3a493d8fcd39')]
SOLOS = [('wisp', '0a3c90e0-cd2d-41f9-80e2-f6de188257ae'), ('tc', 'da5d32d6-547f-45ae-a5b5-4747ed06542f'), ('tc', '39082932-131c-40a9-872d-1d3ac8ed1fd6'),
         ('fable', 'e3d0c93f-5cf8-4067-9a49-657ba5c67c80'), ('tc', '3be5ba0c-62b2-4645-8589-9216be0c10d8')]


def main():
    lists = {k: listing(k) for k in ('wisp', 'fable', 'tc')}
    deep = []
    for key, sid in SWARMS + SOLOS:
        files = lists[key]
        parent = next(p for p in files if p.endswith(sid + '.jsonl') and '/subagents/' not in p)
        subs = []
        if key == 'wisp':
            for p in files:
                if sid in p and '/subagents/' in p and p.endswith('.jsonl'):
                    wf = re.search(r'/(wf_[^/]+)/', p)
                    subs.append((fetch(key, p), wf.group(1)[:11] if wf else None))
        elif key == 'fable':
            for p in files:
                if re.match(r'^agent-[0-9a-f]+\.jsonl$', p):
                    fp = fetch(key, p)
                    with open(fp, encoding='utf8') as f:
                        first = json.loads(f.readline() or '{}')
                    if first.get('sessionId') == sid: subs.append((fp, None))
        sess = build_session(key, fetch(key, parent, f'{sid}.jsonl'), subs, sid)
        sess['license'] = REV[key][2]
        deep.append(sess)
        print(sid[:8], key, 'agents', len(sess['agents']), file=sys.stderr)
    out = {
        'v': 2, 'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),
        'sources': {k: {'repo': v[0], 'rev': v[1], 'license': v[2], 'url': 'https://huggingface.co/datasets/' + v[0]} for k, v in REV.items()},
        'deep': deep, 'fleet': build_fleet(), 'prod': build_prod(),
    }
    p = ROOT / 'public-swarms.json'
    p.write_text(json.dumps(out, separators=(',', ':'), ensure_ascii=False), encoding='utf8')
    print('wrote', p, p.stat().st_size, 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
