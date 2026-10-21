# Habitat bank postcode documents: build and audit tooling

Produces and independently audits `habitat-hub/Biofarm-habitat-bank-service-area-postcodes.docx`
(full-value tier and catchment tier per bank). Everything here reads the committed sheets in
`habitat-hub/`; nothing depends on a session scratch folder.

## Files

| File | Role |
|---|---|
| `combined_data.py` | Reads the two CSVs and the neighbouring-area lists from the catchment sheet, applies the one-tier-per-district rule, holds the document copy (notes, intro, bullets, sources). |
| `build_docx.py` | Writes the Word document (own OOXML package, no template). `PREVIEW_BANK="Avon Meadows" python3 build_docx.py out.docx` builds one bank for a Quick Look check. |
| `audit_doc.py` | Parses the finished document back into lists; shared by the audit and usable alone to print counts. |
| `audit_pull.py` | Fresh data pull from source for the audit: live pages and register, adjacency from the ONS and Natural England boundary layers, postcodes from the ONSPD centroid layer. Writes to `data/audit/` (gitignored, roughly 100 MB). Resumable: a rerun skips every council and character area file already on disk and reuses `derived.json`; `--fresh` redoes the live pages, register and adjacency too. |
| `audit_totals.py` | National live-postcode totals per district in 26 grouped queries (one per initial letter) from the centroid layer and the August 2026 hosted table, and a vintage comparison. |
| `audit_check.py` | Recomputes every bank's tiers from the pulled data and compares them with what the document actually says: councils and character areas, tier membership, classes, shares, non-geographic lists, counts, cross-bank notes. Prints findings; exit code 0 with "0 findings" means clean. |
| `data/royal-mail-nongeo-parsed.json` | Optional, not currently in the repo: Royal Mail's July 2019 non-geographic list (poweredbypaf.com, "Current non-geos") parsed to `{"nongeo": {district: [...]}}`. Without it the audit's non-geographic check rests on the directory test alone and says so in its output. |

## Rebuild the document

The build is deterministic: with unchanged inputs it writes a byte-identical file (the document
metadata dates and the zip entry stamps are both fixed to the document date, not the clock), so
`cmp` against the committed file is a valid check.


```sh
cd habitat-hub/tools/postcode-docs
python3 build_docx.py
```

Then rerun the audit (below) before sending.

## Audit

Needs `shapely` and `numpy` (installed in the user site on this Mac, so use `python3 -P`, not `-I`).

```sh
cd habitat-hub/tools/postcode-docs
python3 -P audit_pull.py          # fresh pulls into data/audit/ (long, see below)
python3 -P audit_totals.py        # district totals (a few minutes)
python3 -P audit_check.py         # compare the document with the recomputation
```

How long the pull takes depends on the ONS ArcGIS service on the day: under an hour when it is
responsive, several hours when it is not (20 October 2026 took most of an afternoon, with single
queries running 40 to 60 seconds). The service also answers an intermittent HTTP 200 with a
`{"error": {"code": 400}}` body under load; every query retries that up to ten times with a growing
pause before giving up. If a run does stop, just rerun it: it resumes from the files already pulled.
`PULL_WORKERS` sets the number of parallel pulls (default 4); drop it to 1 or 2 on a slow day, as
the 400s cluster when several large pulls run at once.

## Method, in one paragraph

Each bank's registered grid reference (Biodiversity Gain Sites register) is placed in its council
(ONS Local Authority Districts, May 2026) and National Character Area (Natural England). Full value
is that council (minus national-park postcodes, whose planning authority is the park) plus that
character area. Catchment is every council and character area that shares a boundary with those,
minus the full-value postcodes, which matches the hatched area on each live bank page to within
one per cent of area. Live postcodes (ONS Postcode Directory, August 2026) are grouped by district
and measured against the district's national total. Core is at least 50 per cent, partial 10 to
49, fringe under 10. Each district sits in one tier only: full value if at least 10 per cent of it
is full value, otherwise catchment. Non-geographic districts are those whose live postcodes are all
large-user and sit on at most seven grid points (CR9 and NG90 are included on Royal Mail's list and
the large-user coding alone).

## Known decisions and caveats

- Two districts sit within one postcode of a class boundary and may flip on the next ONS Postcode
  Directory release: B64 (Avon Meadows catchment, 47 of 474 = 9.9 per cent, fringe) and DA4
  (Slades Farm catchment, 122 of 243 = 50.2 per cent, core). A rebuild that moves either is the
  data changing, not a bug.
- The entry-point scripts put their own folder on `sys.path`, so `python3 -P build_docx.py` and the
  audit commands work from anywhere. `python3 -P -c "import combined_data"` does not, because `-P`
  leaves the working directory off the path; use `python3 -P -c "import sys; sys.path.insert(0, '.'); import combined_data"`.

- National-park postcodes inside neighbouring councils are kept (the live map includes them) even
  where the park authority does not border the bank's council; the notes name them.
- 2,435 Yorkshire Dales and North York Moors postcodes inside North Yorkshire are in neither tier
  pending a decision.
- Natural England's web layer is generalised; the live web polygons more so. A handful of
  catchment districts have 10 to 40 per cent of their postcodes outside the live hatched polygon.
