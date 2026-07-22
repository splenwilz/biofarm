/* Biofarm Habitat Bank Hub — coming-soon site template.
   One page serves all pipeline sites: reads ?site=<slug> and populates from
   PIPELINE_SITES (catchments.js). Note: map.js is NOT loaded here — this page
   initialises its own single-site map. */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  // Shared slug rule (must match links from the hub cards / map popups).
  function slug(name){
    return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  var REGION_LABEL = { 'south east':'East & South East', 'south west':'South West',
                       'midlands':'Midlands', 'the north':'The North' };

  ready(function () {
    if (typeof PIPELINE_SITES === 'undefined') return;
    var want = new URLSearchParams(location.search).get('site') || '';
    var site = null;
    PIPELINE_SITES.forEach(function (p) { if (slug(p.name) === want) site = p; });
    site = site || PIPELINE_SITES[0]; // graceful fallback

    // text slots
    document.title = site.name + ' — coming soon | Biofarm habitat bank in development';
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', site.name + ' is a new Biofarm habitat bank in development in ' + site.lpa + '. Register interest for Biodiversity Net Gain units.');
    function set(id, txt){ var el = document.getElementById(id); if (el) el.textContent = txt; }
    set('crumbName', site.name);
    set('siteName', site.name);
    set('formSiteName', site.name);
    set('heroRegion', REGION_LABEL[site.region] || site.region);
    set('factLpa', site.lpa);
    set('factNca', site.nca);
    set('locCopy', site.name + ' sits within ' + site.lpa + ' and the ' + site.nca +
      ' National Character Area. Its full catchment — the areas where units will carry full value — will be confirmed when the site is registered.');

    // single-site map (muted tiles + stone pipeline dot)
    var el = document.getElementById('csMap');
    if (el && typeof L !== 'undefined') {
      var map = L.map(el, { scrollWheelZoom:false }).setView([site.lat, site.lng], 9);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom:19, subdomains:'abcd', attribution:'&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);
      L.marker([site.lat, site.lng], {
        icon: L.divIcon({ className:'', html:'<span class="ppin"></span>', iconSize:[14,14], iconAnchor:[7,7], popupAnchor:[0,-8] })
      }).addTo(map).bindPopup('<b>' + site.name + '</b><br>' + site.lpa + ' &middot; ' + site.nca +
        '<br><span style="color:#8a8f83;">Coming soon</span>');
      setTimeout(function () { map.invalidateSize(); }, 200);
    }

    // front-end-only interest form (matches the other prototypes)
    var form = document.getElementById('enqForm'), ok = document.getElementById('enqSuccess');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      form.style.display = 'none';
      if (ok) ok.classList.add('show');
    });
  });
})();
