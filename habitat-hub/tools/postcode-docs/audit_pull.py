# Independent audit pull for the combined service-area document. Fresh data only, into data/audit/.
# Shares no code or cached data with the build.
#   python3 -P audit_pull.py            reuse data/audit/derived.json (live pages, register, adjacency) if present
#   python3 -P audit_pull.py --fresh    redo those too
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, 'data', 'audit')
for _d in ('live', 'lad', 'nca'):
    os.makedirs(os.path.join(A, _d), exist_ok=True)
LOG = open(f'{A}/pull.log', 'a', encoding='utf-8')


def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); LOG.write(s + '\n'); LOG.flush()


def get(url, data=None, tries=5, timeout=300):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0 (audit script)'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            if t == tries - 1:
                raise
            time.sleep(4 * (t + 1))


def q(url, params, tries=10):
    # ArcGIS Online answers an intermittent HTTP 200 + {"error": {"code": 400, ...}} under load; retry those too.
    for t in range(tries):
        j = json.loads(get(url, urllib.parse.urlencode(params).encode(), tries))
        if 'error' not in j:
            return j
        if t == tries - 1:
            raise RuntimeError(str(j['error'])[:300])
        log('  ArcGIS error, retry', t + 1, url.split('/services/')[-1][:60], str(j['error'])[:120])
        time.sleep(10 * (t + 1))


ONS = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/"
LAD_BFC = ONS + "Local_Authority_Districts_May_2026_Boundaries_UK_BFC/FeatureServer/0/query"
LAD_BGC = ONS + "Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0/query"
NCA = "https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Character_Areas_England/FeatureServer/0/query"
PC = ONS + "ONSPD_Online_latest_Postcode_Centroids/FeatureServer/0/query"
PCMETA = ONS + "ONSPD_Online_latest_Postcode_Centroids/FeatureServer/0?f=json"
BANKS = [('Sleight Farm', 'sleight-farm', 'BGS-281124001'), ('Rycote Farm', 'rycote-farm', 'BGS-150725001'),
         ('Lesnewth', 'lesnewth', 'BGS-221025001'), ('Avon Meadows', 'avon-meadows', 'BGS-171125001'),
         ('Badger Bank Farm', 'badger-bank-farm', 'BGS-060526001'), ('Slades Farm', 'slades-farm', 'BGS-060325001')]
FIELDS = 'PCDS,LAD26CD,NPARK16CD,USRTYPIND,DOTERM'


def osgb(ref):
    """OS grid reference (letters + 6/8/10 digits) -> easting, northing of the square's centre, precision in m."""
    ref = ref.replace(' ', '').upper(); l1 = ord(ref[0]) - 65; l2 = ord(ref[1]) - 65
    if l1 > 7: l1 -= 1
    if l2 > 7: l2 -= 1
    e100 = ((l1 - 2) % 5) * 5 + (l2 % 5); n100 = (19 - (l1 // 5) * 5) - (l2 // 5)
    d = ref[2:]; n = len(d) // 2; f = 10 ** (5 - n)
    return e100 * 100000 + int(d[:n]) * f + f / 2, n100 * 100000 + int(d[n:]) * f + f / 2, f


def area_scaled(g):
    if g.is_empty:
        return 0.0
    return g.area * math.cos(math.radians(g.centroid.y))


meta = json.loads(get(PCMETA))
log('centroid layer:', meta.get('name'), '| maxRecordCount', meta.get('maxRecordCount'), '| editing info:', meta.get('editingInfo'))
MAXREC = min(2000, meta.get('maxRecordCount', 2000))
REUSE = os.path.exists(f'{A}/derived.json') and '--fresh' not in sys.argv
derived = json.load(open(f'{A}/derived.json', encoding='utf-8')) if REUSE else {
    'pulled_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    'centroid_layer_meta': {'name': meta.get('name'), 'editingInfo': meta.get('editingInfo')}, 'banks': {}}


def fetch_all(url, params):
    feats = []; off = 0
    while True:
        p = dict(params); p.update({'resultOffset': off, 'resultRecordCount': MAXREC}); j = q(url, p); f = j.get('features', []); feats += f
        if not j.get('exceededTransferLimit') or not f:
            break
        off += len(f)
    return feats


# ---- 1. live pages, register, host council and character area from the grid reference
for bank, slug, ref in ([] if REUSE else BANKS):
    html = get(f'https://www.biofarm.co.uk/habitat-banks-lists/{slug}').decode('utf-8', 'replace')
    open(f'{A}/live/{slug}.html', 'w', encoding='utf-8').write(html)
    m = re.search(r'([A-Z_]+_SRM)\s*=\s*', html); i = m.end(); depth = 0; j = i
    while True:
        c = html[j]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                j += 1; break
        j += 1
    srm = json.loads(html[i:j]); json.dump(srm, open(f'{A}/live/{slug}-srm.json', 'w', encoding='utf-8'))
    text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html))
    lpa_txt = [text[max(0, m.start() - 40):m.end() + 90] for m in re.finditer(r'Local [Pp]lanning [Aa]uthority', text)][:4]
    nca_txt = [text[max(0, m.start() - 40):m.end() + 90] for m in re.finditer(r'National Character Area', text)][:4]
    reg = json.loads(get(f'https://environment.data.gov.uk/bng/api/search/{ref}')); json.dump(reg, open(f'{A}/live/{ref}.json', 'w', encoding='utf-8'), indent=1)
    rtxt = json.dumps(reg)
    grid = re.search(r'"gridReference"\s*:\s*"([A-Z]{2}\s?\d{4,10})"', rtxt) or re.search(r'\b([A-Z]{2}\d{6,10})\b', rtxt)
    grid = grid.group(1).replace(' ', ''); e, n, prec = osgb(grid)
    pt = {'x': e, 'y': n, 'spatialReference': {'wkid': 27700}}
    hl = q(LAD_BFC, {'geometry': json.dumps(pt), 'geometryType': 'esriGeometryPoint', 'inSR': '27700', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'LAD26CD,LAD26NM', 'returnGeometry': 'false', 'f': 'json'})['features']
    hn = q(NCA, {'geometry': json.dumps(pt), 'geometryType': 'esriGeometryPoint', 'inSR': '27700', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'NCA_Name,NAID', 'returnGeometry': 'false', 'f': 'json'})['features']
    derived['banks'][bank] = {'slug': slug, 'ref': ref, 'grid': grid, 'grid_precision_m': prec, 'east': e, 'north': n,
                              'host_lad': [(f['attributes']['LAD26CD'], f['attributes']['LAD26NM']) for f in hl],
                              'host_nca': [f['attributes']['NCA_Name'] for f in hn], 'live_lpa_text': lpa_txt, 'live_nca_text': nca_txt}
    log(bank, '| grid', grid, '| host LAD', derived['banks'][bank]['host_lad'], '| host NCA', derived['banks'][bank]['host_nca'])

# ---- 2. neighbouring councils / character areas by adjacency, then coverage against the live polygons
for bank, slug, ref in ([] if REUSE else BANKS):
    d = derived['banks'][bank]; L = d['host_lad'][0][0]; N = d['host_nca'][0]
    srm = json.load(open(f'{A}/live/{slug}-srm.json', encoding='utf-8')); hat = shape(srm['neighbouring']).buffer(0); loc = shape(srm['local']).buffer(0); both = hat.union(loc)
    adjl = None
    for layer in (LAD_BFC, LAD_BGC):
        try:
            hg = q(layer, {'where': f"LAD26CD='{L}'", 'outFields': 'LAD26CD', 'returnGeometry': 'true', 'outSR': '27700', 'f': 'json'})['features'][0]['geometry']
            adjl = q(LAD_BFC, {'geometry': json.dumps(hg), 'geometryType': 'esriGeometryPolygon', 'inSR': '27700', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'LAD26CD,LAD26NM', 'returnGeometry': 'false', 'f': 'json'})['features']
            break
        except RuntimeError as exc:
            log(bank, '| adjacency query with', 'full-resolution' if layer is LAD_BFC else 'generalised', 'council polygon failed:', str(exc)[:120])
    if adjl is None:
        raise SystemExit(f'{bank}: adjacency query failed on both council layers')
    adj_lads = sorted([(f['attributes']['LAD26CD'], f['attributes']['LAD26NM']) for f in adjl if f['attributes']['LAD26CD'] != L])
    ng = q(NCA, {'where': "NCA_Name='" + N.replace("'", "''") + "'", 'outFields': 'NCA_Name', 'returnGeometry': 'true', 'outSR': '27700', 'f': 'json'})['features'][0]['geometry']
    adjn = q(NCA, {'geometry': json.dumps(ng), 'geometryType': 'esriGeometryPolygon', 'inSR': '27700', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'NCA_Name,NAID', 'returnGeometry': 'false', 'f': 'json'})['features']
    adj_ncas = sorted([f['attributes']['NCA_Name'] for f in adjn if f['attributes']['NCA_Name'] != N])
    geoms = []
    for code, _ in adj_lads:
        g = q(LAD_BGC, {'where': f"LAD26CD='{code}'", 'outFields': 'LAD26CD', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})['features'][0]['geometry']; geoms.append(shape(g).buffer(0))
    for nm in adj_ncas:
        g = q(NCA, {'where': "NCA_Name='" + nm.replace("'", "''") + "'", 'outFields': 'NCA_Name', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})['features'][0]['geometry']; geoms.append(shape(g).buffer(0))
    adj_union = unary_union(geoms).buffer(0)
    hl = shape(q(LAD_BGC, {'where': f"LAD26CD='{L}'", 'outFields': 'LAD26CD', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})['features'][0]['geometry']).buffer(0)
    hn = shape(q(NCA, {'where': "NCA_Name='" + N.replace("'", "''") + "'", 'outFields': 'NCA_Name', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})['features'][0]['geometry']).buffer(0)
    host_union = hl.union(hn).buffer(0); exp_h = adj_union.difference(host_union)
    cov = {'hatched_not_in_expected': round(area_scaled(hat.difference(adj_union.union(host_union))) / area_scaled(hat), 4),
           'expected_not_in_hatched_or_solid': round(area_scaled(exp_h.difference(both)) / area_scaled(exp_h), 4),
           'solid_not_in_host': round(area_scaled(loc.difference(host_union)) / area_scaled(loc), 4),
           'host_not_in_solid': round(area_scaled(host_union.difference(loc)) / area_scaled(host_union), 4)}
    d.update({'adjacent_lads': adj_lads, 'adjacent_ncas': adj_ncas, 'coverage': cov})
    log(bank, '| adjacent councils', [n for _, n in adj_lads]); log(bank, '| adjacent NCAs', adj_ncas); log(bank, '| coverage', cov)
if not REUSE:
    json.dump(derived, open(f'{A}/derived.json', 'w', encoding='utf-8'), indent=1)
log('derived.json', 'reused' if REUSE else 'rebuilt')

# ---- 3. postcode pulls from the centroid layer
lad_codes = set(); nca_names = set()
for bank, d in derived['banks'].items():
    lad_codes |= {c for c, _ in d['host_lad']} | {c for c, _ in d['adjacent_lads']}
    nca_names |= set(d['host_nca']) | set(d['adjacent_ncas'])
log('to pull:', len(lad_codes), 'councils,', len(nca_names), 'character areas')


def pull_lad(code):
    fn = f'{A}/lad/{code}.json'
    if os.path.exists(fn):
        return
    t0 = time.time(); feats = []; last = -1
    while True:   # keyed paging on OBJECTID (deep resultOffset paging returns HTTP 400 on large councils)
        j = q(PC, {'where': f"LAD26CD='{code}' AND DOTERM IS NULL AND OBJECTID>{last}", 'outFields': FIELDS + ',OBJECTID', 'returnGeometry': 'true',
                   'outSR': '4326', 'orderByFields': 'OBJECTID', 'resultRecordCount': MAXREC, 'f': 'json'})
        f = j.get('features', []); feats += f
        if len(f) < MAXREC:
            break
        last = f[-1]['attributes']['OBJECTID']
    rows = [{'pcds': f['attributes']['PCDS'], 'lad': f['attributes']['LAD26CD'], 'np': f['attributes'].get('NPARK16CD'), 'usr': f['attributes'].get('USRTYPIND'),
             'lon': (f.get('geometry') or {}).get('x'), 'lat': (f.get('geometry') or {}).get('y')} for f in feats]
    json.dump({'code': code, 'count': len(rows), 'rows': rows}, open(fn, 'w', encoding='utf-8')); log('LAD', code, len(rows), f'{time.time() - t0:.0f}s')


BBOX_CHECK = {'Mendip Hills', 'Hensbarrow', 'Teme Valley'}   # small areas: full bounding-box scan + local point-in-polygon, to test the server filter for misses


def pull_nca(name):
    fn = f"{A}/nca/{name.replace('/', '_').replace(',', '')}.json"
    if os.path.exists(fn):
        return
    t0 = time.time()
    g = q(NCA, {'where': "NCA_Name='" + name.replace("'", "''") + "'", 'outFields': 'NCA_Name,NAID', 'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson'})
    assert len(g['features']) == 1, (name, len(g['features']))
    poly = shape(g['features'][0]['geometry']).buffer(0); pp = prep(poly)
    rings = [list(map(list, r.coords)) for pg in (poly.geoms if hasattr(poly, 'geoms') else [poly]) for r in [pg.exterior] + list(pg.interiors)]
    feats = fetch_all(PC, {'geometry': json.dumps({'rings': rings, 'spatialReference': {'wkid': 4326}}), 'geometryType': 'esriGeometryPolygon', 'inSR': '4326',
                           'spatialRel': 'esriSpatialRelIntersects', 'where': 'DOTERM IS NULL', 'outFields': FIELDS, 'returnGeometry': 'true', 'outSR': '4326', 'orderByFields': 'OBJECTID', 'f': 'json'})
    rows = []; outside = 0
    for x in feats:
        gm = x.get('geometry') or {}
        if gm.get('x') is None:
            continue
        a = x['attributes']; row = {'pcds': a['PCDS'], 'lad': a['LAD26CD'], 'np': a.get('NPARK16CD'), 'usr': a.get('USRTYPIND'), 'lon': gm['x'], 'lat': gm['y']}
        if pp.contains(Point(gm['x'], gm['y'])) or poly.distance(Point(gm['x'], gm['y'])) < 1e-7:
            rows.append(row)
        else:
            outside += 1
    extra = {}
    if name in BBOX_CHECK:
        b = poly.bounds; env = {'xmin': b[0], 'ymin': b[1], 'xmax': b[2], 'ymax': b[3], 'spatialReference': {'wkid': 4326}}
        bb = fetch_all(PC, {'geometry': json.dumps(env), 'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects', 'where': 'DOTERM IS NULL',
                            'outFields': 'PCDS', 'returnGeometry': 'true', 'outSR': '4326', 'orderByFields': 'OBJECTID', 'f': 'json'})
        inside = {x['attributes']['PCDS'] for x in bb if x.get('geometry') and pp.contains(Point(x['geometry']['x'], x['geometry']['y']))}
        got = {r['pcds'] for r in rows}
        extra = {'bbox_scanned': len(bb), 'bbox_inside': len(inside), 'missed_by_server_filter': sorted(inside - got)[:20], 'n_missed': len(inside - got), 'n_extra': len(got - inside)}
    json.dump({'name': name, 'count': len(rows), 'server_returned': len(feats), 'rejected_by_local_pip': outside, 'bbox_check': extra, 'rows': rows}, open(fn, 'w', encoding='utf-8'))
    log('NCA', name, len(rows), 'inside;', outside, 'rejected by local test;', f'{time.time() - t0:.0f}s', ('BBOX CHECK ' + json.dumps(extra)) if extra else '')


with ThreadPoolExecutor(int(os.environ.get('PULL_WORKERS', '4'))) as ex:
    futs = [ex.submit(pull_lad, c) for c in sorted(lad_codes)] + [ex.submit(pull_nca, n) for n in sorted(nca_names)]
    for f in futs:
        f.result()
log('PULLS DONE')
