/* Biofarm Habitat Bank Hub — Map-first concept: immersive map <-> drawer sync + filtering.
   Uses window.__hubMap (exposed by map.js in data-mode="all"). */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var form  = document.getElementById('mfFilter'),
        loc   = document.getElementById('fLoc'),
        hab   = document.getElementById('fHabitat'),
        units = document.getElementById('fUnits'),
        count = document.getElementById('drawerCount');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.mf-card[data-bank]'));
    if (!cards.length) return;

    // Each card is wrapped in .card-wrap (compare init below); filter on the wrap so hidden
    // cards don't leave their absolutely-positioned compare button behind in the drawer.
    function wrapOf(c){ var p = c.parentNode; return (p && p.classList && p.classList.contains('card-wrap')) ? p : c; }

    function withMap(cb) {
      if (window.__hubMap) return cb(window.__hubMap);
      var el = document.querySelector('.leaflet-map');
      if (el) el.addEventListener('hubmapready', function () { cb(window.__hubMap); }, { once:true });
      else setTimeout(function () { withMap(cb); }, 150);
    }
    function dot(m){ var ic = m.getElement && m.getElement(); return ic && ic.querySelector('.bpin'); }

    function unitsMatch(v, band){ if (!band) return true; var p = band.split('-'); return v >= +p[0] && v <= +p[1]; }
    function matches(c){
      var q = (loc.value || '').trim().toLowerCase();
      if (q && (c.getAttribute('data-search') || '').indexOf(q) === -1) return false;
      if (hab.value && (c.getAttribute('data-habitats') || '').indexOf(hab.value) === -1) return false;
      if (!unitsMatch(+c.getAttribute('data-units'), units.value)) return false;
      return true;
    }
    function apply(){
      // Filter the drawer cards first — works even if Leaflet never loads.
      var shown = 0;
      cards.forEach(function (c) { var ok = matches(c); wrapOf(c).style.display = ok ? '' : 'none'; if (ok) shown++; });
      if (count) count.textContent = shown;
      // Map ops only if the map is ready.
      if (window.__hubMap) {
        var hub = window.__hubMap;
        cards.forEach(function (c) {
          var on = wrapOf(c).style.display !== 'none', id = c.getAttribute('data-bank');
          var m = hub.markers[id], r = hub.rings[id];
          if (m) { on ? m.addTo(hub.map) : hub.map.removeLayer(m); }
          if (r) { on ? r.addTo(hub.map) : hub.map.removeLayer(r); }
        });
        var pts = cards.filter(function (c) { return wrapOf(c).style.display !== 'none'; })
                       .map(function (c) { var m = hub.markers[c.getAttribute('data-bank')]; return m && m.getLatLng(); }).filter(Boolean);
        if (pts.length) hub.map.flyToBounds(pts, { padding:[60,60], maxZoom:9, duration:.6 });
      }
    }
    var debTimer;
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    ['input','change'].forEach(function (ev) { loc.addEventListener(ev, function () { clearTimeout(debTimer); debTimer = setTimeout(apply, 150); }); });
    [hab, units].forEach(function (el) { el.addEventListener('change', apply); });

    // immersive map <-> drawer sync
    withMap(function (hub) {
      cards.forEach(function (card) {
        var id = card.getAttribute('data-bank'), m = hub.markers[id];
        if (!m) return;
        card.addEventListener('mouseenter', function () {
          m.openPopup();
          var d = dot(m); if (d) d.classList.add('is-hi');
          hub.map.panTo(m.getLatLng(), { animate:true, duration:.5 });
        });
        card.addEventListener('mouseleave', function () { var d = dot(m); if (d) d.classList.remove('is-hi'); });
        m.on('click', function () {
          cards.forEach(function (c) { c.classList.remove('is-active'); });
          card.classList.add('is-active');
          card.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
          hub.map.flyTo(m.getLatLng(), Math.max(hub.map.getZoom(), 9), { duration:.6 });
          setTimeout(function () { card.classList.remove('is-active'); }, 2600);
        });
      });
    });

    /* ===== Compare tray + modal (drawer cards) ===== */
    var selected = [], byCard = {}, btnById = {};
    function cardData(card){
      var stat = card.querySelector('.mf-card__stats b');
      var habs = (card.getAttribute('data-habitats') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
                   .map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); });
      return { id:card.getAttribute('data-bank'), name:card.querySelector('h3').textContent,
        region:(card.querySelector('.mf-card__region').textContent || '').trim(), units:card.getAttribute('data-units'),
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
    function toggleSel(id, btn){
      var i = selected.indexOf(id);
      if (i >= 0) { selected.splice(i, 1); if (btn) { btn.classList.remove('is-on'); btn.textContent = '+ Compare'; } }
      else { if (selected.length >= 4) return; selected.push(id); if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Added'; } }
      renderTray();
    }
    function renderTray(){
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
    function openModal(){
      var data = selected.map(function (id) { return cardData(byCard[id]); });
      var thead = '<tr><th></th>' + data.map(function (d) { return '<th><img src="' + d.img + '" alt=""><div class="name">' + d.name + '</div></th>'; }).join('') + '</tr>';
      function rowf(label, fn){ return '<tr><td class="rowlbl">' + label + '</td>' + data.map(function (d) { return '<td>' + fn(d) + '</td>'; }).join('') + '</tr>'; }
      var body = '<table class="cmp-table"><thead>' + thead + '</thead><tbody>'
        + rowf('Region', function (d) { return d.region; })
        + rowf('Area', function (d) { return d.area; })
        + rowf('BNG units', function (d) { return d.units; })
        + rowf('Habitats', function (d) { return d.habs.map(function (h) { return '<span class="chip">' + h + '</span>'; }).join(''); })
        + rowf('', function (d) { return d.href && d.href !== '#' ? '<a class="btn btn--sm" href="' + d.href + '">View</a>' : '<span class="note-ph">Page to follow</span>'; })
        + '</tbody></table>';
      modal.querySelector('.cmp-modal__body').innerHTML = body;
      modal.classList.add('show');
    }
  });
})();
