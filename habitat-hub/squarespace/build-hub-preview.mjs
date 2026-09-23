// Assembles hub-preview.html — a LOCAL preview of the updated Habitat Hub page —
// from the CURRENT paste blocks, so the design can be eyeballed before pasting into
// Squarespace. Re-run after editing any block:  node build-hub-preview.mjs
//
// Mocked here (native Squarespace parts): hero, finder intro, FAQ accordion, closing
// green section, the summary-card grid layout. Real (read from disk, byte-identical
// to what gets pasted): finder, match-cta, sections, ilinks, cta-button blocks +
// cards-custom-css. The finder synthesizes the 5 registered cards itself; the 7
// coming-soon posts are mocked, plus one deliberately-removed site (Cookridge) to
// prove the hide-unmatched rule works.
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const finder  = read('./finder-block-INLINE.html');
const match   = read('./match-cta-block-INLINE.html');
const sections= read('./sections-block-INLINE.html');
const ilinks  = read('./ilinks-block-INLINE.html');
const ctaBtn  = read('./cta-button-block-INLINE.html');
const cardCss = read('./cards-custom-css.css');

const soon = [
  ['Broadlands','broadlands'], ['Highfold','highfold'], ['Worth Abbey','worth-abbey'],
  ['Dennington','dennington'], ['Thoulstone','thoulstone'],
  ['Arthur Rickwood','arthur-rickwood'], ['The Priory','the-priory'],
  // removed-from-launch site: must be auto-hidden by the finder's unmatched rule
  ['Cookridge (should be hidden)','cookridge'],
];
const card = ([title, slug]) => `
  <div class="summary-item summary-item-record-type-text">
    <a class="summary-thumbnail-container" href="/habitat-banks-lists/${slug}">
      <img class="summary-thumbnail-image" src="coming-soon-thumbnail.png" alt="${title}"/></a>
    <div class="summary-content">
      <div class="summary-title"><a class="summary-title-link" href="/habitat-banks-lists/${slug}">${title}</a></div>
      <div class="summary-excerpt"><p>Mock excerpt — decorate() should hide this.</p></div>
    </div>
  </div>`;

const faq = [
  ['What is a BNG habitat bank?', `A BNG habitat bank is land that is legally secured and managed to create or enhance habitats for nature. The biodiversity improvements generate units that developers can purchase to meet off-site BNG requirements.<br/><br/>Biofarm develops and operates habitat banks, taking responsibility for delivery, management, monitoring and reporting for at least 30 years.`],
  ['What does &ldquo;coming soon&rdquo; mean?', `Coming soon sites are locations where Biofarm has an agreement in place with the landowner and which form part of our habitat bank development pipeline.<br/><br/>If a site is relevant to your development, we can assess what is needed and whether the anticipated timeline could work for your project.`],
  ['Can I enquire about a coming soon habitat bank?', `Yes. Tell us where your development is and what you expect to need. We can assess the site&rsquo;s suitability and give you a realistic view of timing.`],
  ['Can units from a coming soon site be allocated immediately?', `Units cannot be formally allocated until the habitat bank has completed the necessary legal and registration requirements. Speak to us early and we can assess whether the site could be progressed in time to support your project.`],
  ['Is the closest habitat bank always the most suitable?', `Not necessarily. The right solution will depend on your development location, habitat and unit requirements, applicable trading rules and current availability. Our team can assess your complete requirement and identify the most suitable route.`],
  ['What if there is no suitable habitat bank shown in my area?', `Tell us where your development is and what units you need. The map shows our current registered and coming soon sites, but it is not the limit of what we can deliver.<br/><br/>We can explore existing supply, bring together units from different sites and habitat types under one agreement, or assess whether a pipeline site could be progressed for your project.`],
].map(([q,a]) => `
    <details><summary>${q}</summary><div class="fa">${a}</div></details>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hub Preview</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body{margin:0;background:#fff;font-family:'Inter',Arial,sans-serif;color:#212121;}
  .pv-banner{position:sticky;top:0;z-index:2000;background:#212121;color:#F5F6F1;font-size:12px;letter-spacing:.06em;padding:8px 16px;text-align:center;}
  .sq-section{padding:clamp(36px,5vw,72px) 0;}
  .sq-wrap{max-width:1320px;margin:0 auto;padding-inline:clamp(18px,3.2vw,44px);}
  .band-cream{background:#F5F6F1;} .band-green{background:#71977A;}
  /* ---- HERO: replica of the LIVE hub hero (Partners-style two-column: text left,
     breeze-block/flowers/butterfly collage right) carrying the v3 copy. ---- */
  @font-face{font-family:'RATI';src:url('https://static1.squarespace.com/static/6818f9d9bff1414041f33bf3/t/6824c94beed6e10aa5f3a5c5/1747241291677/BauhausRatiDisplay-ExtraLight.otf') format('opentype');font-weight:300;font-display:swap;}
  .hub-hero{padding-block:clamp(48px,7vw,110px) clamp(28px,4vw,56px);}
  .hub-hero .hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(24px,4vw,64px);align-items:center;}
  .hub-hero .eyebrow{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;letter-spacing:.14em;font-size:.92rem;font-weight:600;color:#71977A;margin:0 0 1.6rem;}
  .hub-hero h1{font-family:'RATI','Inter',Georgia,serif;font-weight:300;font-size:clamp(3rem,6.3vw,6.1rem);line-height:1.12;letter-spacing:-.01em;margin:0 0 .35em;max-width:15ch;}
  .hub-hero p.lead{font-family:'RATI','Inter',Georgia,serif;font-weight:300;font-size:clamp(1.4rem,2.3vw,2.2rem);line-height:1.4;color:#212121;margin:0 0 .9em;max-width:24ch;}
  .hub-hero p.body{font-family:'Inter',sans-serif;font-size:1.02rem;line-height:1.75;color:#212121;max-width:52ch;margin:0;}
  .hub-hero .hero-art img{width:100%;max-width:640px;height:auto;display:block;margin-left:auto;}
  @media(max-width:860px){.hub-hero .hero-grid{grid-template-columns:1fr;}.hub-hero .hero-art img{margin:0 auto;max-width:440px;}}
  .pv-h2{font-family:'RATI_v2',Georgia,serif;font-weight:300;font-size:clamp(1.7rem,3.4vw,2.4rem);line-height:1.13;margin:0 0 .4em;}
  .pv-intro p{font-size:1.02rem;color:#5b5f57;max-width:62ch;line-height:1.65;margin:0 0 26px;}
  /* ---- summary grid stand-in (Squarespace lays this out natively) ---- */
  .summary-item-list{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:26px;}
  .summary-item img.summary-thumbnail-image{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;}
  @media(max-width:900px){.summary-item-list{grid-template-columns:1fr 1fr;}}
  @media(max-width:600px){.summary-item-list{grid-template-columns:1fr;}}
  /* ---- native FAQ accordion stand-in ---- */
  .pv-faq details{border-top:1px solid rgba(33,33,33,.14);padding:18px 4px;}
  .pv-faq details:last-of-type{border-bottom:1px solid rgba(33,33,33,.14);}
  .pv-faq summary{cursor:pointer;font-size:1.15rem;font-weight:400;font-family:'Inter',sans-serif;list-style:none;display:flex;justify-content:space-between;align-items:center;}
  .pv-faq summary::after{content:'+';font-size:1.5rem;color:#71977A;}
  .pv-faq details[open] summary::after{content:'\\2212';}
  .pv-faq .fa{padding:14px 0 4px;color:#5b5f57;line-height:1.7;max-width:70ch;}
  .pv-faq .pv-ilinks-home{margin-top:30px;}
  /* ---- closing green section stand-in ---- */
  .pv-close{text-align:center;color:#fff;}
  .pv-close .bf-eyebrow{letter-spacing:.02em;font-size:.82rem;font-weight:700;color:#F5F6F1;opacity:.85;margin:0 0 1rem;}
  .pv-close h2{font-family:'RATI_v2',Georgia,serif;font-weight:300;font-size:clamp(2rem,4.4vw,3.2rem);line-height:1.1;margin:0 0 .4em;}
  .pv-close p{max-width:52ch;margin:0 auto 30px;line-height:1.7;font-size:1.05rem;}
  /* card css is scoped to the live collection id; the wrapper below carries it */
  ${cardCss.replace(/\/\*[\s\S]*?\*\//, '')}
</style></head>
<body>
<div class="pv-banner">LOCAL PREVIEW — hub v3 blocks assembled from the repo · native sections are stand-ins · ${new Date().toISOString().slice(0,10)}</div>
<div id="collection-6a687c0d5a396e73c9b9ef10">

  <!-- HERO — replica of the LIVE hub hero (text left, collage right) with the v3 copy -->
  <section class="hub-hero band-cream"><div class="sq-wrap">
    <div class="hero-grid">
      <div>
        <p class="eyebrow">Our habitat bank coverage</p>
        <h1>Find BNG units near your development</h1>
        <p class="lead">Search our habitat banks across England.</p>
        <p class="body">Our sites are strategically located to give you a clearer route to locally relevant, high integrity, off-site BNG.</p>
      </div>
      <div class="hero-art">
        <img src="https://images.squarespace-cdn.com/content/v1/6818f9d9bff1414041f33bf3/4cb911b8-3a1a-4fef-9a87-18dbb804a91e/Biofarm+BNG+Breeze+Block+Flowers+Butterfly+Collage?format=1500w" alt="Cowslip flowers and a white butterfly growing from a breeze block" />
      </div>
    </div>
  </div></section>

  <!-- [NATIVE stand-in] finder intro + [CODE] FINDER + cards + [CODE] MATCH-CTA -->
  <div class="sq-section"><div class="sq-wrap pv-intro">
    <h2 class="pv-h2">Find the right habitat bank</h2>
    <p>Search by region or use your development location to explore registered habitat banks for live requirements and coming soon sites that can be progressed to meet your project&rsquo;s needs.</p>
    ${finder}
    <div class="summary-block-wrapper"><div class="summary-item-list">${soon.map(card).join('')}</div></div>
    <div style="height:clamp(36px,5vw,64px)"></div>
    ${match}
  </div></div>

  <!-- [CODE] SECTIONS (coverage stats + steps) -->
  <div class="sq-section band-cream"><div class="sq-wrap">${sections}</div></div>

  <!-- [NATIVE stand-in] FAQ + [CODE] ILINKS -->
  <div class="sq-section pv-faq"><div class="sq-wrap">
    <h2 class="pv-h2">Frequently asked questions</h2>${faq}
    <div class="pv-ilinks-home">${ilinks}</div>
  </div></div>

  <!-- [NATIVE stand-in] CLOSING + [CODE] CTA BUTTON -->
  <div class="sq-section band-green pv-close"><div class="sq-wrap">
    <p class="bf-eyebrow">National by nature, local by design</p>
    <h2>Building where you&rsquo;re building</h2>
    <p>Tell us where your development is and what you need. We&rsquo;ll assess our registered and coming soon sites and find the clearest route forward.</p>
    ${ctaBtn}
  </div></div>

</div></body></html>`;

writeFileSync(new URL('./hub-preview.html', import.meta.url), html);
console.log('wrote hub-preview.html (' + Math.round(html.length/1024) + ' KB)');
