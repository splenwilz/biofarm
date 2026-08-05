# Biofarm Habitat Bank Hub — Squarespace build & maintenance guide

The **Habitat Banks** page (`/habitat-banks`) is the live hub. It's built on
Squarespace 7.1 (Fluid Engine) as a mix of **native blocks** (so Vix can edit
copy) and a few **self-contained Code Blocks** (for things Squarespace can't do
natively — the interactive map, the card enhancements, the design-heavy stat/step
bands). One **Custom CSS** block harmonises the type across all of it.

> Golden rule: paste each Code Block **in full**; edit the plain-text data/copy at
> the top of each file; re-paste to update. Nothing here needs a build step.

---

## 1. What's on the page, top to bottom

| Section | How it's built | File |
|---|---|---|
| Hero ("Find a Biofarm habitat bank" + eyebrow + lead) | **Native** text blocks | — |
| Search rail + interactive map | **Code Block** | `finder-block-INLINE.html` |
| Editorial card grid ("5 HABITAT BANKS" + sort + cards) | **Native Summary Block** over the blog, enhanced by the finder script | (Summary Block) |
| Portfolio at a glance + How it works | **Code Block** | `sections-block-INLINE.html` |
| "What is a habitat bank?" intro | **Native** text block | — |
| The three Basics pill-links | **Code Block** | `ilinks-block-INLINE.html` |
| Developer FAQ | **Native Accordion block** | — |
| Closing green CTA (copy) | **Native** text block | — |
| "Talk to us about your site" button | **Code Block** | `cta-button-block-INLINE.html` |
| Type consistency across the whole page | **Custom CSS** | `page-typography-fix.css` |

The blog collection is **`/habitat-banks-lists`** — 28 posts (5 registered banks +
23 coming-soon). The Summary Block renders them; the finder script decorates and
orders them.

---

## 2. The finder Code Block (`finder-block-INLINE.html`)

One self-contained block on `/habitat-banks`: Leaflet CSS/JS + all styles + data +
logic inline. It sits **above** one Summary Block pointed at the blog (Items = 30).

What the script does:
- Draws the **map** (5 bank catchments as LPA+NCA polygons + 23 pipeline dots).
- Builds the **search rail** (region + habitat filters, habitat pills, Search,
  Use-my-location, Reset) and filters map + cards together.
- Adds the **count + Sort bar** above the grid (Featured / Name A–Z / Units).
- Decorates each Summary card (eyebrow, stats, pills, CTA), pins **registered
  first**, shows the first **5 coming-soon** with a **"+N more"** reveal.
- **Guarantees the registered banks:** if the Summary Block didn't load one
  (pushed past the 30-item cap), the script redraws its card from `BF_BANKS`.

Two data lists live at the very top of the file:
- **`BF_BANKS`** — the 5 registered banks.
- **`PIPELINE_SITES`** — the 23 coming-soon sites.

### Layout notes baked into the finder
- Rail + map share a grid; `align-items:stretch` so the **map matches the rail
  height** (~536px). The map is **not** set to fill its Code Block (that made it
  grow to the whole section — see §6).
- Rail internals: dropdowns grouped, Search nudged down, roomy habitat pills, a
  hairline-framed "Use my location / Reset" footer.
- "See less" on the reveal scrolls the grid back into view (no page-bottom jump).

---

## 3. Custom CSS (`page-typography-fix.css`)

Paste into **Website → Website Tools → Custom CSS**. Scoped to this page only via
the body id `#collection-6a687c0d5a396e73c9b9ef10`, so nothing else is touched.
It harmonises the native blocks (which used theme typography) with the code
sections:
- section headings → one size + tight line-height (1.14)
- FAQ accordion questions → ~21px (were 26px)
- the "What is a habitat bank?" + FAQ section reading text → ~20px so the left
  column isn't dwarfed by the RATI FAQ questions
- body line-height → 1.65
- **eyebrows** — every native eyebrow is "a paragraph that is only a bold line",
  so `p strong:only-child` catches them all and makes them the small uppercase
  letter-spaced eyebrow.

> Section-scoped rules use **section IDs** (`6a6c5cf82414092afc69f09e` for the
> intro/FAQ section; the gap fix uses the map + grid section IDs). If a section is
> deleted/rebuilt its ID changes — swap the new ID in.

The editor does **not** preview site-wide Custom CSS — always check on the live
site with a hard refresh (Cmd/Ctrl+Shift+R), not in `/config`.

---

## 4. The other three Code Blocks

- **`sections-block-INLINE.html`** — Portfolio at a glance + How it works. No
  divider line between them (matches the design); no outer padding (the
  Squarespace section provides top/bottom spacing).
- **`ilinks-block-INLINE.html`** — the three Basics pill-links (BNG for developers
  / Ecology stories / Contact us). No margins — relies on Squarespace block spacing.
- **`cta-button-block-INLINE.html`** — the cream "Talk to us about your site"
  pill for the green CTA section.

All are scoped under `.bf-…` classes and can't clash with the finder or the site.

---

## 5. Adding / editing content

### Add a new REGISTERED bank
1. **Create the blog post** in the Habitat Banks blog: Status **Published**, tag
   **`Registered`**, featured image = the bank photo, clean **POST URL**
   (`/habitat-banks-lists/<slug>`).
2. **Grab the photo URL** (Asset Library, or `…/habitat-banks-lists?format=json`
   → the item's `assetUrl`).
3. **Add one line to `BF_BANKS`** in `finder-block-INLINE.html`:
   ```js
   { id:'b06', name:'New Bank', region:'south east', habitats:'meadow, scrub, hedgerow',
     lat:51.50, lng:-1.00, units:'120', area:'20 ha', where:'County · NCA area',
     url:'/habitat-banks-lists/new-bank', img:'https://images.squarespace-cdn.com/.../new-bank.jpg' },
   ```
   `region` ∈ `south east | south west | midlands | the north`.
4. **Re-paste the finder Code Block.** The bank now appears (first), on the map,
   in the filters, and is covered by the past-30 safety net.

### Add a new COMING-SOON site
1. **Create the blog post**: Published, tag **`Coming soon`**, featured image =
   `coming-soon-thumbnail.png`, clean POST URL, excerpt `In development · <LPA> · <NCA>`.
2. **Add one line to `PIPELINE_SITES`**:
   ```js
   {"name":"New Site","lpa":"Local Authority","nca":"National Character Area","region":"south east","lat":51.50,"lng":-1.00},
   ```
   (`name` must match the post title so the map pin links correctly.)
3. **Re-paste the finder Code Block.**

> **30-item cap:** registered banks are always guaranteed (safety net). Coming-soon
> *cards* load up to 30; past that, the oldest lose only their card tile — every
> pipeline site still shows on the map and keeps its page.

---

## 6. Section settings (Fluid Engine) — important

These are set in the editor, not code:
- **Fill Screen → OFF** on every section (map, grid, portfolio, FAQ, CTA).
  "Fill Screen" expands a section to the viewport height and is the #1 cause of
  giant empty gaps between sections.
- **Section Height → S**, **Alignment → Top** where content should hug the top.
- **Row Count** can't go below the lowest block — to shrink a section, first drag
  the **block's** bottom edge up, then Row Count frees up.
- Because the map is sized to the rail (~536px, §2), the finder Code Block hugs
  its content — you can size it freely without empty space or the map ballooning.

---

## 7. Deprecated / reference files (not used by the live build)

Earlier kit iterations, kept for reference only:
`page-habitat-banks.html`, `page-sleight-farm.html`, `page-coming-soon.html`,
`bf-hub-scripts.js`, `bf-sleight-scripts.js`, `bf-soon-scripts.js`, `bf-hub.css`,
`bf-map-only.js`, `map-block-*.html`, `header-injection.html`, `cards-custom-css.css`,
`_test-finder.html`, `ITEMS-CONTENT.md`. The **live build is the four `…-INLINE.html`
blocks + `page-typography-fix.css` + native blocks** described above.

---

## 8. Data sources & future work

- **Bank data** (units, area, LPA, NCA, catchments) — from the registered
  brochures; see `../BANK-DATA.md`.
- **Catchments** = LPA + NCA unions now (ONS LAD May-2025 + Natural England NCAs).
  **LNRS** becomes the legal basis ~2027 — regenerate then (approach in BANK-DATA.md).
- **Leaflet** from unpkg + CARTO/OSM tiles — fine at launch; swap to a keyed tile
  provider if traffic grows (one line: `tiles()` in the finder script).
---

## 9. Registered bank detail pages (e.g. `/habitat-banks/sleight-farm`)

Blog post bodies are **text-only** (no Code Block), so each registered bank gets a
**dedicated Page** — not a blog post. Sleight Farm is the built-out template; the
other four banks copy its recipe.

The page is **three stacked sections**, each a Code Block, matching the full
prototype (`../sleight-farm.html`) — hero, overview, location + two-tier catchment
map, unit table, land & legacy, 30-year stewardship, recovery timeline, species
recorded, gallery, resources, related banks, enquiry, closing CTA:

| Order | Section | File |
|---|---|---|
| 1 | Hero → Overview → Location intro | `sleight-detail-INLINE.html` (carries all shared CSS) |
| 2 | Two-tier SRM catchment map | `map-block-sleight-INLINE.html` |
| 3 | Units → Land → Stewardship → Timeline → Species → Gallery → Resources → Related → Enquiry → CTA | `sleight-detail-2-INLINE.html` |

Notes:
- All three blocks share the `.bf-bank` scope. **Block 1 holds the CSS for all
  three** — keep it first.
- Everything is styled self-contained (no dependency on `bf-hub.css`). Copy is
  plain text at the section level — edit in place.
- **Set Fill Screen → OFF** on all three sections (same as the hub, §6).
- **`data-todo` markers** flag what still needs real assets: bank/gallery/related
  photos (currently all point at the one Sleight hero image), the brochure &
  ecology-report **PDFs** (upload to Files → paste the `/s/…` links), the BGS
  register link, and the two Stories links. Search `data-todo` in both blocks.
- The **enquiry form** in Block 2 is design-only. For a working form, swap it for
  a native Squarespace **Form Block** (auto-connects to email/Sheets/CRM).
- **Wire the finder card → this page:** in `finder-block-INLINE.html`, each
  registered bank's `BF_BANKS.url` points at its detail page (Sleight =
  `/habitat-banks/sleight-farm`). The finder rewrites the Summary card's blog
  links to that URL and keeps matching via `data-bf-slug`.

**To build the next bank** (Lesnewth, Avon Meadows, Badger Bank, Rycote): copy the
three Sleight blocks, swap the copy/data/photos, reuse `map-block-<bank>-INLINE.html`
for section 2, create the Page at `/habitat-banks/<slug>`, and update that bank's
`BF_BANKS.url` in the finder.
