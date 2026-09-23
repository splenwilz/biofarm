# Badger Bank Farm — lean page build (v3 copy, 23 Sep 2026)

Same lean structure as Sleight. Paste each file into its own Code Block on the
`badger-bank-farm` blog post, in this order:

**01-hero → 02-overview → 03-location → 04-map → 06-units → 08-stewardship → 12-resources → 15-cta**

Then in the post settings set SEO title/description (in 01-hero's header comment)
and hide/delete any old body content. The collection injection styles everything.

## Before it can go live
1. **Upload the FINAL brochure** (from Vix's Drive "FINAL BROCHURES FOR REGISTERED SITES")
   to Squarespace Files with EXACTLY this filename:
   `Biofarm-Habitat-Bank-Brochure-Badger-Bank-Farm_FINAL.pdf`
   — the hero/resources/CTA links all point at it and 404 until then.
2. **Site photography** — DONE in code. Upload the two prepared files in `assets/`
   (`badger-bank-hero.jpg`, `badger-bank-overview.jpg`) to Squarespace Files with those
   exact names; the blocks already point at `/s/badger-bank-hero.jpg` etc.
   Source: SharePoint "Badger Bank/Imagery" (hero = IMG_4574 cropped to the water/fields
   band; overview = IMG_4561 bluebell woodland). Spare: IMG_4565 (bluebell path with new
   tree guards); Richard+dog portrait kept aside for a future landowner story.
3. **Map boundaries** — the map shows pin + an indicative dashed circle (honest interim).
   Generating the real North Yorkshire LPA + Southern Magnesian Limestone NCA polygons
   (same ONS/NE pipeline as Sleight's map) restores the solid/hatched key from the copy.
