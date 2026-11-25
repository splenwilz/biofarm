# The Vine — coming-soon page build (copy of 25 Nov 2026)

Eleventh coming-soon page, same pattern as Bodstone Barton Barnes / Beech Tor Farm / Banks Farm. Fourth
and last of the four new sites.
⚠ POST: a "The Vine" post exists from the July batch of coming-soon stubs (BANK-DATA.md: Midlands ·
Coming soon; hub-unified card `the-vine`). Reuse it, keep the slug `the-vine` (the finder links to that
slug; the brief's `/habitat-banks-lists/the-vine`).

## Post settings (Squarespace → Habitat Banks Lists → the post)

| Setting | Value |
|---|---|
| Title | The Vine |
| URL slug | `the-vine` |
| Category | Midlands (Chris's region list files The Vine under Midlands although it is in Worcestershire; finder region `midlands`, the same as Avon Meadows) |
| Tag | Coming soon |
| Excerpt | In development · Malvern Hills · Herefordshire Plateau |
| Featured (thumbnail) image | `coming-soon-thumbnail.png` (no site photo yet) |
| SEO title | The Vine Habitat Bank \| BNG Units Worcestershire \| Biofarm |
| SEO description | Explore The Vine, Biofarm's coming soon habitat bank near Tenbury Wells, Worcestershire. Discover orchard restoration plans and discuss future off-site BNG needs. |
| Status | Published |

Paste in order, one Code Block each:
**01-hero → 02-opportunity → 03-location → 04-map → 06-plan → 07-forward → 08-longview → 15-cta**

Then re-paste on the hub: `finder-block-INLINE.html` (The Vine added to the coming-soon list, card
"18.8 ha planned habitat bank", chips Traditional orchard / Grassland / Trees / Mixed scrub / Hedgerows;
SOON_LIMIT raised to 11) and `sections-block-INLINE.html` (stat band reads 11 coming soon).

## Flags
1. **IMAGERY — NO SITE PHOTO.** The SharePoint folder holds only the brand illustration "Watch this space
   grow…" (1756×1372 PNG) and the listing docx (no pictures). So:
   - **Hero has no image.** A test render with the illustration behind the title put two headlines on top
     of each other, and the striped "Coming soon" tile under the dark hero gradient read as a muddy band.
     Chris's rule (coming-soon-INLINE.html, 11 Aug 2026) is never a stand-in photo, so the hero sits on
     brand green (`style="background:#71977A"` on the section; the shared gradient darkens it). The
     `<img>` line is kept in the block's comment with the brief's filename
     `the-vine-habitat-bank-worcestershire.jpg` and alt text, ready to drop back in.
   - **Opportunity slot = the illustration**, saved as `assets/the-vine-opportunity.jpg` (JPEG of the PNG,
     native size; the 4:3 slot crops a sliver top and bottom). Swap for a real photo when one exists.
   CDN URL NOT YET WIRED: upload the illustration, paste the CDN URL into 02's `src`, re-paste 02.
2. **Map pin is APPROXIMATE** — Tenbury Wells town (52.3112, -2.5937, Ordnance Survey place via
   postcodes.io), per the brief's "generalised location near Tenbury Wells, without publishing the private
   address". The copy also names Kyre parish; Kyre Green hamlet is 52.2591, -2.5724 if Biofarm would
   rather pin the parish. Confirm with Biofarm.
3. **Map tiers** — solid = Malvern Hills LPA + Herefordshire Plateau NCA; hatched = the six neighbouring
   LPAs named in the copy (Forest of Dean, Herefordshire, Shropshire, Wyre Forest, Wychavon, Tewkesbury)
   + the NCAs sharing a boundary with the Herefordshire Plateau (Herefordshire Lowlands, Malvern Hills,
   Teme Valley). ONS LAD May 2024 BGC ("Herefordshire, County of" is ONS's name for the unitary) +
   Natural England NCAs, simplified; OGL v3. Shropshire and Herefordshire are large, so the hatched tier
   runs from the Welsh border to Gloucestershire.
4. **Copy quirks honoured:** planning card has FOUR rows (no river catchment row); the LNRS row is labelled
   "Local Nature Recovery Strategy (LNRS)" for consistency with the other cards although the copy omits
   "(LNRS)"; NCA shown as "Herefordshire Plateau (NCA 101)" as written; the plan table has SIX rows
   including "Ditches and watercourses … subject to survey and design"; opportunity is four paragraphs;
   the long view is three paragraphs; "Care that continues" is the shared one-paragraph wording.
5. **Keywords** (brief, internal): primary "BNG units Worcestershire"; secondary "Off-site BNG
   Worcestershire", "biodiversity net gain Tenbury Wells", "habitat bank Malvern Hills". The copy already
   carries them; nothing extra was added.
