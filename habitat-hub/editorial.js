/* Biofarm Habitat Bank Hub — Editorial concept interactivity:
   filter / sort / count, reset, use-my-location (no map), and compare tray + modal. */
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
    if (!cards.length) return;

    // Each card is wrapped in .card-wrap (compare init below); filter/sort on the wrap so
    // hidden cards don't leave their absolutely-positioned compare button behind.
    function wrapOf(c){ var p = c.parentNode; return (p && p.classList && p.classList.contains('card-wrap')) ? p : c; }

    // approximate coordinates (mirror map.js)
    var COORD = { sleight:[51.302,-2.468], lesnewth:[50.688,-4.630], b03:[52.190,-1.710], b04:[54.100,-1.550], b05:[51.720,-1.030] };

    // Pipeline ("coming soon") cards: region-only filtering, never in the registered count.
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
        if (hab.value || units.value) return false;
        return !q || (c.getAttribute('data-search') || '').indexOf(q) !== -1;
      }
      if (q && (c.getAttribute('data-search') || '').indexOf(q) === -1) return false;
      if (hab.value && (c.getAttribute('data-habitats') || '').indexOf(hab.value) === -1) return false;
      if (!unitsMatch(+c.getAttribute('data-units'), units.value)) return false;
      return true;
    }
    function apply(){
      var n = 0, visible = 0, soonShown = 0, soonHidden = 0;
      cards.forEach(function (c) {
        var ok = matches(c);
        if (ok && isSoon(c)) {
          if (!soonExpanded && soonShown >= SOON_LIMIT) { ok = false; soonHidden++; }
          else soonShown++;
        }
        wrapOf(c).style.display = ok ? '' : 'none';
        if (ok) { visible++; if (!isSoon(c)) n++; }
      });
      count.textContent = n;
      noRes.classList.toggle('show', visible === 0);
      updateMoreBtn(soonHidden, soonShown);
    }
    function sortCards(){
      var v = sort.value, arr = cards.filter(function (c) { return !isSoon(c); });
      arr.sort(function (a, b) {
        if (v === 'units-desc') return (+b.getAttribute('data-units')) - (+a.getAttribute('data-units'));
        if (v === 'units-asc')  return (+a.getAttribute('data-units')) - (+b.getAttribute('data-units'));
        if (v === 'name') return a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent);
        return 0;
      });
      arr.forEach(function (c) { grid.appendChild(wrapOf(c)); });
      cards.forEach(function (c) { if (isSoon(c)) grid.appendChild(wrapOf(c)); }); // pipeline always last
      if (moreBtn) grid.appendChild(moreBtn);
    }

    // chips
    var chips = Array.prototype.slice.call(document.querySelectorAll('#habChips .fchip'));
    function syncChips(){ chips.forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-hab') === (hab.value || '')); }); }
    chips.forEach(function (c) { c.addEventListener('click', function () { hab.value = c.getAttribute('data-hab'); syncChips(); apply(); }); });

    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    ['input','change'].forEach(function (ev) { loc.addEventListener(ev, apply); });
    [hab, units].forEach(function (el) { el.addEventListener('change', function () { syncChips(); apply(); }); });
    if (sort) sort.addEventListener('change', sortCards);

    var resetBtn = document.getElementById('resetFilters');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      loc.value = ''; hab.value = ''; units.value = ''; if (sort) sort.value = 'default';
      soonExpanded = false;
      syncChips(); if (geo) geo.textContent = ''; sortCards(); apply();
    });

    // use my location -> distance sort
    function hav(a, b, c, d){
      var R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180;
      var s = Math.sin(x/2)*Math.sin(x/2) + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
    }
    var useLoc = document.getElementById('useLoc');
    if (useLoc) useLoc.addEventListener('click', function () {
      if (!navigator.geolocation) { if (geo) geo.textContent = 'Location not supported.'; return; }
      if (geo) geo.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var ul = pos.coords.latitude, ug = pos.coords.longitude;
        cards.forEach(function (c) { var k = COORD[c.getAttribute('data-bank')]; c.__d = k ? hav(ul, ug, k[0], k[1]) : 1e9; });
        cards.slice().sort(function (a, b) { return a.__d - b.__d; }).forEach(function (c) { if (!isSoon(c)) grid.appendChild(wrapOf(c)); });
        cards.forEach(function (c) { if (isSoon(c)) grid.appendChild(wrapOf(c)); }); // pipeline always last
        if (moreBtn) grid.appendChild(moreBtn);
        if (sort) sort.value = 'default';
        if (geo) geo.textContent = 'Nearest first from your location';
      }, function () { if (geo) geo.textContent = "Couldn't get your location."; });
    });

    // ===== Compare tray + modal =====
    var selected = [], byCard = {}, btnById = {};
    function cardData(card){
      var stat = card.querySelector('.ed-card__stats b'), habs = [];
      card.querySelectorAll('.chips .chip').forEach(function (ch) { habs.push(ch.textContent); });
      return { id:card.getAttribute('data-bank'), name:card.querySelector('h3').textContent,
        region:(card.querySelector('.ed-card__region').textContent || '').trim(), units:card.getAttribute('data-units'),
        area:stat ? stat.textContent : '—', habs:habs, img:(card.querySelector('img') || {}).src || '', href:card.getAttribute('href') };
    }
    cards.forEach(function (card) {
      if (isSoon(card)) return; // no compare toggle for coming-soon sites
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
      else { if (selected.length >= 4) { if (geo) geo.textContent = 'Compare up to 4 at a time.'; return; } selected.push(id); if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Added'; } }
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
