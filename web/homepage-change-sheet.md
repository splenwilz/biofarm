# Homepage — refresh change sheet (Web Copy v3 §1)

Prototype: `web/index-refresh.html` — this is the **live homepage's own markup with the new copy
transplanted in**. Nothing is redesigned: every section keeps its live styling, theme and imagery;
only text changes. The two new components are clones of live sections (the 4-column band and the
single-heading strip), so they already match the site. Scripts are stripped for standalone preview.

Page settings: SEO title *Biofarm | Biodiversity Net Gain and Habitat Banks*; description/OG as in the
prototype head; JSON-LD (Organization + WebSite + WebPage + BreadcrumbList — no FAQPage) → Page
Settings → Advanced → Header Code Injection.

| # | Live section | Action | In the editor |
|---|---|---|---|
| 1 | Hero (illustrated canvas) | **Rewrite copy** | H1 gets its full stop. Replace the H3 with *"Nature is changing…"*, add the two paragraphs and bold *"Every biodiversity unit starts with a Biofarm habitat."* below it in the same text block. Buttons unchanged (TALK TO OUR TEAM / EXPLORE OUR HABITAT BANKS). Canvas image unchanged. |
| 2 | — | **New (clone of §15 "team" section, light theme)** | **"Creating better places together."** — text block: lead + 3 paragraphs + bold *"Because better places benefit everyone."* No button. Insert after the hero. |
| 3 | — | **New (clone of the "Our growing community" strip, white)** | Heading strip **"You build. We restore."** + the one-line intro. Insert before the black Developers/Landowners section. |
| 4 | Black "Developers / Landowners" | **Rewrite** | H1s → *For Developers* / *For Landowners*; under each add the bold line + paragraph; buttons → **EXPLORE DEVELOPERS** (/developers) and **EXPLORE LANDOWNERS** (/landowners). Photos unchanged. |
| 5 | — | **New (heading strip clone, green + clone of the 4-column band, green, photos removed)** | **"How Biofarm works."** + two statement lines; then the four stages *We find the land / We create habitats / We support development / We look after what we create*, each with its line. Insert before the marquee. |
| 6 | "No wild claims" marquee | **Retain** | Unchanged. |
| 7 | — | **New (clone of the team section, light)** | The four "No wild claims" paragraphs: *"This is not simply about meeting planning requirements."* … ending with heading-style *"It's why we do what we do."* Insert after the marquee. |
| 8 | — | **New (heading strip clone, light)** | **"Explore"** + intro line, before the 4-column band. |
| 9 | 4-column band "Winning with you / Secure investment / Change-makers / Leave a legacy" | **Repurpose as the Explore cards** | Same block, same four photos. Titles → Biodiversity Net Gain / Biodiversity Units / Biodiversity Metric / Habitat Banks; texts per prototype; add a *Learn more →* link under each (→ /biodiversity-net-gain, /biodiversity-units, /biodiversity-metric; *Explore Habitat Banks →* → /habitat-banks). |
| 10 | "Our growing community" strip | **Rewrite** | → **"Trusted by developers. Valued by landowners."** |
| 11 | Logo carousel | **Retain** | Unchanged. |
| 12 | "National by nature, local by design" + map | **Rewrite** | Heading gets full stops; H3 → *"Nature is local…"*; add the two paragraphs; SEE SITES → **EXPLORE OUR HABITAT BANKS** (/habitat-banks). Map unchanged. |
| 13 | — | **New (heading strip clone, green)** | **"What our clients say."** before the testimonials. |
| 14 | Testimonials (9) | **Reorder** | Swap slots 3 and 4 so the order runs developer → landowner → developer → landowner: Hayfield Homes, Justin (Elmbridge), Wavensmere Homes, Richard (North Yorkshire), then Simon, Alain, Wrenbridge, Acorn, Avon Fire & Rescue. Text-only swap — blocks stay put. |
| 15 | "Work with people who get it" (black) | **Rewrite** | H4 → *"Behind every habitat is a team…"*; H2 → **"Meet the team behind Biofarm."**; button → **MEET THE TEAM** (/about). |
| 16 | "Let's bring your plans to life" (green) | **Rewrite** | H2 → **"Let's create something that lasts."**; H3 → *"Whether you're planning…"*; add the *"Together, we can create…"* paragraph and a **TALK TO OUR TEAM** link/button → /contact. |
| 17–18 | Newsletter sign-up, footer | **Retain** | Unchanged. |

Nothing from the live page is removed. Navigation: keep **Habitat Banks** as a top-level item (doc end note). Confirm `/landowners` exists.
