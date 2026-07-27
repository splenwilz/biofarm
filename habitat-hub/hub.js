/* Biofarm Habitat Bank Hub — Map + List interactivity:
   live filtering, sort, result count, and map <-> list sync.
   Depends on map.js exposing window.__hubMap (markers/rings by bank id). */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var form   = document.getElementById('hubFilter');
    var loc    = document.getElementById('fLoc');
    var hab    = document.getElementById('fHabitat');
    var units  = document.getElementById('fUnits');
    var sort   = document.getElementById('fSort');
    var count  = document.getElementById('resultCount');
    var noRes  = document.getElementById('noResults');
    var list   = document.querySelector('.bank-list');
    var cards  = Array.prototype.slice.call(document.querySelectorAll('.bank-card[data-bank]'));
    if (!form || !cards.length) return;

    // Each card is wrapped in .card-wrap (see compare init below) so the absolutely
    // positioned compare button rides with it. Filtering/sorting must target the wrap,
    // otherwise hidden cards leave their floating button behind. Falls back to the card
    // itself if the wrap hasn't been created yet.
    function wrapOf(c){ var p = c.parentNode; return (p && p.classList && p.classList.contains('card-wrap')) ? p : c; }

    function unitsMatch(v, band) {
      if (!band) return true;
      var p = band.split('-'); return v >= +p[0] && v <= +p[1];
    }
    function matches(card) {
      var q = (loc.value || '').trim().toLowerCase();
      if (q && (card.getAttribute('data-search') || '').indexOf(q) === -1) return false;
      if (hab.value && (card.getAttribute('data-habitats') || '').indexOf(hab.value) === -1) return false;
      if (units && !unitsMatch(+card.getAttribute('data-units'), units.value)) return false;
      return true;
    }

    function withMap(cb) {
      if (window.__hubMap) return cb(window.__hubMap);
      var el = document.querySelector('.leaflet-map');
      if (el) el.addEventListener('hubmapready', function () { cb(window.__hubMap); }, { once:true });
      else setTimeout(function () { withMap(cb); }, 150);
    }

    // toggle a marker + ring on/off the map
    function setVisible(hub, id, on) {
      var m = hub.markers[id], r = hub.rings[id];
      if (m) { on ? m.addTo(hub.map) : hub.map.removeLayer(m); }
      if (r) { on ? r.addTo(hub.map) : hub.map.removeLayer(r); }
    }

    function apply() {
      // Filter the cards first — this must work even if Leaflet never loads.
      var shown = 0;
      cards.forEach(function (c) {
        var ok = matches(c);
        wrapOf(c).style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      count.textContent = shown;
      noRes.classList.toggle('show', shown === 0);
      // Map ops are opportunistic — only if the map is ready.
      if (window.__hubMap) {
        var hub = window.__hubMap;
        cards.forEach(function (c) { setVisible(hub, c.getAttribute('data-bank'), wrapOf(c).style.display !== 'none'); });
        var pts = cards.filter(function (c) { return wrapOf(c).style.display !== 'none'; })
                       .map(function (c) { var m = hub.markers[c.getAttribute('data-bank')]; return m && m.getLatLng(); })
                       .filter(Boolean);
        if (pts.length) hub.map.flyToBounds(pts, { padding:[45,45], maxZoom:9, duration:.5 });
      }
    }

    function sortCards() {
      var v = sort.value;
      var arr = cards.slice();
      arr.sort(function (a, b) {
        if (v === 'units-desc') return (+b.getAttribute('data-units')) - (+a.getAttribute('data-units'));
        if (v === 'units-asc')  return (+a.getAttribute('data-units')) - (+b.getAttribute('data-units'));
        if (v === 'name') return a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent);
        return 0;
      });
      arr.forEach(function (c) { list.insertBefore(wrapOf(c), noRes); }); // reorder before the no-results/footnote
    }

    // events (debounce the text input so the map doesn't re-fit on every keystroke)
    var debTimer;
    form.addEventListener('submit', apply);
    ['input','change'].forEach(function (ev) { loc.addEventListener(ev, function () { clearTimeout(debTimer); debTimer = setTimeout(apply, 150); }); });
    [hab, units].forEach(function (el) { if (el) el.addEventListener('change', apply); });
    if (sort) sort.addEventListener('change', function () { sortCards(); });

    // map <-> list sync
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

    /* ===== Quick habitat chips ===== */
    var chips = Array.prototype.slice.call(document.querySelectorAll('#habChips .fchip'));
    function syncChips() { chips.forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-hab') === (hab.value || '')); }); }
    chips.forEach(function (c) { c.addEventListener('click', function () { hab.value = c.getAttribute('data-hab'); syncChips(); apply(); }); });
    hab.addEventListener('change', syncChips);

    /* ===== Reset filters ===== */
    var geo = document.getElementById('geoStatus');
    var resetBtn = document.getElementById('resetFilters');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      loc.value = ''; hab.value = ''; if (units) units.value = ''; if (sort) sort.value = 'default';
      syncChips(); if (geo) geo.textContent = ''; sortCards(); apply();
    });

    /* ===== Reset map view ===== */
    var resetMapBtn = document.getElementById('resetMap');
    if (resetMapBtn) resetMapBtn.addEventListener('click', function () {
      withMap(function (hub) {
        // Restore the same framing as initial load (banks + pipeline areas).
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
          cards.slice().sort(function (a, b) { return a.__dist - b.__dist; }).forEach(function (c) { list.insertBefore(wrapOf(c), noRes); });
          if (geo) geo.textContent = 'Nearest first from your location';
          if (sort) sort.value = 'default';
          try { L.marker([ulat, ulng], { title:'You' }).addTo(hub.map).bindPopup('You are here'); hub.map.flyTo([ulat, ulng], 8, { duration:.6 }); } catch (e) {}
        });
      }, function () { if (geo) geo.textContent = "Couldn't get your location."; });
    });

    /* ===== Compare tray + modal ===== */
    var selected = [], byCard = {}, btnById = {};
    function cardData(card) {
      var stat = card.querySelector('.bank-card__stats b');
      var habs = []; card.querySelectorAll('.chips .chip').forEach(function (ch) { habs.push(ch.textContent); });
      return { id:card.getAttribute('data-bank'), name:card.querySelector('h3').textContent,
        region:(card.querySelector('.bank-card__region').textContent || '').trim(), units:card.getAttribute('data-units'),
        area:stat ? stat.textContent : '—', habs:habs, img:(card.querySelector('img') || {}).src || '', href:card.getAttribute('href') };
    }
    cards.forEach(function (card) {
      var id = card.getAttribute('data-bank'); byCard[id] = card;
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'compare-toggle'; btn.textContent = '+ Compare';
      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleSel(id, btn); });
      btnById[id] = btn;
      var wrap = document.createElement('div'); wrap.className = 'card-wrap';
      card.parentNode.insertBefore(wrap, card); wrap.appendChild(card); wrap.appendChild(btn);
    });
    var tray = document.createElement('div'); tray.className = 'compare-tray';
    tray.innerHTML = '<div class="inner"><span class="lbl">Compare</span><div class="sel"></div><button class="btn btn--on-green" id="cmpOpen">Compare</button><button class="clear" id="cmpClear">Clear</button></div>';
    document.body.appendChild(tray);
    var modal = document.createElement('div'); modal.className = 'cmp-modal';
    modal.innerHTML = '<div class="cmp-modal__box"><div class="cmp-modal__head"><h2>Compare habitat banks</h2><button class="cmp-modal__close" aria-label="Close">&times;</button></div><div class="cmp-modal__body"></div></div>';
    document.body.appendChild(modal);
    var traySel = tray.querySelector('.sel');
    function toggleSel(id, btn) {
      var i = selected.indexOf(id);
      if (i >= 0) { selected.splice(i, 1); if (btn) { btn.classList.remove('is-on'); btn.textContent = '+ Compare'; } }
      else { if (selected.length >= 4) { if (geo) geo.textContent = 'Compare up to 4 at a time.'; return; } selected.push(id); if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Added'; } }
      renderTray();
    }
    function renderTray() {
      traySel.innerHTML = '';
      selected.forEach(function (id) {
        var d = cardData(byCard[id]);
        var chip = document.createElement('span'); chip.className = 'selchip'; chip.innerHTML = d.name + ' <button aria-label="Remove">&times;</button>';
        chip.querySelector('button').addEventListener('click', function () { toggleSel(id, btnById[id]); });
        traySel.appendChild(chip);
      });
      tray.classList.toggle('show', selected.length > 0);
      tray.querySelector('#cmpOpen').textContent = 'Compare (' + selected.length + ')';
    }
    tray.querySelector('#cmpClear').addEventListener('click', function () { selected.slice().forEach(function (id) { toggleSel(id, btnById[id]); }); });
    tray.querySelector('#cmpOpen').addEventListener('click', function () { if (selected.length) openModal(); });
    modal.querySelector('.cmp-modal__close').addEventListener('click', function () { modal.classList.remove('show'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('show'); });
    function openModal() {
      var data = selected.map(function (id) { return cardData(byCard[id]); });
      var thead = '<tr><th></th>' + data.map(function (d) { return '<th><img src="' + d.img + '" alt=""><div class="name">' + d.name + '</div></th>'; }).join('') + '</tr>';
      function row(label, fn) { return '<tr><td class="rowlbl">' + label + '</td>' + data.map(function (d) { return '<td>' + fn(d) + '</td>'; }).join('') + '</tr>'; }
      var body = '<table class="cmp-table"><thead>' + thead + '</thead><tbody>'
        + row('Region', function (d) { return d.region; })
        + row('Area', function (d) { return d.area; })
        + row('BNG units', function (d) { return d.units; })
        + row('Habitats', function (d) { return d.habs.map(function (h) { return '<span class="chip">' + h + '</span>'; }).join(''); })
        + row('', function (d) { return d.href && d.href !== '#' ? '<a class="btn btn--sm" href="' + d.href + '">View</a>' : '<span class="note-ph">Page to follow</span>'; })
        + '</tbody></table>';
      modal.querySelector('.cmp-modal__body').innerHTML = body;
      modal.classList.add('show');
    }
  });
})();
