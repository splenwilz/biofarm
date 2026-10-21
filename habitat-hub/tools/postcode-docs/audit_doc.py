# Parses the finished Word document (word/document.xml) into bank sections and lists.
# Audit-side parser, deliberately independent of build_docx.py.
#   python3 audit_doc.py ../../Biofarm-habitat-bank-service-area-postcodes.docx
import re
import zipfile
from xml.etree import ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']
CODE = r'[A-Z]{1,2}\d{1,2}[A-Z]?'


def ptext(p):
    return ''.join(t.text or '' for t in p.iter(W + 't'))


def parse(path):
    body = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find('w:body', NS)
    items = []
    for el in body:
        if el.tag == W + 'p':
            items.append(('p', ptext(el)))
        elif el.tag == W + 'tbl':
            rows = []
            for tr in el.findall('w:tr', NS):
                rows.append([''.join(ptext(p) for p in tc.findall('w:p', NS)) for tc in tr.findall('w:tc', NS)])
            items.append(('tbl', rows))
    doc = {'title': None, 'intro': [], 'bullets': [], 'glance': None, 'banks': {}, 'sources': None}
    i = 0
    while not (items[i][0] == 'p' and items[i][1] == 'How to read the lists'):
        k, v = items[i]
        if k == 'tbl' and doc['title'] is None:
            doc['title'] = v[0][0]
        elif k == 'p' and v.strip() and doc['title'] is None:
            doc['title'] = v
        elif k == 'p' and v.strip():
            doc['intro'].append(v)
        i += 1
    i += 1
    while not (items[i][0] == 'p' and items[i][1] == 'At a glance'):
        k, v = items[i]
        if k == 'tbl':
            doc['bullets'] += [r[0] + ': ' + r[1] for r in v]
        elif v.strip():
            doc['bullets'].append(v)
        i += 1
    i += 1
    assert items[i][0] == 'tbl'
    doc['glance'] = items[i][1]
    i += 1
    bank = None; tier = None
    while i < len(items):
        k, v = items[i]
        if k == 'p' and not v.strip():
            i += 1; continue
        if k == 'p' and v == 'Sources':
            doc['sources'] = items[i + 1][1]; break
        if k == 'p' and items[i + 1][0] == 'tbl':   # bank heading followed by its table
            bank = v; doc['banks'][bank] = {'table': dict((r[0], r[1]) for r in items[i + 1][1]), 'tiers': {}, 'notes': {}}
            tier = None; i += 2; continue
        if k == 'p' and v.startswith('Full value'):
            tier = 'full'; doc['banks'][bank]['tiers'][tier] = {}; doc['banks'][bank]['notes'][tier] = []; i += 1; continue
        if k == 'p' and v.startswith('Catchment'):
            tier = 'catch'; doc['banks'][bank]['tiers'][tier] = {}; doc['banks'][bank]['notes'][tier] = []; i += 1; continue
        if k == 'p' and v.startswith('Note: '):
            doc['banks'][bank]['notes'][tier].append(v[6:]); i += 1; continue
        m = re.match(r'(Core districts|Partial|Fringe, not recommended) \((\d+)\)$', v) if k == 'p' else None
        if m:
            key = {'Core districts': 'core', 'Partial': 'partial', 'Fringe, not recommended': 'fringe'}[m.group(1)]
            doc['banks'][bank]['tiers'][tier][key] = {'n': int(m.group(2)), 'text': items[i + 1][1]}; i += 2; continue
        if k == 'p' and v == 'Non-geographic, do not target':
            doc['banks'][bank]['tiers'][tier]['nongeo'] = {'text': items[i + 1][1]}; i += 2; continue
        raise SystemExit(f'unexpected item at {i}: {k} {str(v)[:80]!r}')
    return doc


def codes(txt):
    if txt.strip() == 'none':
        return []
    out = []
    for part in re.split(r', (?=[A-Z]{1,2}\d)', txt):
        m = re.match(rf'({CODE})$', part.strip())
        if not m:
            raise SystemExit(f'bad code entry {part!r}')
        out.append(m.group(1))
    return out


def partials(txt):
    if txt.strip() == 'none':
        return []
    out = []
    for part in re.split(r', (?=[A-Z]{1,2}\d)', txt):
        m = re.match(rf'({CODE}) \((\d+)%(?:, \+(\d+)% catchment)?\)$', part.strip())
        if not m:
            raise SystemExit(f'bad partial entry {part!r}')
        out.append((m.group(1), int(m.group(2)), int(m.group(3)) if m.group(3) else None))
    return out


if __name__ == '__main__':
    import sys
    d = parse(sys.argv[1])
    for b, v in d['banks'].items():
        for t, tt in v['tiers'].items():
            print(b, t, {k: (len(codes(x['text'])) if k in ('core', 'fringe', 'nongeo') else len(partials(x['text']))) for k, x in tt.items()},
                  'declared', {k: x.get('n') for k, x in tt.items()})
    print('glance rows', len(d['glance']), '| intro', len(d['intro']), '| bullets', len(d['bullets']))
