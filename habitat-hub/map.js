/* Biofarm Habitat Bank Hub — real interactive maps (Leaflet + OpenStreetMap).
   Any element with class .leaflet-map is initialised.
   data-mode="all"  -> plots the whole portfolio and fits bounds.
   data-mode="single" data-bank="sleight" -> centres one bank + catchment.
   Load catchments.js first for real LNRS boundary polygons (optional). */
(function () {
  if (typeof L === 'undefined') return;

  // Figures from the registered brochures; coordinates are approximate site locations.
  var BANKS = [
    { id:'sleight',  name:'Sleight Farm',     region:'Bath &amp; NE Somerset · West of England', lat:51.302, lng:-2.468, units:'374', url:'sleight-farm.html', served:45000, real:true, brochure:'brochures/Sleight%20Farm_Biofarm_BNG.pdf' },
    { id:'lesnewth', name:'Lesnewth',         region:'North Cornwall',                          lat:50.688, lng:-4.630, units:'130', url:'#', served:34000, real:true },
    { id:'b03',      name:'Avon Meadows',     region:'Warwickshire · Severn &amp; Avon Vales',   lat:52.190, lng:-1.710, units:'110', url:'#', served:42000, real:true, brochure:'brochures/Avon%20Meadows_Biofarm_BNG.pdf' },
    { id:'b04',      name:'Badger Bank Farm', region:'North Yorkshire · Magnesian Limestone',   lat:54.100, lng:-1.550, units:'232', url:'#', served:48000, real:true, brochure:'brochures/Badger%20Bank%20Farm_Biofarm_BNG.pdf' },
    { id:'b05',      name:'Rycote Farm',      region:'Oxfordshire · Upper Thames Clay Vales',    lat:51.720, lng:-1.030, units:'78',  url:'#', served:34000, real:true, brochure:'brochures/Rycote%20Farm_Biofarm_BNG.pdf' }
  ];

  function pin(active) {
    return L.divIcon({ className:'', html:'<span class="bpin'+(active?' bpin--active':'')+'"></span>',
      iconSize:[22,22], iconAnchor:[11,22], popupAnchor:[0,-20] });
  }
  function tiles(map, style) {
    if (style === 'muted') {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom:19, subdomains:'abcd', attribution:'&copy; OpenStreetMap &copy; CARTO'
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:18, attribution:'&copy; OpenStreetMap contributors'
      }).addTo(map);
    }
  }
  // "Area served" = the bank's LNRS area (real boundary from catchments.js), where its
  // units carry full value under the BNG spatial risk multiplier. Falls back to an
  // indicative radius for any bank without boundary data.
  function catchment(b) {
    return (typeof LNRS_CATCHMENTS !== 'undefined' && LNRS_CATCHMENTS[b.id]) || null;
  }
  function ring(map, b, strong) {
    var c = catchment(b);
    if (c) {
      return L.geoJSON(c.geometry, {
        style: { color:'#71977A', weight:strong?1.5:1, dashArray:'5 6',
                 fillColor:'#71977A', fillOpacity:strong?0.08:0.05 },
        attribution: 'Boundaries &copy; Natural England &amp; OS Crown copyright (OGL)'
      }).addTo(map);
    }
    return L.circle([b.lat,b.lng], { radius:b.served, color:'#71977A', weight:strong?1.5:1,
      dashArray:'5 6', fillColor:'#71977A', fillOpacity:strong?0.08:0.05 }).addTo(map);
  }
  function popup(b) {
    var c = catchment(b);
    var s = '<b>'+b.name+'</b>';
    if (b.region) s += '<br>'+b.region;
    s += '<br>'+b.units+' units';
    if (c) s += '<br><span style="color:#5c7a64;">Full-value area: '+c.lnrs+' LNRS</span>';
    if (b.url && b.url !== '#') s += '<br><a href="'+b.url+'">View habitat bank &rarr;</a>';
    if (b.brochure) s += '<br><a href="'+b.brochure+'" target="_blank" rel="noopener">Download brochure (PDF) &rarr;</a>';
    if (!b.real) s += '<br><span style="color:#8a8f83;font-style:italic;">Location to confirm</span>';
    return s;
  }

  // Pipeline coverage: LNRS areas where new banks are in development — shown as
  // muted-stone areas only (no pin, no brochure), clearly distinct from the green
  // registered-bank boundaries. Clicking the area invites an interest enquiry.
  var PIPE_STYLE = { color:'#857A5E', weight:1.4, dashArray:'2 5',
                     fillColor:'#B3A379', fillOpacity:0.28 };
  function addPipeline(map, bounds) {
    if (typeof LNRS_PIPELINE === 'undefined') return;
    Object.keys(LNRS_PIPELINE).forEach(function (k) {
      var p = LNRS_PIPELINE[k];
      var lyr = L.geoJSON(p.geometry, { style:PIPE_STYLE,
        attribution:'Boundaries &copy; Natural England &amp; OS Crown copyright (OGL)' })
        .bindPopup('<span style="font-size:.66rem;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:#857A5E;">In the pipeline</span>'
          +'<br><b>'+p.lnrs+'</b>'
          +'<br><span style="color:#8a8f83;">New habitat bank in development &mdash; details &amp; brochure to follow.</span>'
          +'<br><a href="https://www.biofarm.co.uk/contact">Register interest &rarr;</a>')
        .addTo(map);
      if (bounds) bounds.extend(lyr.getBounds());
    });
  }

  document.querySelectorAll('.leaflet-map').forEach(function (el) {
    var mode = el.getAttribute('data-mode') || 'all';
    var map = L.map(el, { scrollWheelZoom:false });
    tiles(map, el.getAttribute('data-tiles'));

    if (mode === 'single') {
      var id = el.getAttribute('data-bank');
      var b = BANKS.filter(function (x) { return x.id === id; })[0] || BANKS[0];
      var r = ring(map, b, true);
      // Frame the whole catchment when we have the real boundary; otherwise centre the pin.
      if (r.getBounds) map.fitBounds(r.getBounds(), { padding:[24,24] });
      else map.setView([b.lat, b.lng], 10);
      L.marker([b.lat, b.lng], { icon:pin(true) }).addTo(map).bindPopup(popup(b));
    } else {
      var pts = [], markers = {}, rings = {};
      BANKS.forEach(function (b) {
        rings[b.id] = ring(map, b, false);
        var m = L.marker([b.lat, b.lng], { icon:pin(b.real) }).addTo(map).bindPopup(popup(b));
        m.bankId = b.id; markers[b.id] = m;
        pts.push([b.lat, b.lng]);
      });
      var fb = L.latLngBounds(pts);
      addPipeline(map, fb);
      map.fitBounds(fb, { padding:[45,45] });
      // bounds = the full home view (banks + pipeline areas) so "Reset view" matches load.
      window.__hubMap = { map:map, markers:markers, rings:rings, banks:BANKS, bounds:fb };
      el.dispatchEvent(new CustomEvent('hubmapready'));
    }
    setTimeout(function () { map.invalidateSize(); }, 200);
  });
})();
