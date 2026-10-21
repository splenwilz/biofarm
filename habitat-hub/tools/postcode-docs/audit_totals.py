# National live-postcode totals per district, one grouped query per initial letter, from the ONSPD
# centroid layer (audit source) and the August 2026 hosted table (vintage comparison). Writes
# data/audit/totals.json (+ totals-<layer>.json and totals-diff.json).
import json
import os
import string
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, 'data', 'audit'); os.makedirs(A, exist_ok=True)
ONS = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/"
LAYERS = {'centroid': (ONS + "ONSPD_Online_latest_Postcode_Centroids/FeatureServer/0/query", 'PCD7', 'DOTERM IS NULL'),
          'hosted': (ONS + "ONS_Postcode_Directory_(August_2026)_(Hosted_Table)/FeatureServer/0/query", 'pcd7', 'doterm IS NULL')}


def grouped(layer, letter):
    url, fld, where = LAYERS[layer]
    for t in range(5):
        try:
            p = {'where': f"{where} AND {fld} LIKE '{letter}%'", 'groupByFieldsForStatistics': f"CAST(SUBSTRING({fld},1,4) AS VARCHAR(4))",
                 'outStatistics': json.dumps([{'statisticType': 'count', 'onStatisticField': fld, 'outStatisticFieldName': 'n'}]), 'f': 'json'}
            j = json.load(urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode(p).encode()), timeout=300))
            if 'error' in j:
                raise RuntimeError(json.dumps(j['error'])[:200])
            f = j['features']; assert not j.get('exceededTransferLimit'), (layer, letter, len(f))
            return letter, {x['attributes']['EXPR_1'].strip(): x['attributes']['n'] for x in f}
        except Exception as e:
            print('retry', layer, letter, str(e)[:120], flush=True)
            if t == 4:
                raise
            time.sleep(5 * (t + 1))


out = {}
for layer in LAYERS:
    tot = {}
    with ThreadPoolExecutor(4) as ex:
        for letter, d in ex.map(lambda L: grouped(layer, L), string.ascii_uppercase):
            tot.update(d); print(layer, letter, len(d), flush=True)
    out[layer] = tot; json.dump(tot, open(os.path.join(A, f'totals-{layer}.json'), 'w', encoding='utf-8'))
    print(layer, 'districts', len(tot), flush=True)
json.dump(out['centroid'], open(os.path.join(A, 'totals.json'), 'w', encoding='utf-8'))
diff = {d: (out['centroid'].get(d), out['hosted'].get(d)) for d in set(out['centroid']) | set(out['hosted']) if out['centroid'].get(d) != out['hosted'].get(d)}
json.dump(diff, open(os.path.join(A, 'totals-diff.json'), 'w', encoding='utf-8'), indent=1)
print('TOTALS DONE; districts differing between centroid layer and Aug 2026 hosted table:', len(diff), list(diff.items())[:10], flush=True)
