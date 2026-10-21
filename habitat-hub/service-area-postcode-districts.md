# Habitat bank service areas as postcode districts (14 Oct 2026)

**What this is.** For each of Biofarm's six registered habitat banks, the postcode districts (outward codes, e.g. BA2) that fall inside the bank's full-value service area under the statutory biodiversity metric: the bank's local planning authority (LPA) plus its National Character Area (NCA). Developments in either area can use the bank's units at the 1.0 spatial multiplier.

**How it was built.**

1. Each bank's registered grid reference was taken from the public Biodiversity Gain Sites register (environment.data.gov.uk/biodiversity-net-gain, search API). The register does **not** record LPA or NCA, so both were derived from the grid reference.
2. LPA: point-in-polygon against the ONS Local Authority Districts (May 2026, full-resolution) boundaries, confirmed against the separate ONS Local Planning Authorities (April 2022) layer. NCA: point-in-polygon against Natural England's National Character Areas layer. All six results match the LPA and NCA printed in Biofarm's brochures and on the live bank pages.
3. Postcodes: every live postcode (no termination date) in the LPA was pulled from the ONS Postcode Directory (August 2026); every live postcode centroid inside the NCA polygon was pulled from the ONSPD centroid layer by spatial query. National-park postcodes were removed from the LPA set where a national park authority is the planning authority instead.
4. Districts were grouped and each district's share of its live postcodes inside the area was computed against the district's national live-postcode total from the same directory.
5. Independent checks: every district attributed through the LPA was checked against postcodes.io (a separate service) and the LPA appears in that district's local-authority list in every case (0 mismatches across 163 districts). District centroids from postcodes.io were also tested against the NCA polygon by a second, local calculation; disagreements occur only on districts the boundary cuts through, which is why share is reported rather than a yes/no.
6. Each site's distance to its LPA and NCA boundary was measured against the site's size to flag ambiguous cases.

**Non-geographic districts (verified 14 Oct).** Six districts in the lists are non-geographic: BS98, BS99, CT50, SN38, SN99 and WR99. All six appear in Royal Mail's own published list of non-geographic codes and PO Box sectors (poweredbypaf.com, "Current non-geos", July 2019): BS98 1 Capita TV Licensing, Bristol; BS99 1-7 all PO Boxes, Bristol Head Post Office, plus Computershare; CT50 1 Saga, Folkestone; SN38 0-1 large users and response services, Swindon; SN99 8 DWP mail opening, Swindon; WR99 1-2 Kays Ltd, Worcester. The ONS Postcode Directory (August 2026) agrees: every live postcode in those six districts is coded large user (USRTYPIND = 1, zero small-user postcodes) and all of them sit on one to seven grid points, which is how the ONSPD user guide (section 11) says non-geographic postcodes are recorded: a grid reference at the local sorting office, not a street location. They are in the lists because the directory gives them that nominal location; do not target them. B94, B95, B96, B97 and B98 are ordinary geographic districts (Tanworth-in-Arden and Hockley Heath; Henley-in-Arden; Astwood Bank and Feckenham; Redditch west; Redditch east) and are correctly included above: each has hundreds of small-user postcodes at distinct street locations, and none appears in the Royal Mail list. An earlier draft of this note wrongly grouped them with the six; that was a mistake in the note, not in the lists or the CSV.

**How to read the lists.** *Core* = at least half of the district's live postcodes are inside the service area. *Partial* = 10 to 49 per cent, with the share shown. *Fringe* = under 10 per cent, listed so nothing is hidden, but these are not meaningful coverage and I would not target them. For Google Ads, target the core districts and consider partials case by case.

**Source files.** `catchments.js` in the hub carries the same LPA + NCA polygons for the map. The CSV beside this file holds every district with its counts and is one of the two inputs to the client-facing Word document (`Biofarm-habitat-bank-service-area-postcodes.docx`, built and audited by the scripts in `tools/postcode-docs/`, see the README there). Register records and the postcode pulls are re-fetched from source by `tools/postcode-docs/audit_pull.py` rather than kept in the repo.

## Sleight Farm

- **Register:** BGS-281124001, grid ref ST6622259312, site postcode BA2 0HN
- **Local planning authority:** Bath and North East Somerset Council (ONS code E06000022)
- **National Character Area:** Bristol, Avon Valleys and Ridges
- **Live postcodes in service area:** 27,245 (LPA 5,930, NCA 23,686, overlap counted once)
- **Boundary margins:** 4,627 m to the LPA edge, 2,242 m to the NCA edge; site is roughly 472 m in radius
- **Flag:** none; LPA and NCA agree with the brochure and the site sits well inside both.

**Core districts (34):** BA1, BA2, BA3, BS1, BS10, BS11, BS13, BS14, BS15, BS16, BS2, BS20, BS21, BS3, BS30, BS31, BS32, BS34, BS35, BS36, BS37, BS39, BS4, BS40, BS41, BS48, BS5, BS6, BS7, BS8, BS9, BS98 (non-geographic), BS99 (non-geographic), GL12

**Partial (2):** BS49 (42%), BS25 (20%)

**Fringe, not recommended (5):** GL9 (7 of 112), SN14 (10 of 974), BA11 (8 of 1180), BA15 (1 of 470), GL11 (1 of 624)

## Rycote Farm

- **Register:** BGS-150725001, grid ref SP6634004820, site postcode OX9 2PF
- **Local planning authority:** South Oxfordshire District Council (ONS code E07000179)
- **National Character Area:** Upper Thames Clay Vales
- **Live postcodes in service area:** 21,454 (LPA 5,324, NCA 19,244, overlap counted once)
- **Boundary margins:** 674 m to the LPA edge, 3,517 m to the NCA edge; site is roughly 190 m in radius
- **Flag:** Minor: registered point is 674 m from the Buckinghamshire boundary (site ~190 m radius), so the planning authority is South Oxfordshire with margin, but a hand check of the site boundary against the district line is cheap.

**Core districts (30):** HP17, HP18, HP19, HP20, HP21, HP27, OX1, OX10, OX11, OX12, OX14, OX18, OX2, OX26, OX28, OX29, OX33, OX39, OX44, OX49, OX5, OX9, RG9, SN2, SN38 (non-geographic), SN4, SN5, SN6, SN7, SN99 (non-geographic)

**Partial (14):** RG8 (49%), OX25 (48%), OX27 (42%), GL7 (39%), OX13 (38%), HP22 (35%), SN25 (29%), MK18 (28%), SN16 (26%), RG4 (25%), OX20 (23%), SN26 (18%), SN1 (17%), SN3 (15%)

**Fringe, not recommended (6):** OX3 (100 of 1004), OX4 (92 of 1367), SN15 (79 of 1316), LU7 (20 of 1402), HP14 (4 of 541), MK17 (2 of 909)

## Lesnewth

- **Register:** BGS-221025001, grid ref SX1309690022, site postcode PL35 0HR
- **Local planning authority:** Cornwall Council (ONS code E06000052)
- **National Character Area:** Cornish Killas
- **Live postcodes in service area:** 22,065 (LPA 22,065, NCA 16,897, overlap counted once)
- **Boundary margins:** 2,967 m to the LPA edge, 191 m to the NCA edge; site is roughly 293 m in radius
- **Flag:** CHECK BY HAND: registered point is 191 m from the Cornish Killas / The Culm boundary and the site is 27 ha, so the holding almost certainly straddles both character areas. If the site is treated as being in The Culm, full-value coverage would extend into north Devon (Torridge and North Devon districts, EX postcodes), which is NOT in this list. The list below assumes Cornish Killas, as stated on the Biofarm page and brochure.

**Core districts (45):** EX23, PL10, PL11, PL12, PL13, PL14, PL15, PL17, PL18, PL22, PL23, PL24, PL25, PL26, PL27, PL28, PL29, PL30, PL31, PL32, PL33, PL34, PL35, TR1, TR10, TR11, TR12, TR13, TR14, TR15, TR16, TR17, TR18, TR19, TR2, TR20, TR26, TR27, TR3, TR4, TR5, TR6, TR7, TR8, TR9

**Partial (1):** EX22 (12%)

**Fringe, not recommended (1):** TR21 (1 of 73)

## Avon Meadows

- **Register:** BGS-171125001, grid ref SP2239356329, site postcode CV37 0NS
- **Local planning authority:** Stratford-on-Avon District Council (ONS code E07000221)
- **National Character Area:** Severn and Avon Vales
- **Live postcodes in service area:** 25,843 (LPA 4,911, NCA 22,602, overlap counted once)
- **Boundary margins:** 3,726 m to the LPA edge, 1,677 m to the NCA edge; site is roughly 235 m in radius
- **Flag:** none; LPA and NCA agree with the brochure and the site sits well inside both.

**Core districts (34):** B49, B50, B80, B95, CV33, CV35, CV36, CV37, CV47, GL1, GL10, GL13, GL19, GL2, GL20, GL3, GL4, GL50, GL51, GL52, GL53, WR1, WR10, WR11, WR12, WR14, WR2, WR3, WR4, WR5, WR7, WR8, WR9, WR99 (non-geographic)

**Partial (14):** WR13 (45%), BS11 (44%), BS35 (41%), B94 (39%), B96 (36%), WR6 (33%), B60 (30%), GL55 (29%), BS20 (29%), GL54 (19%), GL11 (18%), GL14 (18%), GL56 (11%), NP16 (10%)

**Fringe, not recommended (22):** OX15 (80 of 835), B61 (66 of 746), OX17 (51 of 716), GL15 (40 of 810), GL18 (16 of 329), GL12 (19 of 470), B97 (31 of 806), BS32 (15 of 429), DY13 (22 of 689), BS10 (23 of 777), DY10 (19 of 999), HR8 (10 of 576), B98 (13 of 822), B48 (2 of 208), CV34 (9 of 1001), NN11 (10 of 1182), BS21 (3 of 695), B47 (1 of 241), CV31 (2 of 807), GL17 (1 of 529), OX7 (2 of 1083), CV23 (1 of 882)

## Badger Bank Farm

- **Register:** BGS-060526001, grid ref SE3046776819, site postcode HG4 3HT
- **Local planning authority:** North Yorkshire Council (ONS code E06000065)
- **National Character Area:** Southern Magnesian Limestone
- **Live postcodes in service area:** 34,745 (LPA 21,501, NCA 16,035, overlap counted once)
- **Boundary margins:** 28,572 m to the LPA edge, 2,566 m to the NCA edge; site is roughly 308 m in radius
- **Flag:** Planning authority is North Yorkshire Council; the Yorkshire Dales and North York Moors national parks are separate planning authorities inside the same county, so their 2,465 live postcodes were excluded from the authority area (they are still included where they fall inside the character area). The ONS planning-authority layer predates the 2023 reorganisation and returns 'Harrogate LPA' for the point, which is the same area under its old name.

**Core districts (40):** BD23, BD24, DL10, DL6, DL7, DL8, DL9, DN12, DN6, HG1, HG2, HG3, HG4, HG5, LS22, LS23, LS24, LS25, NG15, NG17, NG20, S25, S66, TS9, WF10, WF11, WF8, YO11, YO12, YO13, YO14, YO17, YO18, YO21, YO51, YO60, YO61, YO62, YO7, YO8

**Partial (28):** DL11 (48%), S44 (44%), YO22 (43%), DN4 (42%), S81 (42%), DN5 (38%), NG6 (38%), BD20 (37%), YO19 (37%), WF9 (37%), S26 (36%), S80 (35%), YO26 (31%), S64 (31%), S43 (28%), DN11 (27%), TS15 (26%), NG19 (23%), LA6 (23%), LA2 (21%), DN14 (20%), LS21 (20%), YO30 (15%), YO23 (15%), NG16 (15%), LS17 (14%), DL2 (12%), YO41 (11%)

**Fringe, not recommended (16):** LS15 (98 of 1008), BD22 (101 of 1073), LS14 (66 of 1004), S65 (32 of 831), TS8 (14 of 396), LS29 (44 of 1246), NG5 (40 of 1928), S63 (24 of 1160), YO25 (23 of 1403), YO32 (9 of 793), LS26 (9 of 799), WF7 (6 of 572), TS7 (4 of 606), BB18 (2 of 573), DL12 (2 of 726), DN1 (1 of 483)

## Slades Farm

- **Register:** BGS-060325001, grid ref TQ001409, site postcode GU5 0LT
- **Local planning authority:** Waverley Borough Council (ONS code E07000216)
- **National Character Area:** Wealden Greensand
- **Live postcodes in service area:** 23,367 (LPA 4,376, NCA 21,738, overlap counted once)
- **Boundary margins:** 3,286 m to the LPA edge, 1,064 m to the NCA edge; site is roughly 529 m in radius
- **Flag:** none; LPA and NCA agree with the brochure and the site sits well inside both.

**Core districts (39):** CT19, CT20, CT21, CT50 (non-geographic), GU10, GU26, GU27, GU28, GU29, GU30, GU31, GU32, GU33, GU35, GU5, GU6, GU7, GU8, GU9, ME14, ME15, ME16, ME17, ME18, ME19, ME20, ME6, RH1, RH2, RH20, RH3, RH4, RH8, RH9, TN13, TN15, TN23, TN24, TN25

**Partial (6):** TN16 (38%), TN14 (36%), GU4 (30%), RH5 (25%), TN27 (23%), GU3 (17%)

**Fringe, not recommended (10):** GU34 (120 of 1223), TN26 (47 of 523), CT18 (22 of 451), TN8 (22 of 573), TN11 (19 of 594), RH12 (20 of 1389), ME1 (6 of 893), BN18 (3 of 588), TN12 (3 of 1262), RH14 (1 of 598)
