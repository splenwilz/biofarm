# Sleight Farm bank page — per-section build (CSS in collection injection)

The bank detail page is built **section by section**: each Squarespace section on
the blog post holds **one Code Block**, pasted from one file below. The design
CSS is **not** in these files — it lives once in the blog collection's code
injection, so every bank post gets it automatically.

## One-time setup (per site)

Paste **`../bank-detail-INJECTION.html`** into
**Blog collection → Settings → Advanced → "Post Blog Item Code Injection"**.
This defines the whole `.bf-bank` design system for every post in the collection.
Typography/colour inherit the Squarespace theme (RATI / RATI_v2 / Inter, #111);
only custom components are styled. The post-title hide is guarded by
`:has(.bf-hero)`, so coming-soon posts (no hero) keep their native title.

## Per bank post — add 15 sections, top to bottom

Each is a new Squarespace **section** with a single **Code Block**:

| # | File | Section |
|---|---|---|
| 01 | `01-hero.html` | Immersive hero (full-bleed, flush under header) |
| 02 | `02-overview.html` | Overview + stats + image |
| 03 | `03-location.html` | Location intro (heading + text) |
| 04 | `04-map.html` | **Two-tier catchment map** — self-contained (keeps its own CSS + Leaflet + data) |
| 05 | `05-lpa-chips.html` | LPAs served (sits under the map) |
| 06 | `06-units.html` | Habitat units & types + table |
| 07 | `07-land-legacy.html` | About the land & legacy (cream) |
| 08 | `08-stewardship.html` | 30-year stewardship pillars |
| 09 | `09-timeline.html` | Recovery timeline (cream) |
| 10 | `10-species.html` | Species recorded |
| 11 | `11-gallery.html` | Gallery (cream) |
| 12 | `12-resources.html` | Resources / downloads |
| 13 | `13-related.html` | Related banks |
| 14 | `14-enquire.html` | Enquire → Contact (cream) |
| 15 | `15-cta.html` | Closing CTA (ink) + related links |

Notes:
- **Order matters** for the cream/white banding rhythm and the hero's flush pull.
- Every section is pure HTML wrapped in `<div class="bf-bank">` — edit copy freely;
  it stays styled by the injection. You can also drop **native blocks** between
  sections and they'll match the theme.
- Content TODOs remain (`data-todo`): real photos, ecology-report + BGS links,
  related-bank slugs. Brochure PDF is already wired (`/s/Sleight-Farm_Biofarm_BNG.pdf`).

## For the next bank (Lesnewth, Avon Meadows, …)

The **injection is already there** (site-wide). Just copy this `sleight/` folder,
swap the copy/data/photos/brochure per section, and reuse
`map-block-<bank>-INLINE.html` for section 04. No CSS to touch.
