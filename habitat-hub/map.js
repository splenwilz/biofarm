/* Biofarm Habitat Bank Hub — real interactive maps (Leaflet + OpenStreetMap).
   Any element with class .leaflet-map is initialised.
   data-mode="all"  -> plots the whole portfolio and fits bounds.
   data-mode="single" data-bank="sleight" -> centres one bank + catchment. */
(function () {
  if (typeof L === 'undefined') return;

  // Approximate locations. Sleight + banks 03–06 are indicative / to confirm.
  var BANKS = [
    { id:'sleight',  name:'Sleight Farm',   region:'Somerset · South West', lat:51.302, lng:-2.468, units:'120*', url:'sleight-farm.html', served:38000, real:true },
    { id:'lesnewth', name:'Lesnewth',       region:'North Cornwall',        lat:50.688, lng:-4.630, units:'130',  url:'#',               served:34000, real:true },
    { id:'b03',      name:'Habitat Bank 03',region:'South West (to confirm)',lat:50.720, lng:-3.530, units:'90*',  url:'#',               served:34000, real:false },
    { id:'b04',      name:'Habitat Bank 04',region:'England (to confirm)',   lat:52.210, lng:-1.500, units:'140*', url:'#',               served:40000, real:false },
    { id:'b05',      name:'Habitat Bank 05',region:'England (to confirm)',   lat:52.630, lng: 1.130, units:'60*',  url:'#',               served:30000, real:false },
    { id:'b06',      name:'Habitat Bank 06',region:'England (to confirm)',   lat:53.400, lng:-2.600, units:'110*', url:'#',               served:34000, real:false }
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
  function ring(map, b, strong) {
    return L.circle([b.lat,b.lng], { radius:b.served, color:'#71977A', weight:strong?1.5:1,
      dashArray:'5 6', fillColor:'#71977A', fillOpacity:strong?0.08:0.05 }).addTo(map);
  }
  function popup(b) {
    var s = '<b>'+b.name+'</b><br>'+b.region+'<br>'+b.units+' units';
    if (b.url && b.url !== '#') s += '<br><a href="'+b.url+'">View habitat bank &rarr;</a>';
    if (!b.real) s += '<br><span style="color:#8a8f83;font-style:italic;">Location to confirm</span>';
    return s;
  }

  document.querySelectorAll('.leaflet-map').forEach(function (el) {
    var mode = el.getAttribute('data-mode') || 'all';
    var map = L.map(el, { scrollWheelZoom:false });
    tiles(map, el.getAttribute('data-tiles'));

    if (mode === 'single') {
      var id = el.getAttribute('data-bank');
      var b = BANKS.filter(function (x) { return x.id === id; })[0] || BANKS[0];
      map.setView([b.lat, b.lng], 10);
      ring(map, b, true);
      L.marker([b.lat, b.lng], { icon:pin(true) }).addTo(map).bindPopup(popup(b));
    } else {
      var pts = [], markers = {}, rings = {};
      BANKS.forEach(function (b) {
        rings[b.id] = ring(map, b, false);
        var m = L.marker([b.lat, b.lng], { icon:pin(b.real) }).addTo(map).bindPopup(popup(b));
        m.bankId = b.id; markers[b.id] = m;
        pts.push([b.lat, b.lng]);
      });
      map.fitBounds(pts, { padding:[45,45] });
      window.__hubMap = { map:map, markers:markers, rings:rings, banks:BANKS };
      el.dispatchEvent(new CustomEvent('hubmapready'));
    }
    setTimeout(function () { map.invalidateSize(); }, 200);
  });
})();
