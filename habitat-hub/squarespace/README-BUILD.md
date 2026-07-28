# Squarespace build guide — Biofarm Habitat Bank Hub

Approved direction: **Unified A** (search rail + hero map, editorial grid below).
This kit contains everything pre-adapted for Squarespace 7.1. Requires the
**Business plan or higher** (code blocks with JavaScript + per-page code injection).

## Kit contents
| File | Purpose |
|---|---|
| `page-habitat-banks.html` | Body for the main hub page (one Code Block) |
| `page-sleight-farm.html` | Body for the Sleight Farm bank page |
| `page-coming-soon.html` | Body for the coming-soon template (serves all 23 sites via `?site=`) |
| `bf-hub.css` | All styles, scoped under `.bf-hub` (no clashes with site styles) |
| `bf-hub-scripts.js` | JS bundle for the hub page (data + maps + filtering) |
| `bf-sleight-scripts.js` | JS bundle for the Sleight page |
| `bf-soon-scripts.js` | JS bundle for the coming-soon template |
| `header-injection.html` | Per-page header snippet (Leaflet + bundle) |

## Steps

### 1. Upload the shared files (once)
Website → Pages → Website Tools → **Custom CSS** → **Manage Custom Files** →
upload `bf-hub-scripts.js`, `bf-sleight-scripts.js`, `bf-soon-scripts.js`.
Click each uploaded file to get its `/s/...` URL — note them down.

### 2. Global CSS (once)
In the same **Custom CSS** panel, paste the whole of `bf-hub.css`.
(It's scoped under `.bf-hub`, so it cannot restyle the rest of the site.)
Delete the two `@font-face` lines at the top if RATI is already loaded site-wide.

### 3. Upload assets (once)
- Brochure PDFs → Custom Files → note each `/s/...` URL.
- Bank photography → upload via any image block once (or Asset Library) and copy URLs.

### 4. Create the pages
For each of the three pages:
1. Pages → **+** → **Blank Page**. Titles/slugs:
   - "Habitat Banks" → `/habitat-banks`
   - "Sleight Farm Habitat Bank" → `/sleight-farm`
   - "Coming Soon" → `/coming-soon` (keep out of navigation)
2. Edit page → add a single **Code Block** (HTML mode, "Display Source" OFF) →
   paste the matching `page-*.html` file in full.
3. Page Settings → **Advanced → Page Header Code Injection** → paste
   `header-injection.html`, replacing the placeholder src with the matching
   bundle URL from step 1.
4. Page Settings → **SEO** → title + description (copy from the prototype's
   `<title>`/meta description).

### 5. Fix the marked TODOs in the pasted HTML
Search each Code Block for `data-todo=` — every brochure link and image src is
marked. Replace with the Squarespace URLs from step 3, then delete the
`data-todo` attribute.

### 6. Replace the prototype forms with real ones
The enquiry / register-interest forms in the prototype are front-end only.
Delete the `<form>`/`<div class="enq-card">` markup from the Code Block and drop
a native **Form Block** in its place (storage: email + Google Sheets/Zapier).
On `/coming-soon`, add a hidden field or ask "Which site?" — Squarespace can't
read the `?site=` parameter into its own form fields.

### 7. Wire navigation
- Main nav: add the "Habitat Banks" page (replaces any old link).
- Retire the old Google-map "sites and coverage" embed at rollout (per Vix —
  the hub folds that functionality in).

### 8. Tune two offsets
Squarespace's header height differs from the prototype's. In Custom CSS adjust:
- `.filter-sticky{top:61px}` → the site header's actual height
- `.map-panel{top:96px}` → header height + ~35px
(If the site header isn't sticky, these can stay — they only matter mid-scroll.)

### 9. Test before linking anywhere
Pages are private until added to navigation. Check on desktop + phone:
- map loads, all 5 catchments + 23 pipeline dots visible, legend clear of zoom
- region dropdown filters cards AND map together
- coming-soon cards: 5 shown + "+18 more" reveal; each links to `/coming-soon?site=...`
- Sleight page: two-tier catchment (solid local + hatched neighbouring)
- form submissions arrive by email

### 10. Go live
Add "Habitat Banks" to the main navigation. Announce to Vix/Chris. Done.

## Notes
- **Leaflet from unpkg + OSM/CARTO tiles**: fine at launch; if traffic grows,
  swap to a keyed tile provider (one line in the bundle: `tiles()` in map.js).
- **LNRS layer**: legally effective ~2027 — regenerate catchments then
  (approach documented in BANK-DATA.md; boundaries come from the same services).
- **Updating bank/pipeline data later**: edit the `BANK_CATCHMENTS` /
  `PIPELINE_SITES` objects at the top of the uploaded bundle and re-upload —
  no page edits needed.
