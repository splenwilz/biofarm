/* Biofarm Habitat Bank Hub — Compare / Data-led concept:
   filter rows, sortable columns, result count, and a focused compare tray + modal. */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var form  = document.getElementById('cmpFilter'),
        loc   = document.getElementById('fLoc'),
        hab   = document.getElementById('fHabitat'),
        units = document.getElementById('fUnits'),
        cond  = document.getElementById('fCond'),
        count = document.getElementById('resultCount'),
        tbody = document.getElementById('cmpBody'),
        noRow = document.getElementById('noRow');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-bank]'));
    if (!rows.length) return;

    function unitsMatch(v, band){ if (!band) return true; var p = band.split('-'); return v >= +p[0] && v <= +p[1]; }
    function matches(r){
      var q = (loc.value || '').trim().toLowerCase();
      if (q && (r.getAttribute('data-search') || '').indexOf(q) === -1) return false;
      if (hab.value && (r.getAttribute('data-habitats') || '').indexOf(hab.value) === -1) return false;
      if (!unitsMatch(+r.getAttribute('data-units'), units.value)) return false;
      if (cond.value && (r.getAttribute('data-condition') || '') !== cond.value.toLowerCase()) return false;
      return true;
    }
    function apply(){
      var n = 0;
      rows.forEach(function (r) { var ok = matches(r); r.style.display = ok ? '' : 'none'; if (ok) n++; });
      if (count) count.textContent = n;
      if (noRow) noRow.style.display = n === 0 ? '' : 'none';
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    ['input','change'].forEach(function (ev) { loc.addEventListener(ev, apply); });
    [hab, units, cond].forEach(function (el) { el.addEventListener('change', apply); });

    // sortable columns
    var dir = {};
    function num(s){ var m = (s || '').replace(/[^0-9.]/g, ''); return m ? parseFloat(m) : 0; }
    function key(r, k){
      if (k === 'units') return +r.getAttribute('data-units');
      if (k === 'area')  return num(r.getAttribute('data-area'));
      if (k === 'name')  return (r.getAttribute('data-name') || '').toLowerCase();
      if (k === 'region')return (r.getAttribute('data-region') || '').toLowerCase();
      if (k === 'condition') return (r.getAttribute('data-condition') || '').toLowerCase();
      return 0;
    }
    Array.prototype.slice.call(document.querySelectorAll('th[data-sort]')).forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort'); dir[k] = dir[k] === 'asc' ? 'desc' : 'asc';
        var d = dir[k] === 'asc' ? 1 : -1;
        rows.slice().sort(function (a, b) { var va = key(a, k), vb = key(b, k); return (va < vb ? -1 : va > vb ? 1 : 0) * d; })
            .forEach(function (r) { tbody.appendChild(r); });
        if (noRow) tbody.appendChild(noRow);
      });
    });

    // compare tray + modal
    var selected = [], byId = {};
    rows.forEach(function (r) { byId[r.getAttribute('data-bank')] = r; });
    function rowData(r){
      return { id:r.getAttribute('data-bank'), name:r.getAttribute('data-name'), region:r.getAttribute('data-region'),
        units:r.getAttribute('data-units'), area:r.getAttribute('data-area'),
        habs:(r.getAttribute('data-habitats') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }),
        img:r.getAttribute('data-img') || '', href:r.getAttribute('data-href') || '#' };
    }
    Array.prototype.slice.call(document.querySelectorAll('.row-cmp')).forEach(function (btn) {
      btn.addEventListener('click', function () { toggleSel(btn.getAttribute('data-bank'), btn); });
    });
    var tray = document.createElement('div'); tray.className = 'compare-tray';
    tray.innerHTML = '<div class="inner"><span class="lbl">Compare</span><div class="sel"></div><button class="btn btn--on-green" id="cmpOpen">Compare</button><button class="clear" id="cmpClear">Clear</button></div>';
    document.body.appendChild(tray);
    var modal = document.createElement('div'); modal.className = 'cmp-modal';
    modal.innerHTML = '<div class="cmp-modal__box"><div class="cmp-modal__head"><h2>Compare habitat banks</h2><button class="cmp-modal__close" aria-label="Close">&times;</button></div><div class="cmp-modal__body"></div></div>';
    document.body.appendChild(modal);
    var traySel = tray.querySelector('.sel');
    function btnFor(id){ return document.querySelector('.row-cmp[data-bank="' + id + '"]'); }
    function toggleSel(id, btn){
      btn = btn || btnFor(id);
      var i = selected.indexOf(id);
      if (i >= 0) { selected.splice(i, 1); if (btn) { btn.classList.remove('is-on'); btn.textContent = '+ Compare'; } }
      else { if (selected.length >= 4) return; selected.push(id); if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Added'; } }
      renderTray();
    }
    function renderTray(){
      traySel.innerHTML = '';
      selected.forEach(function (id) {
        var d = rowData(byId[id]);
        var chip = document.createElement('span'); chip.className = 'selchip'; chip.innerHTML = d.name + ' <button aria-label="Remove">&times;</button>';
        chip.querySelector('button').addEventListener('click', function () { toggleSel(id); });
        traySel.appendChild(chip);
      });
      tray.classList.toggle('show', selected.length > 0);
      tray.querySelector('#cmpOpen').textContent = 'Compare (' + selected.length + ')';
    }
    tray.querySelector('#cmpClear').addEventListener('click', function () { selected.slice().forEach(function (id) { toggleSel(id); }); });
    tray.querySelector('#cmpOpen').addEventListener('click', function () { if (selected.length) openModal(); });
    modal.querySelector('.cmp-modal__close').addEventListener('click', function () { modal.classList.remove('show'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('show'); });
    function openModal(){
      var data = selected.map(function (id) { return rowData(byId[id]); });
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
