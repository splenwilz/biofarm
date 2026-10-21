# Data and copy for the combined service-area Word document (full-value tier +
# catchment tier per bank). Shared by build_docx.py (writer) and audit_check.py
# (independent recomputation compares against the finished document).
#
# Inputs, all in habitat-hub/ (built 14-16 Oct 2026 from the ONS Postcode
# Directory Aug 2026, ONS LAD May 2026, Natural England NCAs, the BNG register
# and the live bank pages; method in the two markdown sheets):
#   service-area-postcode-districts.csv    full-value tier, per bank/district
#   catchment-area-postcode-districts.csv  catchment tier, per bank/district
#   catchment-area-postcode-districts.md   neighbouring councils / character areas per bank
import csv
import os
import re
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
HUB = os.path.abspath(os.path.join(HERE, "..", ".."))
DATE = "16 October 2026"
DATE_ISO = (2026, 10, 16)   # the same date for file metadata and zip entry stamps (never parse DATE: %B is locale-dependent)
ORDER = ["Sleight Farm", "Rycote Farm", "Lesnewth", "Avon Meadows", "Badger Bank Farm", "Slades Farm"]
META = {
    "Sleight Farm": {"pc": "BA2 0HN", "lpa": "Bath and North East Somerset Council", "nca": "Bristol, Avon Valleys and Ridges"},
    "Rycote Farm": {"pc": "OX9 2PF", "lpa": "South Oxfordshire District Council", "nca": "Upper Thames Clay Vales"},
    "Lesnewth": {"pc": "PL35 0HR", "lpa": "Cornwall Council", "nca": "Cornish Killas"},
    "Avon Meadows": {"pc": "CV37 0NS", "lpa": "Stratford-on-Avon District Council", "nca": "Severn and Avon Vales"},
    "Badger Bank Farm": {"pc": "HG4 3HT", "lpa": "North Yorkshire Council", "nca": "Southern Magnesian Limestone"},
    "Slades Farm": {"pc": "GU5 0LT", "lpa": "Waverley Borough Council", "nca": "Wealden Greensand"},
}
# In the Royal Mail non-geographic list and all large-user, but on more than
# seven grid points, so not confirmed to the directory test used for the rest;
# listed as "do not target" anyway (nothing is lost by excluding them).
FORCE_NG = {"CR9", "NG90"}

# ---- tiers from the two CSVs
F = collections.defaultdict(dict)   # bank -> district -> (postcodes in full-value area, district total)
FNG = collections.defaultdict(set)
with open(os.path.join(HUB, "service-area-postcode-districts.csv"), newline="", encoding='utf-8') as fh:
    for r in csv.DictReader(fh):
        F[r["bank"]][r["postcode_district"]] = (int(r["live_postcodes_in_service_area"]), int(r["district_live_postcodes_total"]))
        if r["non_geographic"] == "yes":
            FNG[r["bank"]].add(r["postcode_district"])
Cc = collections.defaultdict(dict)  # bank -> district -> (postcodes in catchment area, district total)
CNG = collections.defaultdict(set)
with open(os.path.join(HUB, "catchment-area-postcode-districts.csv"), newline="", encoding='utf-8') as fh:
    for r in csv.DictReader(fh):
        Cc[r["bank"]][r["postcode_district"]] = (int(r["live_postcodes_in_catchment_area"]), int(r["district_live_postcodes_total"]))
        if r["non_geographic"] == "yes" or r["postcode_district"] in FORCE_NG:
            CNG[r["bank"]].add(r["postcode_district"])

# ---- neighbouring councils / character areas, read from the catchment sheet
ADJ = {}
with open(os.path.join(HUB, "catchment-area-postcode-districts.md"), encoding='utf-8') as fh:
    bank = None
    for line in fh:
        m = re.match(r"## (.+)$", line.strip())
        if m:
            bank = m.group(1); ADJ[bank] = {}
            continue
        m = re.match(r"- \*\*Neighbouring (councils|character areas) \(\d+\):\*\* (.+)$", line.strip())
        if m and bank:
            ADJ[bank][m.group(1)] = m.group(2)
for b in ORDER:
    assert set(ADJ.get(b, {})) == {"councils", "character areas"}, f"catchment sheet lacks neighbouring lists for {b}"


def cls(s):
    return "core" if s >= 0.5 else ("partial" if s >= 0.10 else "fringe")


def dkey(d):
    m = re.match(r"([A-Z]+)(\d+)([A-Z]?)", d)
    return (m.group(1), int(m.group(2)), m.group(3))


def pct(x):
    return f"{round(x * 100)}%"


def assign(bank):
    """One tier per district: full value if >=10% of the district is full value;
    else catchment if >=10% catchment; else fringe in the larger-share tier."""
    out = {}
    for d in set(F[bank]) | set(Cc[bank]):
        nf, tf = F[bank].get(d, (0, None))
        nc, tc = Cc[bank].get(d, (0, None))
        tot = tf if tf is not None else tc
        if tf is not None and tc is not None and tf != tc:
            raise SystemExit(f"district total mismatch {bank} {d}: {tf} vs {tc}")
        sf, sc = nf / tot, nc / tot
        ng = d in FNG[bank] or d in CNG[bank]
        if sf >= 0.10:
            tier, share, other = "full", sf, sc
        elif sc >= 0.10:
            tier, share, other = "catch", sc, sf
        else:
            tier, share, other = ("full", sf, sc) if sf >= sc else ("catch", sc, sf)
        out[d] = {"tier": tier, "cls": cls(share), "share": share, "other": other, "nongeo": ng,
                  "n_full": nf, "n_catch": nc, "total": tot}
    return out


ASSIGN = {b: assign(b) for b in ORDER}


def lists(bank, tier):
    a = {d: v for d, v in ASSIGN[bank].items() if v["tier"] == tier}
    core = sorted([d for d, v in a.items() if v["cls"] == "core" and not v["nongeo"]], key=dkey)
    partial = sorted([d for d, v in a.items() if v["cls"] == "partial" and not v["nongeo"]], key=lambda d: -a[d]["share"])
    fringe = sorted([d for d, v in a.items() if v["cls"] == "fringe" and not v["nongeo"]], key=lambda d: -a[d]["share"])
    nongeo = sorted([d for d, v in a.items() if v["nongeo"]], key=dkey)
    return a, core, partial, fringe, nongeo


def partial_txt(a, d, tier):
    v = a[d]
    if tier == "full" and v["other"] >= 0.10:
        return f"{d} ({pct(v['share'])}, +{pct(v['other'])} catchment)"
    return f"{d} ({pct(v['share'])})"


def other_full(bank, d):
    return [ob for ob in ORDER if ob != bank and ASSIGN[ob].get(d, {}).get("tier") == "full"
            and ASSIGN[ob][d]["cls"] == "core" and not ASSIGN[ob][d]["nongeo"]]


def cross(bank):
    out = {}
    _, core, partial, _, _ = lists(bank, "catch")
    for d in core + partial:
        for ob in other_full(bank, d):
            out.setdefault(ob, []).append(d)
    for ob in out:
        out[ob].sort(key=dkey)
    return out


# ---- copy (plain English, from the verified flags in the two sheets)
FULL_NOTES = {
    "Lesnewth": "The site sits right by the boundary with The Culm character area. This list follows Cornish Killas, as on Biofarm's page; the north Devon (EX) districts on The Culm side are in the catchment tier below.",
    "Badger Bank Farm": "The character area is a long strip running south from North Yorkshire, which is why some South Yorkshire and Nottinghamshire districts (S, DN, NG) appear. Postcodes inside the Yorkshire Dales and North York Moors national parks are excluded from the council area, as those parks have their own planning authorities (see the catchment note).",
    "Slades Farm": "The character area runs east from Surrey into Kent, which is why Maidstone, Ashford and Folkestone districts (ME, TN, CT) appear in the core list.",
}
CATCH_NOTES = {
    "Sleight Farm": "Somerset and Wiltshire councils bring in parts of Exmoor and the New Forest (mainly TA22, TA23, TA24 and SP5). Those are national park planning areas that don't border Bath and North East Somerset, so strictly they sit outside the 0.75 tier; they are kept because the live map includes them.",
    "Lesnewth": "The Culm character area is a neighbour, so north Devon (EX) districts appear here at the 0.75 tier. West Devon council brings in part of Dartmoor (mainly PL19, PL20, TQ13 and EX20); Dartmoor's own authority doesn't border Cornwall, so strictly those sit outside the tier, but the live map includes them.",
    "Badger Bank Farm": "Westmorland and Furness brings in the Lake District (LA8, LA11, LA12, LA20 to LA23, CA10, CA11); the park authority doesn't border North Yorkshire, so strictly those sit outside the tier, but the live map includes them. The Yorkshire Dales and North York Moors postcodes inside North Yorkshire itself (about 2,400, mainly BD23, BD24, DL8, DL11, YO13, YO18, YO21, YO22 and YO62) are in neither tier: the live map treats them as full value, while the full-value tier leaves them out because the park authorities are the planners there. A decision is needed on where they belong.",
    "Slades Farm": "The South Downs National Park covers part of this area; its authority borders Waverley, so those postcodes count. The Romney Marshes character area is a neighbour, which is why Kent coast districts (CT, TN28, TN29) appear.",
}
INTRO = [
    "These are the postcode districts that fall inside each of Biofarm's six registered habitat banks' service areas, in two tiers. Full value is the bank's own local planning authority plus its National Character Area: developments there can use the bank's units at full value, so these are the first areas to target. Catchment is the councils that border the bank's own planning authority plus the character areas that border its own character area: developments there can use the units at 0.75 of their value, so these are the second tier. The catchment tier is the hatched area on each bank's page on the Biofarm site.",
    "Each postcode district is listed once per bank. It sits in the full-value tier if at least 10 per cent of its postcodes are full value for that bank, otherwise in the catchment tier. Where a district is cut by the boundary, the partial entry shows how the rest of it falls.",
]
BULLETS = [
    ("Core: ", "at least half of the district sits inside the tier's area. These are the ones to target."),
    ("Partial: ", "10 to 49 per cent inside, with the share shown. Worth a look case by case. A partial full-value entry also shows how much of the district is catchment, for example \"BS49 (42%, +58% catchment)\"."),
    ("Fringe: ", "under 10 per cent inside. Listed for completeness, but not worth targeting."),
    ("Non-geographic: ", "PO box and bulk-mail codes with no street addresses (for example BS99, LS98, S99, WV99). They are shown separately so they can be left out of targeting. CR9 and NG90 are listed on Royal Mail's and the directory's large-user coding alone."),
    ("One tier per district: ", "no district appears in both tiers for the same bank. If a district is in the full-value tier, the rest of it is usually catchment, so it can be targeted in full."),
    ("Other Biofarm banks: ", "where a catchment district is already full value for another Biofarm bank, that bank is named as the better match."),
]
SOURCES = (
    "Bank location: Biodiversity Gain Sites register (environment.data.gov.uk), grid reference of each registered site. Council and character area: ONS Local Authority Districts (May 2026) and Natural England National Character Areas; the catchment councils and character areas are those that share a boundary with the bank's own, checked against the map on each live bank page. "
    "Postcodes: ONS Postcode Directory (August 2026) and the ONSPD centroid layer, live postcodes only, grouped by district and measured against each district's national total. National parks: ONS National Parks boundaries (December 2022). Non-geographic codes: Royal Mail non-geographic list (July 2019) and ONSPD user-type coding. "
    f"Multiplier tiers: Statutory Biodiversity Metric User Guide (July 2025), Table 9. Prepared {DATE}."
)
