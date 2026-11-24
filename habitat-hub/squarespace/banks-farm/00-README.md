# Banks Farm — coming-soon page build (copy of 24 Nov 2026)

Eighth coming-soon page, same pattern as Dennington Hall / Thoulstone. First of the four new
sites (24 Nov 2026).
⚠ POST: create in "Habitat Banks Lists" with title "Banks Farm", URL slug `banks-farm`
(the finder links to that slug; the brief's `/habitat-banks-lists/banks-farm` is that post).

## Post settings (Squarespace → Habitat Banks Lists → the post)
A "Banks Farm" post may already exist from the July batch of 23 coming-soon stubs (ITEMS-CONTENT.md
lists it: South West · Coming soon). If so, reuse it: keep the slug, replace its contents.

| Setting | Value |
|---|---|
| Title | Banks Farm |
| URL slug | `banks-farm` |
| Category | South West |
| Tag | Coming soon |
| Excerpt | In development · Somerset · Yeovil Scarplands |
| Featured (thumbnail) image | the hero photo (`banks-farm-habitat-bank-somerset-biofarm.jpg`), or `coming-soon-thumbnail.png` to match the other coming-soon posts |
| SEO title | Banks Farm Habitat Bank \| BNG Units Somerset \| Biofarm |
| SEO description | Explore Banks Farm, Biofarm's coming soon habitat bank near Shepton Mallet, Somerset. Discover habitat restoration plans and discuss future off-site BNG needs. |
| Status | Published |

Paste in order, one Code Block each:
**01-hero → 02-opportunity → 03-location → 04-map → 06-plan → 07-forward → 08-longview → 15-cta**

Set SEO title/description in the post settings (01-hero comment has both). Then re-paste on
the hub: `finder-block-INLINE.html` (Banks Farm added to the coming-soon list, card "27 ha
planned habitat bank", chips Traditional orchard / Neutral grassland / Mixed scrub / Hedgerows;
SOON_LIMIT raised to 8 so all cards show without a reveal) and `sections-block-INLINE.html`
(stat band reads 8 coming soon).

## Flags
1. **IMAGERY — prepared in `assets/`** from the four photos in the SharePoint folder (copied from
   Downloads/Banks Farm, 24 Nov):
   - `banks-farm-habitat-bank-somerset-biofarm.jpg` = "Woodland copse, field and hedgerow mosaics"
     (the brief's wide landscape: fields, hedgerows, copses), resized to 2400×917, 2.6:1. Wider than
     16:9, so the hero crops its sides on phones; the hedgerow line stays in frame.
   - `banks-farm-opportunity.jpg` = "Arable reversion to flower-rich natural regeneration" (ox-eye
     daisies, poppies, hills beyond), 4:5 crop at native height, 1536×1920. Illustrates the
     species-rich grassland plan.
   - Spares, not used: "Pond creation for flood mitigation and habitat" (ponds are not in the Banks
     Farm plan), "Scrub habitat" (moss-covered fallen tree; dark, winter).
   The photos are named generically, so the alt text describes the scene and the setting without
   asserting the exact field. CDN URLs WIRED (24 Nov): hero 0a2381f8…/banks-farm-habitat-bank-somerset-biofarm.jpg,
   opportunity 99eec700…/banks-farm-opportunity.jpg. Delete any upload image blocks on the post; the Code Blocks carry the images.
2. **Map pin is APPROXIMATE** — placed at Chesterblade hamlet (51.1694, -2.4857, Ordnance
   Survey place via postcodes.io), per the brief's "generalised location near Shepton Mallet in
   the Chesterblade Hills, without publishing the private address". Confirm with Biofarm.
3. **Map tiers** — solid = Somerset Council LPA + Yeovil Scarplands NCA; hatched = the seven
   neighbouring LPAs named in the copy + the seven NCAs sharing a boundary with the Yeovil
   Scarplands (Blackdowns, Blackmore Vale and Vale of Wardour, Dorset Downs and Cranborne Chase,
   Marshwood and Powerstock Vales, Mendip Hills, Mid Somerset Hills, Somerset Levels and Moors).
   ONS LAD May 2024 BGC + Natural England NCAs, simplified; OGL v3.
4. **Copy quirks honoured:** planning card has FIVE rows (LPA, NCA, neighbours, river catchment
   "Not confirmed; no watercourse units currently identified", Local Nature Recovery Strategy
   "Somerset LNRS"); opportunity section is five paragraphs; plan section has the copy's closing
   line under the table; long-view is heading + three paragraphs + "Care that continues";
   closing CTA links read Habitat Bank Hub / BNG for developers / Contact us per the brief.
   The LPA reads "Somerset Council" in the card and hero facts line (as written); the finder
   entry uses "Somerset" to match the other sites.
5. **Keywords** (brief, internal): primary "BNG units Somerset"; secondary "Off-site BNG Somerset",
   "biodiversity net gain Shepton Mallet", "habitat bank Somerset", "BNG units Mendips". The copy
   already carries them; nothing extra was added.
