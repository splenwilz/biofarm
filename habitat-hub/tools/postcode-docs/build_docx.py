# Builds habitat-hub/Biofarm-habitat-bank-service-area-postcodes.docx from combined_data.py.
# Own OOXML package (no template). Arial, white page, dark green headings, green table
# header with white text, pale green label cells, 1.33 line spacing, one bank per page.
#   python3 build_docx.py [output.docx]            full document
#   PREVIEW_BANK="Avon Meadows" python3 build_docx.py out.docx   one bank, no cover (for Quick Look)
import os
import sys
import zipfile
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import combined_data as C  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(C.HUB, "Biofarm-habitat-bank-service-area-postcodes.docx")
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
FONT = "Arial"; TEXTW = 9026
GREEN = "2E5E3A"; PALE = "EEF4EF"; LINE = "C8D6CB"; GREY = "666666"
LADNAME = {"Bristol, City of": "Bristol"}


def rpr(sz, bold=False, italic=False, color="000000"):
    return (f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}" w:eastAsia="{FONT}"/>'
            + ('<w:b/><w:bCs/>' if bold else '') + ('<w:i/><w:iCs/>' if italic else '')
            + f'<w:color w:val="{color}"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr>')


def run(t, sz=22, bold=False, italic=False, color="000000"):
    return '<w:r>' + rpr(sz, bold, italic, color) + f'<w:t xml:space="preserve">{escape(t)}</w:t></w:r>'


def p(runs, ppr=''):
    return f'<w:p><w:pPr>{ppr}</w:pPr>{"".join(runs)}</w:p>'


def sp(after=160, before=0, line=320):
    return f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>'


RULE = f'<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="{LINE}"/></w:pBdr>'


def title(t): return p([run(t, 36, True, color=GREEN)], sp(120, 0, 276))
def subtitle(t): return p([run(t, 22, color=GREY)], RULE + sp(360, 0, 300))
def body(t, justify=True): return p([run(t, 22)], ('<w:jc w:val="both"/>' if justify else '') + sp(200))
def h2(t): return p([run(t, 28, True, color=GREEN)], sp(160, 360, 276) + '<w:keepNext/>')
def h1(t): return p([run(t, 34, True, color=GREEN)], '<w:pageBreakBefore/>' + RULE + sp(280, 0, 276) + '<w:keepNext/>')
def tier(t, desc): return p([run(t, 26, True, color=GREEN), run('  –  ' + desc, 22, color=GREY)], RULE + sp(200, 400, 300) + '<w:keepNext/>')
def label(t): return p([run(t, 22, True, color=GREEN)], sp(80, 220) + '<w:keepNext/>')
def plain(t): return p([run(t, 22)], sp(160, 0, 320))
def bullet(lab, t): return p([run(lab, 22, True), run(t, 22)], '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="567" w:hanging="283"/><w:jc w:val="both"/>' + sp(120, 0, 300))
def note(t): return p([run('Note: ', 21, True, True, GREY), run(t, 21, italic=True, color=GREY)], '<w:ind w:left="567"/><w:jc w:val="both"/>' + sp(200, 120, 300))


BORD = '<w:tcBorders>' + ''.join(f'<w:{s} w:val="single" w:sz="6" w:space="0" w:color="{LINE}"/>' for s in ('top', 'left', 'bottom', 'right')) + '</w:tcBorders>'
MAR = '<w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>'


def tc(w, text, bold=False, fill=None, white=False):
    shd = f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>' if fill else ''
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{BORD}{shd}{MAR}<w:vAlign w:val="top"/></w:tcPr>'
            f'<w:p><w:pPr>{sp(0, 0, 276)}</w:pPr>{run(text, 20, bold, color=("FFFFFF" if white else "000000"))}</w:p></w:tc>')


def table(widths, header, rows):
    pr = (f'<w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'
          + ''.join(f'<w:{s} w:val="single" w:sz="6" w:space="0" w:color="{LINE}"/>' for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
          + '</w:tblBorders></w:tblPr>')
    grid = '<w:tblGrid>' + ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths) + '</w:tblGrid>'
    out = '<w:tbl>' + pr + grid
    if header:
        out += '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' + ''.join(tc(w, h, True, GREEN, True) for w, h in zip(widths, header)) + '</w:tr>'
    for r in rows:
        out += ('<w:tr><w:trPr><w:cantSplit/></w:trPr>' + tc(widths[0], r[0], True, fill=(None if header else PALE))
                + ''.join(tc(w, v) for w, v in zip(widths[1:], r[1:])) + '</w:tr>')
    return out + '</w:tbl>'


parts = [title('Habitat bank service areas'),
         p([run('Postcode districts served by each registered bank, full value and catchment', 24)], sp(60, 0, 300)),
         subtitle(C.DATE)]
parts += [body(t) for t in C.INTRO]
parts.append(h2('How to read the lists'))
parts += [bullet(l, t) for l, t in C.BULLETS]
parts.append(h2('At a glance'))
grows = []
for b in C.ORDER:
    _, cf, _, _, _ = C.lists(b, 'full'); _, cc, _, _, _ = C.lists(b, 'catch'); m = C.META[b]
    grows.append([b, m['pc'], m['lpa'], m['nca'], str(len(cf)), str(len(cc))])
parts.append(table([1500, 1200, 1900, 1750, 1338, 1338],
                   ['Bank', 'Site postcode', 'Local planning authority', 'National Character Area', 'Full value core', 'Catchment core'], grows))
PREVIEW = os.environ.get('PREVIEW_BANK')
if PREVIEW:
    parts = []
for b in ([PREVIEW] if PREVIEW else C.ORDER):
    m = C.META[b]
    parts.append(h1(b) if not PREVIEW else p([run(b, 34, True, color=GREEN)], RULE + sp(280, 0, 276)))
    parts.append(table([2900, 6126], None, [
        ('Site postcode', m['pc']), ('Local planning authority', m['lpa']), ('National Character Area', m['nca']),
        ('Neighbouring councils', C.ADJ[b]['councils']), ('Neighbouring character areas', C.ADJ[b]['character areas'])]))
    for t, ttl, desc in (('full', 'Full value', 'own council and character area (1.0 multiplier)'),
                         ('catch', 'Catchment', 'neighbouring councils and character areas (0.75 multiplier)')):
        a, core, partial, fringe, nongeo = C.lists(b, t)
        parts.append(tier(ttl, desc))
        nt = (C.FULL_NOTES if t == 'full' else C.CATCH_NOTES).get(b)
        if nt:
            parts.append(note(nt))
        if t == 'catch':
            cx = C.cross(b)
            if cx:
                parts.append(note("Already full value at another Biofarm bank, so that bank is the better match: "
                                  + "; ".join(f"{ob}: " + ", ".join(v) for ob, v in cx.items()) + "."))
        parts.append(label(f'Core districts ({len(core)})')); parts.append(plain(', '.join(core) or 'none'))
        parts.append(label(f'Partial ({len(partial)})')); parts.append(plain(', '.join(C.partial_txt(a, d, t) for d in partial) or 'none'))
        parts.append(label(f'Fringe, not recommended ({len(fringe)})')); parts.append(plain(', '.join(fringe) or 'none'))
        if nongeo:
            parts.append(label('Non-geographic, do not target')); parts.append(plain(', '.join(nongeo)))
parts.append(p([run('Sources', 22, True, color=GREY)], RULE + sp(120, 480) + '<w:keepNext/>'))
parts.append(p([run(C.SOURCES, 19, color=GREY)], '<w:jc w:val="both"/>' + sp(120, 0, 300)))

SECT = ('<w:sectPr><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>'
        '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>')
document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>' + ''.join(parts) + SECT + '</w:body></w:document>'
footer = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {W}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs>{sp(0, 0, 240)}</w:pPr>'
          f'{run("Biofarm habitat bank service areas", 18, color=GREY)}<w:r><w:tab/></w:r>{run("Page ", 18, color=GREY)}'
          f'<w:fldSimple w:instr=" PAGE "><w:r>{rpr(18, color=GREY)}<w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>')
styles = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}><w:docDefaults><w:rPrDefault><w:rPr>'
          f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}" w:eastAsia="{FONT}"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>'
          '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>\n'
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>\n'
          '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>'
          '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>')
numbering = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering {W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'
             '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr>'
             f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')
settings = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings {W}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>'
            '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>')
# Fixed to the document date so a rebuild with unchanged content is byte-identical (no spurious git diffs).
now = '%04d-%02d-%02dT00:00:00Z' % C.DATE_ISO
core_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>Habitat bank service areas</dc:title><dc:creator>Biofarm</dc:creator><cp:lastModifiedBy>Biofarm</cp:lastModifiedBy>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified></cp:coreProperties>')
app_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
           'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application></Properties>')
ctypes = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
          '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
          '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
          '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>')
docrels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
           '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
           '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
           '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
           '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>')
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for n, d in [('[Content_Types].xml', ctypes), ('_rels/.rels', rels), ('word/document.xml', document), ('word/_rels/document.xml.rels', docrels),
                 ('word/styles.xml', styles), ('word/numbering.xml', numbering), ('word/settings.xml', settings), ('word/footer1.xml', footer),
                 ('docProps/core.xml', core_xml), ('docProps/app.xml', app_xml)]:
        # ZipInfo with a fixed date: writestr(name, ...) would stamp each entry with the clock and break byte-identity
        zi = zipfile.ZipInfo(n, date_time=C.DATE_ISO + (0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16
        z.writestr(zi, d)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
