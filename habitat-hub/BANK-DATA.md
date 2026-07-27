# Habitat bank data (from brochures) — source of truth

Extracted from `brochures/*.pdf` (2026-07). Use these to populate hub cards, map, compare table
and bank pages.

## Sleight Farm  (flagship, has full page)
- **Units:** 374 · **Area:** 70 ha · **Status:** Fully registered
- **LPA:** Bath & North East Somerset · **NCA:** Bristol, Avon Valleys & Ridges · **LNRS:** West of England
- **BGS reg:** BGS-281124001
- **Trading area:** Bath · Bristol · North Somerset · South Gloucestershire · Somerset · Stroud
- **Habitats:** Broadleaved woodland · Ditches · Hedgerows · Individual trees · Lowland meadow · Mixed scrub · Other neutral grassland
- **Coords (approx):** 51.302, -2.468

## Lesnewth  (from stories; no brochure)
- **Units:** 130 · **Area:** 26.8 ha · **BGS:** BGS-221025001 · North Cornwall · River Valency
- **Habitats:** Species-rich grassland · Woodland · Scrub · Cornish hedgerows
- **Coords:** 50.688, -4.630

## Avon Meadows  (b03)
- **Units:** 110 · **Area:** 17.4 ha · **Status:** Fully registered
- **LPA:** Stratford-on-Avon District Council · **NCA:** Severn & Avon Vales · **LNRS:** Warwickshire
- **BGS reg:** BGS-171125001
- **Trading area:** Stratford-on-Avon · Wychavon · Tewkesbury · Redditch · Bromsgrove · Worcester · Malvern Hills · Forest of Dean · Cheltenham · Gloucester · Stroud · South Gloucestershire · City of Bristol · North Somerset
- **Habitats:** Species-rich meadow · Wetland · Hedgerows (along River Avon corridor)
- **Coords (approx):** 52.19, -1.71

## Badger Bank Farm  (b04)
- **Units:** 232 · **Area:** 30 ha · **Status:** Fully registered
- **LPA:** North Yorkshire Council · **NCA:** Southern Magnesian Limestone · **LNRS:** North Yorkshire and York
- **BGS reg:** (not shown)
- **Trading area:** North Yorkshire · Leeds · Wakefield · Doncaster · Rotherham · Bassetlaw · Ashfield · Gedling · Broxtowe · Bolsover · Nottingham · Mansfield
- **Habitats:** Individual rural trees · Mixed scrub · Other neutral grassland · Species-rich native hedgerow
- **Coords (approx):** 54.10, -1.55

## Rycote Farm  (b05)
- **Units:** 78 · **Area:** 11.6 ha · **Status:** Fully registered
- **LPA:** South Oxfordshire District Council · **NCA:** Upper Thames Clay Vales · **LNRS:** Oxfordshire
- **BGS reg:** BGS-150725001
- **Trading area:** South Oxfordshire · West Oxfordshire · Cherwell · Oxford · Buckinghamshire · Wiltshire · Swindon · Cotswold · Vale of the White Horse
- **Habitats:** Mixed scrub · Other neutral grassland (River Thame corridor)
- **Coords (approx):** 51.72, -1.03

## Catchment basis (changed 27 Jul per Chris)
Full-value catchments on all maps = **LPA + NCA combined** per bank (ONS LAD May-2025 +
Natural England NCA unions in `catchments.js` → `BANK_CATCHMENTS`). Chris: LNRS doesn't
legally take effect until ~2027 — re-add the LNRS layer then (the generation script/query
approach is in the git history; all 48 LNRS areas come from the same Defra ArcGIS service).
"Units needed" filter removed from all search rails on Chris's instruction (kept in
enquiry/register-interest forms).

_Portfolio = 5 banks with data (was 6 with placeholders; b06 removed as unknown). Confirm whether a 6th registered bank exists._

## Pipeline sites (REAL — from Biofarm's public site map, July 2026)
Source: Google My Maps embedded on biofarm.co.uk "our sites and coverage" story
(mid=1_0Y6MlTcCB2SSTEzCayZw8mZM5aYG50). 5 "Site Registered" + **23 "Coming Soon"** sites,
each with postcode/LPA/NCA; coordinates geocoded from postcodes (approximate).
Defined in `catchments.js` (`PIPELINE_SITES`); shown as stone dot markers + region
coming-soon cards. By Chris's regions:
- **E&SE (11):** Houghton Hall · Bicester · Framlingham · Highways Farm · Broadlands ·
  Chatteris · Stoke by Nayland · Worth Abbey · Biddenden · Snodland · Key Street
- **South West (6):** Iris Fen · Banks Farm · Beech Tor · Bodstone Barns · Chapmanslade · Highfold Farm
- **Midlands (5):** Skegness · The Vine · Leominster · Wolverhampton · Ellesmere
- **The North (1):** Cookridge (Leeds)

Also from the site map: **Badger Bank BGS = BGS-060526001** (brochure didn't show it);
Lesnewth NCA per their data = Cornish Killas (our pages say River Valency — theirs is the
formal NCA). Live map shows **5** registered vs brief's "six" — Worth Abbey story suggests
it's next. Note: Herefordshire (Leominster, The Vine area) is missing from Chris's county
list — filed under Midlands, confirm.
