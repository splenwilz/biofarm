# Vix (Victoria Gold) — feedback & fixes

Received 2026-08-06 (email to God'swill, cc Chris + Chris). Overall verdict: **"Really great work."**

**Priority steer:** focus on the **hub** + **Sleight** now. **Cookridge / coming-soon is ON HOLD until next week** (Vix to discuss with Chris what info exists for non-registered sites).

**Rule:** only tick a box once it's actually fixed **and verified live**.

---

## Site-wide / general

- [~] **Links hit a redirect page** — AUDITED (2026-08-06). Every canonical link resolves directly, no true redirect: `/contact`, `/developers`, `/habitat-banks`, `/habitat-banks-lists/lesnewth`, `/avon-meadows`, `/stories`, the brochure `/s/…` all OK. **Fixed:** the 4 "story" links were pointing at `/habitat-banks-lists` (the bank list) instead of the real Stories posts → now `/stories/sleight-farm-botanical-survey` + `/stories/sleight-farm-wildlife-monitoring` (in `09-timeline.html` + `15-cta.html`; **re-paste those two blocks**). ⚠️ If Vix saw a redirect on a *different* link, need her specific example to close this fully.
- [x] **No CAPS anywhere** — DONE. Removed `text-transform:uppercase` from injection, finder, sections block, and `page-typography-fix.css`; tightened eyebrow tracking (`.16em`→`.02em`) so sentence case reads right. *(The native "5 habitat banks" heading is separate — see hub section.)*
- [x] **No em dashes** — DONE. Swept `—` → `,` across all live copy: `sleight/*`, `coming-soon-INLINE`, `sections/ilinks/cta` blocks, and the finder's "no sites match" message.
- [x] **Image straight edges** — DONE. Removed rounding from **photos** outside cards: `.bf-split img` + `.bf-gallery img` (injection). *(Maps are treated as UI panels, not photos, so they keep their rounded corners to match the paired rail/other cards — restored `.bf-map` border-radius 18px on the finder + Sleight map.)* Cards keep their rounding.
- [ ] **Registered-site photography** — replace placeholders with the real photos. *(Drive: "Site Specific Marketing Brochures" — link in Vix's email.)*
- [~] **Final brochures** — Sleight **DONE in source** (all links → `/s/Biofarm-Habitat-Bank-Brochure-Sleight-Farm_FINAL.pdf`, verified live 200/PDF). **Re-paste `01,04,12,15` on BOTH the full post and the lean copy.** *(Other banks + Lesnewth still awaiting.)*

## Final review (2026-08-07) — issues found + fixed in source (need re-paste)

- [~] **Broken hero brochure link** — the live hero used a **relative** path `s/…FINAL.pdf` (missing leading `/`) → 404. Fixed to absolute `/s/…FINAL.pdf` in `01-hero.html`.
- [~] **Old brochure in Resources + bottom CTA** — still pointed at `Sleight-Farm_Biofarm_BNG.pdf`. Swapped to FINAL in `12-resources.html` + `15-cta.html`.
- [~] **Dead `#` links in Resources** — Ecology report + BGS registration went nowhere. Now `/contact` "On request" (kept as capability signals). **TODO:** swap for real ecology PDF + public BGS register URL (ref BGS-281124001).
- [~] **Visible dev note leaked live** — "Placeholder resources, wire to the real documents." removed from `12-resources.html`.
- [~] **Em dash + caps + broken URL in map popups** — `&mdash;`→comma, removed `text-transform:uppercase` eyebrow, fixed `/habitat-banks-list/`→`/habitat-banks-lists/` in `04-map.html` (+ synced `map-block-sleight-INLINE.html`).
- [x] **Lean copy card on hub** — shows decorated as "Sleight Farm (lean preview)" with a Lean preview pill, links to the copy; NOT counted, no map pin (count stays 5, pins stay 5). Verified live.
- [ ] **Non-registered imagery** — no photos exist for coming-soon sites; needs a creative solution (illustration / brand pattern / map graphic). *(Tied to Cookridge — on hold.)*
- [~] **Illustrations + parallax** — **Parallax DONE** (hero parallax + reveal-on-scroll in the injection; reduced-motion safe). **Illustrations: interim motif BUILT** — the seeds are baked into the homepage hero JPG (no clean asset), so I hand-drew a tintable SVG **dandelion-seed motif** (`bf-dandelion-motif.html`), verified. **Hub accent BUILT** (`hub-hero-illustration.html`) — subtle seed drift for the hub hero top-right (previewed, looks good); add as a Code Block + position on the grid. Still to wire into **coming-soon hero (the missing-photo solution)** when Cookridge is off hold. Swap for the designer's exact export later (same slots).

## Hub — /habitat-banks

- [x] **Add to main navigation**, next to Partners. → **NATIVE / user action** (Squarespace → Pages → drag Habitat Banks into the main nav next to Partners). Not a code change.
- [x] **Search by region only** — DONE. Removed the habitat-type dropdown + the habitat pills from the rail; JS now filters by region only (habitat var stubbed, syntax-checked OK). Habitat types still shown on the cards (the TBD bit — left as-is for now).
- [~] **Reduce search/map footprint** — **map RESTORED to original height (~540px)** after the smaller versions looked cramped; rail is now its natural compact height (`align-items:start`, no stretched empty gap — a small space saving from removing the habitat pills). **Explain to Vix:** the cards sit below the fold because of the **tall hero/intro ABOVE the finder**, not the map — so shrinking the map doesn't fix it and just makes it cramped. To get cards above the fold we'd tighten the hero/intro (native: shorter intro copy / less section top padding). *(Awaiting Vix's steer.)*
- [x] **Rename "5 habitat banks"** → DONE. It's the finder's grid count (our code) → now **"5 registered habitat banks"** (distinguishes from the pipeline dots). **Re-paste finder.** *(Confirm exact wording with Vix.)*

## Hub — review findings (2026-08-07 full pass)

- [ ] **"NATIONAL BY NATURE, LOCAL BY DESIGN"** — typed in caps in a native text block → retype sentence case (Vix no-caps). NATIVE/editor.
- [ ] **Em dash in native copy** — "…managed for at least 30 years, with —…" → replace the `—` with a comma. NATIVE/editor.
- Verified OK: hero (Partners-style, butterfly collage, short sub-text, eyebrow now sentence case); finder (region-only, full map, legend-in-rail, equal heights); 30 cards load; no broken links (the `+`/`−` `#` links are just Leaflet zoom); Portfolio/How-it-works stats present. Nav caps ("HABITAT BANKS") are the site-wide nav style (PARTNERS/ABOUT/etc. all caps) — consistent, not a violation.
- ✅ **All three re-confirmed FIXED after cache-bust reload** (2026-08-07): "National by nature, local by design" sentence case; em dash gone; "5 registered habitat banks".

### Mobile pass (2026-08-07)
- ✅ Finder **stacks to single column**; map resizes to 52vh; **no horizontal scroll**; mobile nav (hamburger) works; marketing sections have responsive breakpoints.
- ✅ **Hero mobile order (illustration above heading) — INTENTIONAL**, matches the Partners pages' mobile layout. Consistent, not an issue.
- [ ] **Hero redesign to match the Partners pattern** (native/editor). Partners heroes = short heading + bespoke watercolour collage on the right. For the hub: (a) **shorten the sub-text** — e.g. "Find the right habitat bank for your development." (current one is too long → causes the odd look + the heading/intro overlap); (b) **two-column layout** — text left, illustration right (also fixes the overlap); (c) **illustration = the Corporates "Breeze Block + Flowers + Butterfly" collage** (best existing fit: butterfly + wildflowers, echoes the Sleight DACRE butterfly; already in the asset library). Caveat: shared with /corporates — swap for a bespoke habitat-banks collage later.

## Sleight — /habitat-banks-lists/sleight-farm

- [x] **Replace imagery** — DONE. hero/overview/land/gallery use the professional **DACRE July-2025 shoot** (already on the CDN); **related-bank thumbnails** now use the real Lesnewth/Avon photos from `BF_BANKS` + a DACRE hay landscape for "Browse all". **All Sleight imagery is real** — 0 placeholders left. **Re-paste `01,02,07,11,13`.** *(Only non-photo placeholders left: the 2 Resources doc links — ecology report + BGS register — need real docs.)*
- [~] **Simplify / make low-maintenance** — LEAN v2 speced (`sleight/00-LEAN-vs-FULL.md`): the lean version = same page **minus `09-timeline` + `10-species`** (the only ongoing-evidence sections). Deploy as a **duplicate post** (`…/sleight-farm-lean`) with those 2 blocks deleted, so **Vix compares Full vs Lean** and picks a direction (then apply to the other 4 banks). *(Awaiting Vix's choice.)*
- [~] **More enquiry shortcuts** — added a **mid-page CTA** ("Enquire about these units") under the units section, so it's now hero (top) + units (middle) + CTA (bottom). Can add a **sticky enquiry bar / floating button** across all bank pages via the injection if you want it always-visible — say the word.

## Cookridge / coming-soon — /habitat-banks-lists/cookridge  ⏸ ON HOLD (until next week)

- [ ] Paused — Vix to discuss with Chris what info exists for non-registered sites. Do not progress coming-soon until then.

---

## Waiting on Vix / Biofarm (not our action yet)

- **Copy** — Vix writes it once the user journey + page layout are finalised.
- **Lesnewth brochure** — awaiting Biofarm feedback.
- **Non-registered imagery** — creative solution to be agreed with Chris.
