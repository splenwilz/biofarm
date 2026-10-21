# Independent audit of the combined Word document against the fresh data in data/audit/ (audit_pull.py, audit_totals.py).
# Recomputes every bank's tiers and compares them with what the document says. Prints findings; "0 findings" means clean.
import collections
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import audit_doc as D  # noqa: E402
from shapely.geometry import Point, shape  # noqa: E402
from shapely.prepared import prep  # noqa: E402

A = os.path.join(HERE, 'data', 'audit')
DOCX = os.path.join(HERE, '..', '..', 'Biofarm-habitat-bank-service-area-postcodes.docx')
ORDER = ['Sleight Farm', 'Rycote Farm', 'Lesnewth', 'Avon Meadows', 'Badger Bank Farm', 'Slades Farm']
doc = D.parse(DOCX); der = json.load(open(f'{A}/derived.json', encoding='utf-8'))
TOTF = f'{A}/totals.json'; tot = json.load(open(TOTF, encoding='utf-8'))
RMF = os.path.join(HERE, 'data', 'royal-mail-nongeo-parsed.json')
# Royal Mail's July 2019 non-geographic list (poweredbypaf.com "Current non-geos"), parsed to {"nongeo": {district: [...]}}.
# Optional: without it the non-geographic check rests on the directory test alone and says so.
rm = json.load(open(RMF, encoding='utf-8')) if os.path.exists(RMF) else {'nongeo': {}}
PC = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/ONSPD_Online_latest_Postcode_Centroids/FeatureServer/0/query"
LADNAME = {'Bristol': 'Bristol, City of'}


def q(params):
    for t in range(5):
        try:
            data = urllib.parse.urlencode(params).encode(); j = json.load(urllib.request.urlopen(urllib.request.Request(PC, data=data), timeout=300))
            if 'error' in j:
                raise RuntimeError(j['error'])
            return j
        except Exception:
            if t == 4:
                raise
            time.sleep(3 * (t + 1))


def total(d):
    if d not in tot or tot[d] is None:
        tot[d] = q({'where': f"PCDS LIKE '{d} %' AND DOTERM IS NULL", 'returnCountOnly': 'true', 'f': 'json'})['count']; json.dump(tot, open(TOTF, 'w', encoding='utf-8'))
    return tot[d]


def whole_district(d):
    rows = []; off = 0
    while True:
        j = q({'where': f"PCDS LIKE '{d} %' AND DOTERM IS NULL", 'outFields': 'PCDS,USRTYPIND,LAD26CD', 'returnGeometry': 'true', 'outSR': '4326',
               'orderByFields': 'OBJECTID', 'resultOffset': off, 'resultRecordCount': 2000, 'f': 'json'})
        f = j.get('features', []); rows += f
        if not j.get('exceededTransferLimit') or not f:
            break
        off += len(f)
    large = sum(1 for x in rows if str(x['attributes'].get('USRTYPIND')) == '1')
    pts = {(round(x['geometry']['x'], 5), round(x['geometry']['y'], 5)) for x in rows if x.get('geometry')}
    return {'live': len(rows), 'large': large, 'small': len(rows) - large, 'points': len(pts)}


def cls(s): return 'core' if s >= 0.5 else ('partial' if s >= 0.10 else 'fringe')
def dkey(d): m = re.match(r'([A-Z]+)(\d+)([A-Z]?)', d); return (m.group(1), int(m.group(2)), m.group(3))
def norm(s): return re.sub(r'\s+', ' ', html.unescape(s).replace('&', 'and').lower()).strip()


findings = []; unconfirmed = []; summary = {}


def F(bank, sev, msg): findings.append((bank, sev, msg)); print(f'  [{sev}] {bank}: {msg}', flush=True)
def U(bank, msg): unconfirmed.append((bank, msg)); print(f'  [UNCONFIRMED] {bank}: {msg}', flush=True)


lad_cache = {}; nca_cache = {}


def lad_rows(code):
    if code not in lad_cache:
        lad_cache[code] = json.load(open(f'{A}/lad/{code}.json', encoding='utf-8'))['rows']
    return lad_cache[code]


def nca_rows(name):
    if name not in nca_cache:
        nca_cache[name] = json.load(open(f"{A}/nca/{name.replace('/', '_').replace(',', '')}.json", encoding='utf-8'))['rows']
    return nca_cache[name]


if not rm['nongeo']:
    U('document', 'Royal Mail non-geographic list not available (data/royal-mail-nongeo-parsed.json); the non-geographic check uses the directory test only')
glance = {r[0]: r[1:] for r in doc['glance'][1:]}
if [r[0] for r in doc['glance'][1:]] != ORDER:
    F('document', 'ERROR', f"at-a-glance bank order {[r[0] for r in doc['glance'][1:]]}")
if list(doc['banks']) != ORDER:
    F('document', 'ERROR', f"bank section order {list(doc['banks'])}")
ASSIGN_ALL = {}
for bank in ORDER:
    print(f'\n=== {bank}', flush=True)
    d = der['banks'][bank]; sec = doc['banks'][bank]; tbl = sec['table']
    L, Lname = d['host_lad'][0]; N = d['host_nca'][0]
    if len(d['host_lad']) != 1 or len(d['host_nca']) != 1:
        F(bank, 'ERROR', f"site point falls in {d['host_lad']} / {d['host_nca']}")
    # (1) host council / character area vs the register-derived values and the live page text
    if norm(Lname) not in norm(tbl['Local planning authority']):
        F(bank, 'ERROR', f"document LPA '{tbl['Local planning authority']}' vs ONS council for the registered grid ref '{Lname}'")
    if norm(N) != norm(tbl['National Character Area']):
        F(bank, 'ERROR', f"document NCA '{tbl['National Character Area']}' vs NE character area for the registered grid ref '{N}'")
    live_txt = norm(' '.join(d['live_lpa_text'] + d['live_nca_text']))
    if norm(tbl['Local planning authority']) not in live_txt:
        F(bank, 'ERROR', f"document LPA '{tbl['Local planning authority']}' not found in live page text")
    if norm(tbl['National Character Area']) not in live_txt:
        F(bank, 'ERROR', f"document NCA '{tbl['National Character Area']}' not found in live page text")
    if glance[bank][0] != tbl['Site postcode'] or norm(glance[bank][1]) != norm(tbl['Local planning authority']) or norm(glance[bank][2]) != norm(tbl['National Character Area']):
        F(bank, 'ERROR', 'at-a-glance row disagrees with bank table')
    # (2) neighbouring councils / character areas vs adjacency from the boundary layers, and live-polygon coverage
    adj_l = {n for _, n in d['adjacent_lads']}; adj_n = set(d['adjacent_ncas'])
    doc_l = {LADNAME.get(x.strip(), x.strip()) for x in tbl['Neighbouring councils'].split(', ')}
    if doc_l != adj_l:
        F(bank, 'ERROR', f"neighbouring councils: document {sorted(doc_l)} vs adjacency {sorted(adj_l)}")
    rest = tbl['Neighbouring character areas']
    for nm in sorted(adj_n, key=len, reverse=True):
        if nm not in rest:
            F(bank, 'ERROR', f"neighbouring character area '{nm}' (adjacent to {N}) missing from document")
        rest = rest.replace(nm, '')
    if re.sub(r'[,\s]', '', rest):
        F(bank, 'ERROR', f"document lists character areas not adjacent to {N}: '{rest.strip(', ')}'")
    cov = d['coverage']
    if cov['hatched_not_in_expected'] > 0.01 or cov['expected_not_in_hatched_or_solid'] > 0.01:
        F(bank, 'WARN', f"live hatched polygon vs adjacent councils+character areas differ by more than 1% of area: {cov}")
    if cov['solid_not_in_host'] > 0.01 or cov['host_not_in_solid'] > 0.01:
        F(bank, 'WARN', f"live solid polygon vs own council+character area differ by more than 1% of area: {cov}")
    print(f"  adjacency ok: {len(adj_l)} councils, {len(adj_n)} character areas; coverage {cov}")
    # (3) recompute postcode sets from the fresh pulls
    info = {}

    def add(rows):
        for r in rows:
            if r['pcds'] not in info:
                info[r['pcds']] = {'lon': r['lon'], 'lat': r['lat'], 'usr': str(r['usr']), 'np': r['np'] or '', 'lad': r['lad']}
    host = lad_rows(L); hostnca = nca_rows(N)
    full = {r['pcds'] for r in host if not str(r['np'] or '').startswith('E26')} | {r['pcds'] for r in hostnca}
    add(host); add(hostnca)
    adjset = set()
    for code, _ in d['adjacent_lads']:
        rows = lad_rows(code); adjset |= {r['pcds'] for r in rows}; add(rows)
    for nm in d['adjacent_ncas']:
        rows = nca_rows(nm); adjset |= {r['pcds'] for r in rows}; add(rows)
    nbr = adjset - full
    cnt_f = collections.Counter(p.split()[0] for p in full); cnt_c = collections.Counter(p.split()[0] for p in nbr)
    srm = json.load(open(f"{A}/live/{d['slug']}-srm.json", encoding='utf-8')); hat = prep(shape(srm['neighbouring']).buffer(0)); loc = prep(shape(srm['local']).buffer(0))
    hh = collections.Counter(); ht = collections.Counter(); lh = collections.Counter(); lt = collections.Counter()
    for p in nbr:
        i = info[p]
        if i['lon'] is None:
            continue
        dd = p.split()[0]; ht[dd] += 1
        if hat.contains(Point(i['lon'], i['lat'])):
            hh[dd] += 1
    for p in full:
        i = info[p]
        if i['lon'] is None:
            continue
        dd = p.split()[0]; lt[dd] += 1
        if loc.contains(Point(i['lon'], i['lat'])):
            lh[dd] += 1
    H = sum(hh.values()); HT = sum(ht.values()); LH = sum(lh.values()); LT = sum(lt.values())
    print(f"  recomputed: full {len(full):,} live postcodes, catchment {len(nbr):,}; in live hatched {H:,}/{HT:,} ({100 * H / HT:.1f}%), full in live solid {LH:,}/{LT:,} ({100 * LH / LT:.1f}%)")
    if H / HT < 0.98:
        F(bank, 'WARN', f"only {100 * H / HT:.1f}% of recomputed catchment postcodes fall inside the live hatched polygon")
    if LH / LT < 0.98:
        F(bank, 'WARN', f"only {100 * LH / LT:.1f}% of recomputed full-value postcodes fall inside the live solid polygon")
    # (4) tier assignment and classes (same rule as combined_data.assign, re-implemented here)
    assign = {}
    for dd in set(cnt_f) | set(cnt_c):
        t = total(dd); sf = cnt_f[dd] / t; sc = cnt_c[dd] / t
        if sf >= 0.10:
            tier, share, other = 'full', sf, sc
        elif sc >= 0.10:
            tier, share, other = 'catch', sc, sf
        else:
            tier, share, other = ('full', sf, sc) if sf >= sc else ('catch', sc, sf)
        assign[dd] = {'tier': tier, 'cls': cls(share), 'share': share, 'other': other, 'nf': cnt_f[dd], 'nc': cnt_c[dd], 'total': t}
    ASSIGN_ALL[bank] = assign
    # (5) non-geographic: candidates = document's lists + all-large-user districts on <=7 points + Royal Mail list
    doc_ng = set()
    for t in ('full', 'catch'):
        if 'nongeo' in sec['tiers'][t]:
            doc_ng |= set(D.codes(sec['tiers'][t]['nongeo']['text']))
    cand = set(doc_ng)
    pts = collections.defaultdict(set); large = collections.Counter(); anyc = collections.Counter()
    for p in full | nbr:
        i = info[p]; dd = p.split()[0]; anyc[dd] += 1
        if i['usr'] == '1':
            large[dd] += 1
        if i['lon'] is not None:
            pts[dd].add((round(i['lon'], 5), round(i['lat'], 5)))
    for dd in assign:
        if (large[dd] == anyc[dd] and len(pts[dd]) <= 7) or dd in rm['nongeo']:
            cand.add(dd)
    NGF = f'{A}/nongeo-check.json'; ngc = json.load(open(NGF, encoding='utf-8')) if os.path.exists(NGF) else {}
    ng_ok = set(); ng_weak = set()
    for dd in sorted(cand):
        if dd not in ngc:
            ngc[dd] = whole_district(dd); json.dump(ngc, open(NGF, 'w', encoding='utf-8'), indent=1)
        w = ngc[dd]
        if w['small'] == 0 and w['points'] <= 7:
            ng_ok.add(dd)
        elif w['small'] == 0 and (dd in rm['nongeo'] or dd in {'CR9', 'NG90'}):
            ng_weak.add(dd)
    for dd in sorted(doc_ng - ng_ok - ng_weak):
        w = ngc[dd]; F(bank, 'ERROR', f"{dd} listed as non-geographic but whole-district pull shows {w['live']} live, {w['small']} small-user, {w['points']} points, Royal Mail list {dd in rm['nongeo']}")
    for dd in sorted(doc_ng & ng_weak):
        U(bank, f"{dd} is listed as non-geographic on the Royal Mail list plus all-large-user coding ({ngc[dd]['live']} live, {ngc[dd]['points']} grid points); it fails the seven-point test")
    for dd in sorted((ng_ok | ng_weak) - doc_ng):
        if dd in assign:
            F(bank, 'ERROR', f"{dd} meets the non-geographic test ({ngc[dd]}) but is not in the document's non-geographic list")
    exp_ng = ng_ok | ng_weak
    # (6) compare lists per tier
    for tier in ('full', 'catch'):
        tt = sec['tiers'].get(tier)
        if not tt:
            F(bank, 'ERROR', f'no {tier} section'); continue
        dc = D.codes(tt['core']['text']); dp = D.partials(tt['partial']['text']); df = D.codes(tt['fringe']['text']); dn = D.codes(tt['nongeo']['text']) if 'nongeo' in tt else []
        for k, lst in (('core', dc), ('partial', dp), ('fringe', df)):
            if tt[k]['n'] != len(lst):
                F(bank, 'ERROR', f"{tier} {k}: heading says ({tt[k]['n']}) but list has {len(lst)}")
        docset = set(dc) | {p[0] for p in dp} | set(df) | set(dn)
        if len(docset) != len(dc) + len(dp) + len(df) + len(dn):
            F(bank, 'ERROR', f'{tier}: a district appears twice within the tier')
        exp = {dd for dd, v in assign.items() if v['tier'] == tier}
        ec = sorted(dd for dd in exp if assign[dd]['cls'] == 'core' and dd not in exp_ng)
        ep = sorted((dd for dd in exp if assign[dd]['cls'] == 'partial' and dd not in exp_ng), key=lambda x: -assign[x]['share'])
        ef = sorted(dd for dd in exp if assign[dd]['cls'] == 'fringe' and dd not in exp_ng); en = sorted(dd for dd in exp if dd in exp_ng)
        for k, have, want in (('core', set(dc), set(ec)), ('partial', {p[0] for p in dp}, set(ep)), ('fringe', set(df), set(ef)), ('nongeo', set(dn), set(en))):
            for dd in sorted(have - want):
                v = assign.get(dd)
                where = 'nowhere' if not v else f"in {v['tier']} as {v['cls']} ({v['nf']} full, {v['nc']} catchment of {v['total']})"
                F(bank, 'ERROR', f"{tier} {k}: document has {dd}; recomputation puts it {where}")
            for dd in sorted(want - have):
                v = assign[dd]; F(bank, 'ERROR', f"{tier} {k}: document lacks {dd}; recomputation {v['tier']} {v['cls']} ({v['nf']} full, {v['nc']} catchment of {v['total']})")
        for dd, pc_, oth in dp:
            v = assign.get(dd)
            if not v:
                continue
            if round(v['share'] * 100) != pc_:
                F(bank, 'ERROR', f"{tier} partial {dd}: document {pc_}% vs recomputed {round(v['share'] * 100)}% ({v['nf'] if tier == 'full' else v['nc']} of {v['total']})")
            want_oth = round(v['other'] * 100) if (tier == 'full' and v['other'] >= 0.10) else None
            if oth != want_oth:
                F(bank, 'ERROR', f"{tier} partial {dd}: catchment annotation document {oth} vs recomputed {want_oth}")
        if sorted(dc, key=dkey) != dc:
            F(bank, 'WARN', f'{tier} core list not in district order')
        if [p[0] for p in dp] != [p[0] for p in sorted(dp, key=lambda p: -p[1])]:
            F(bank, 'WARN', f'{tier} partial list not in descending share order')
        summary[(bank, tier)] = {'doc': {'core': len(dc), 'partial': len(dp), 'fringe': len(df), 'nongeo': len(dn)}, 'recomputed': {'core': len(ec), 'partial': len(ep), 'fringe': len(ef), 'nongeo': len(en)}}
        print(f"  {tier}: document core {len(dc)} partial {len(dp)} fringe {len(df)} non-geo {len(dn)} | recomputed core {len(ec)} partial {len(ep)} fringe {len(ef)} non-geo {len(en)}")
        gl = int(glance[bank][3 if tier == 'full' else 4])
        if gl != len(dc):
            F(bank, 'ERROR', f'at-a-glance {tier} core {gl} vs section {len(dc)}')
    ft = sec['tiers']['full']; ct = sec['tiers']['catch']

    def allcodes(tt):
        return (set(D.codes(tt['core']['text'])) | {p[0] for p in D.partials(tt['partial']['text'])} | set(D.codes(tt['fringe']['text']))
                | (set(D.codes(tt['nongeo']['text'])) if 'nongeo' in tt else set()))
    ov = allcodes(ft) & allcodes(ct)
    if ov:
        F(bank, 'ERROR', f'districts in both tiers: {sorted(ov)}')
    weak = [(dd, hh[dd], ht[dd]) for dd in ht if ht[dd] >= 20 and hh[dd] / ht[dd] < 0.9 and assign.get(dd, {}).get('tier') == 'catch' and assign[dd]['cls'] != 'fringe']
    if weak:
        U(bank, f"catchment districts where fewer than 90% of postcodes sit inside the live hatched polygon (web polygon is simplified): {weak}")
# cross-bank "already full value at another bank" notes
for bank in ORDER:
    sec = doc['banks'][bank]; notes = sec['notes'].get('catch', []); note = [n for n in notes if n.startswith('Already full value at another Biofarm bank')]
    ngs = set()
    for t in ('full', 'catch'):
        if 'nongeo' in sec['tiers'][t]:
            ngs |= set(D.codes(sec['tiers'][t]['nongeo']['text']))
    exp = {}
    a = ASSIGN_ALL[bank]
    for dd, v in a.items():
        if v['tier'] == 'catch' and v['cls'] in ('core', 'partial') and dd not in ngs:
            for ob in ORDER:
                if ob != bank and ASSIGN_ALL[ob].get(dd, {}).get('tier') == 'full' and ASSIGN_ALL[ob][dd]['cls'] == 'core':
                    exp.setdefault(ob, set()).add(dd)
    got = {}
    if note:
        body = note[0].split(': ', 1)[1].rstrip('.')
        for part in body.split('; '):
            ob, lst = part.split(': ', 1); got[ob] = set(lst.split(', '))
    if {k: v for k, v in exp.items() if v} != got:
        F(bank, 'ERROR', f"'already full value at another bank' note: document {got} vs recomputed {exp}")
print('\n==== SUMMARY: %d findings, %d unconfirmed' % (len(findings), len(unconfirmed)))
json.dump({'findings': findings, 'unconfirmed': unconfirmed, 'summary': {f'{b}|{t}': v for (b, t), v in summary.items()}, 'derived_at': der['pulled_at']}, open(f'{A}/report.json', 'w', encoding='utf-8'), indent=1)
sys.exit(1 if findings else 0)
