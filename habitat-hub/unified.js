/* Biofarm Habitat Bank Hub — Unified page:
   search rail + real map on top, editorial card grid below.
   Filtering/sort/count + two-way map <-> grid sync via window.__hubMap (map.js).
   No compare tray — dropped with the compare concept. */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var form  = document.getElementById('hubFilter'),
        loc   = document.getElementById('fLoc'),
        hab   = document.getElementById('fHabitat'),
        units = document.getElementById('fUnits'),
        sort  = document.getElementById('fSort'),
        count = document.getElementById('resultCount'),
        noRes = document.getElementById('noResults'),
        grid  = document.getElementById('edGrid'),
        geo   = document.getElementById('geoStatus');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.ed-card[data-bank]'));
    if (!form || !cards.length) return;

    function withMap(cb) {
      if (window.__hubMap) return cb(window.__hubMap);
      var el = document.querySelector('.leaflet-map');
      if (el) el.addEventListener('hubmapready', function () { cb(window.__hubMap); }, { once:true });
      else setTimeout(function () { withMap(cb); }, 150);
    }
    function setVisible(hub, id, on) {
      var m = hub.markers[id], r = hub.rings[id];
      if (m) { on ? m.addTo(hub.map) : hub.map.removeLayer(m); }
      if (r) { on ? r.addTo(hub.map) : hub.map.removeLayer(r); }
    }

    // Pipeline ("coming soon") cards: shown alongside registered banks, filter by
    // region only (no confirmed habitats/units yet) and never counted as registered.
    // Capped at SOON_LIMIT with a "+N more" reveal card so pipeline never floods the grid.
    function isSoon(c){ return c.hasAttribute('data-pipeline'); }
    var SOON_LIMIT = 5, soonExpanded = false;
    var moreBtn = document.getElementById('soonMore');
    if (moreBtn) moreBtn.addEventListener('click', function () { soonExpanded = !soonExpanded; apply(); });
    function updateMoreBtn(hidden, shown){
      if (!moreBtn) return;
      if (hidden > 0) {
        moreBtn.style.display = '';
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.innerHTML = '<span class="big">+' + hidden + '</span><span class="lbl">more coming soon</span><span class="cta">See all &rarr;</span>';
      } else if (soonExpanded && shown > SOON_LIMIT) {
        moreBtn.style.display = '';
        moreBtn.setAttribute('aria-expanded', 'true');
        moreBtn.innerHTML = '<span class="lbl">Showing all coming soon</span><span class="cta">Show fewer &uarr;</span>';
      } else {
        moreBtn.style.display = 'none';
      }
    }
    function unitsMatch(v, band){ if (!band) return true; var p = band.split('-'); return v >= +p[0] && v <= +p[1]; }
    function matches(c){
      var q = (loc.value || '').trim().toLowerCase();
      if (isSoon(c)) {
        if (hab.value || (units && units.value)) return false;
        return !q || (c.getAttribute('data-search') || '').indexOf(q) !== -1;
      }
      if (q && (c.getAttribute('data-search') || '').indexOf(q) === -1) return false;
      if (hab.value && (c.getAttribute('data-habitats') || '').indexOf(hab.value) === -1) return false;
      if (units && !unitsMatch(+c.getAttribute('data-units'), units.value)) return false;
      return true;
    }
    function apply(){
      // Filter the cards first — works even if Leaflet never loads.
      var n = 0, visible = 0, soonShown = 0, soonHidden = 0;
      cards.forEach(function (c) {
        var ok = matches(c);
        if (ok && isSoon(c)) {
          if (!soonExpanded && soonShown >= SOON_LIMIT) { ok = false; soonHidden++; }
          else soonShown++;
        }
        c.style.display = ok ? '' : 'none';
        if (ok) { visible++; if (!isSoon(c)) n++; }
      });
      count.textContent = n;
      noRes.classList.toggle('show', visible === 0);
      updateMoreBtn(soonHidden, soonShown);
      // Map ops are opportunistic — only if the map is ready.
      if (window.__hubMap) {
        var hub = window.__hubMap;
        cards.forEach(function (c) { setVisible(hub, c.getAttribute('data-bank'), c.style.display !== 'none'); });
        var pts = cards.filter(function (c) { return c.style.display !== 'none'; })
                       .map(function (c) { var m = hub.markers[c.getAttribute('data-bank')]; return m && m.getLatLng(); })
                       .filter(Boolean);
        if (pts.length) hub.map.flyToBounds(pts, { padding:[45,45], maxZoom:9, duration:.5 });
      }
    }
    function sortCards(){
      var v = sort.value, arr = cards.filter(function (c) { return !isSoon(c); });
      arr.sort(function (a, b) {
        if (v === 'units-desc') return (+b.getAttribute('data-units')) - (+a.getAttribute('data-units'));
        if (v === 'units-asc')  return (+a.getAttribute('data-units')) - (+b.getAttribute('data-units'));
        if (v === 'name') return a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent);
        return 0;
      });
      arr.forEach(function (c) { grid.appendChild(c); });
      cards.forEach(function (c) { if (isSoon(c)) grid.appendChild(c); }); // pipeline always last
      if (moreBtn) grid.appendChild(moreBtn);
    }

    // events (debounce the text input so the map doesn't re-fit on every keystroke)
    var debTimer;
    form.addEventListener('submit', apply);
    ['input','change'].forEach(function (ev) { loc.addEventListener(ev, function () { clearTimeout(debTimer); debTimer = setTimeout(apply, 150); }); });
    [hab, units].forEach(function (el) { if (el) el.addEventListener('change', apply); });
    if (sort) sort.addEventListener('change', sortCards);

    /* ===== Quick habitat chips ===== */
    var chips = Array.prototype.slice.call(document.querySelectorAll('#habChips .fchip'));
    function syncChips(){ chips.forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-hab') === (hab.value || '')); }); }
    chips.forEach(function (c) { c.addEventListener('click', function () { hab.value = c.getAttribute('data-hab'); syncChips(); apply(); }); });
    hab.addEventListener('change', syncChips);

    /* ===== Reset filters ===== */
    var resetBtn = document.getElementById('resetFilters');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      loc.value = ''; hab.value = ''; if (units) units.value = ''; if (sort) sort.value = 'default';
      soonExpanded = false;
      syncChips(); if (geo) geo.textContent = ''; sortCards(); apply();
    });

    /* ===== Reset map view (same framing as initial load: banks + pipeline) ===== */
    var resetMapBtn = document.getElementById('resetMap');
    if (resetMapBtn) resetMapBtn.addEventListener('click', function () {
      withMap(function (hub) {
        if (hub.bounds) return hub.map.flyToBounds(hub.bounds, { padding:[45,45], duration:.5 });
        var pts = cards.map(function (c) { var m = hub.markers[c.getAttribute('data-bank')]; return m && m.getLatLng(); }).filter(Boolean);
        if (pts.length) hub.map.flyToBounds(pts, { padding:[45,45], duration:.5 });
      });
    });

    /* ===== Use my location (distance sort) ===== */
    var useLocBtn = document.getElementById('useLoc');
    function haversine(a, b, c, d) {
      var R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180;
      var s = Math.sin(x/2)*Math.sin(x/2) + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
    }
    if (useLocBtn) useLocBtn.addEventListener('click', function () {
      if (!navigator.geolocation) { if (geo) geo.textContent = 'Location not supported.'; return; }
      if (geo) geo.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        withMap(function (hub) {
          var ulat = pos.coords.latitude, ulng = pos.coords.longitude, byId = {};
          hub.banks.forEach(function (b) { byId[b.id] = b; });
          cards.forEach(function (c) { var b = byId[c.getAttribute('data-bank')]; c.__dist = b ? haversine(ulat, ulng, b.lat, b.lng) : 1e9; });
          cards.slice().sort(function (a, b) { return a.__dist - b.__dist; }).forEach(function (c) { if (!isSoon(c)) grid.appendChild(c); });
          cards.forEach(function (c) { if (isSoon(c)) grid.appendChild(c); }); // pipeline always last
          if (moreBtn) grid.appendChild(moreBtn);
          if (geo) geo.textContent = 'Nearest first from your location';
          if (sort) sort.value = 'default';
          try { L.marker([ulat, ulng], { title:'You' }).addTo(hub.map).bindPopup('You are here'); hub.map.flyTo([ulat, ulng], 8, { duration:.6 }); } catch (e) {}
        });
      }, function () { if (geo) geo.textContent = "Couldn't get your location."; });
    });

    /* ===== Map <-> grid sync ===== */
    withMap(function (hub) {
      cards.forEach(function (card) {
        var id = card.getAttribute('data-bank');
        var m = hub.markers[id];
        if (!m) return;
        card.addEventListener('mouseenter', function () {
          m.openPopup();
          var ic = m.getElement && m.getElement(); var dot = ic && ic.querySelector('.bpin');
          if (dot) dot.classList.add('is-hi');
        });
        card.addEventListener('mouseleave', function () {
          var ic = m.getElement && m.getElement(); var dot = ic && ic.querySelector('.bpin');
          if (dot) dot.classList.remove('is-hi');
        });
        m.on('click', function () {
          cards.forEach(function (c) { c.classList.remove('is-active'); });
          card.classList.add('is-active');
          card.scrollIntoView({ behavior:'smooth', block:'center' });
          setTimeout(function () { card.classList.remove('is-active'); }, 2400);
        });
      });
    });
  });
})();
