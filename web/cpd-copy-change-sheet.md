# CPD page (/bng-cpd) · Vix's full copy, 6 Oct 2026 · build sheet

Vix's copy replaces almost everything on the live page. Section order below is the new page.
Native text unless a code block is named. All code blocks are in `web/`.

| # | Section (bg) | Blocks |
|---|---|---|
| 1 | **Hero** (dark hills photo, as now) | Eyebrow (small text): **Biodiversity Net Gain CPD** · H1: **Practical BNG knowledge for development teams** · three paragraphs (below) · one button **Arrange a CPD session** → `#arrange` |
| 2 | **CPD that earns its place in the diary** (cream) | H2 + three paragraphs (below). Split layout: H2 left, paragraphs right, as on the units page |
| 3 | **What we cover** (white) | H2 centred · Code Block `cpd-topics-block-INLINE.html` (six tiles, each with its description) |
| 4 | **Built around your team** (green, black text) | H2 + three paragraphs (below) |
| 5 | **What your team will take away** (white) | H2 centred · Code Block `cpd-takeaways-block-INLINE.html` (six takeaways, two columns, green ticks) |
| 6 | **What developers say** (green, soft-wave divider at the bottom) | Quote block, unchanged: Craig Cobham, Senior Project Manager, Newland Homes |
| 7 | **Arrange a complimentary CPD session** (cream) | Code Block `cpd-arrange-section-INLINE.html` (updated: new H2, new lead, button now "Arrange a CPD session") |

## Copy for the native blocks (verbatim)

**1 · Hero**
- Eyebrow: Biodiversity Net Gain CPD
- H1: Practical BNG knowledge for development teams
- BNG is now part of the development process but understanding what it means for an individual project, and the choices available, isn't always straightforward.
- Our complimentary CPD sessions give development teams the practical knowledge and tools to navigate BNG with greater clarity and confidence.
- From understanding the Biodiversity Metric and weighing up on-site and off-site options, to recognising where BNG can affect viability, planning and delivery, we make the detail useful and relevant to the decisions your team makes every day.
- Button: Arrange a CPD session

**2 · CPD that earns its place in the diary**
- Professional development matters. So does making the time spent on it worthwhile.
- Our sessions are built around the realities of development rather than BNG in theory. We share what we're seeing across live projects, planning authorities and the off-site market, and turn that into practical knowledge your team can use.
- Every session is tailored to your business, your team and your level of BNG knowledge. Bring your questions and, where useful, your live projects too.

**4 · Built around your team**
- There's no one-size-fits-all session.
- We can introduce BNG to a wider development team, go deeper with planning and technical teams, or focus the conversation around specific challenges and live projects.
- Sessions are designed for developers, promoters, house builders, planners, architects, landscape architects and other professionals involved in development.

## What comes OFF the live page
- Hero H1 "Complimentary virtual Biodiversity Net Gain CPD for development teams" and both old paragraphs.
- **"Email us" secondary button** — not in Vix's copy (one CTA only). Remove unless Vix wants it kept.
- **Facts row (Format / Cost / Content)** — not in Vix's copy. Remove unless Vix wants it kept; `cpd-hero-facts-block-INLINE.html` stays in the repo if so.
- "Sessions cover" H2 + "Created for developers, promoters…" lead → replaced by "What we cover" (the audience line now lives in section 4).
- The green "Arrange a session for your team" tile — dropped; the grid is now exactly Vix's six topics.
- Old Arrange H2/lead ("Get in touch to arrange a tailored BNG CPD session for your business.").

## SEO (page settings) — suggested to match the new H1
- Title: Biodiversity Net Gain CPD | Practical BNG knowledge for development teams | Biofarm
- Description: Complimentary CPD sessions giving development teams practical BNG knowledge: the Biodiversity Metric, on-site and off-site options, viability and the off-site market. Arrange a session.

## Questions for Vix
1. "Biofarm CPD (1).pdf" appears as a line in the copy after the testimonial — is that an attachment note, or should the page link to the PDF (e.g. a "Download the CPD overview" link under the quote)?
2. Keep the single hero CTA, or also keep "Email us"?
3. Keep or drop the Format / Cost / Content facts row?
