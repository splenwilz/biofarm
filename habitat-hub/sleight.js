/* Sleight Farm bank page — on-page nav scrollspy, gallery lightbox,
   enquiry-form success state, and sticky CTA bar. */
(function () {
  function ready(fn){ document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    // ---- scrollspy for the on-page nav ----
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.page-nav a[href^="#"]'));
    var sections = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    function spy(){
      var y = window.scrollY + 150, cur = null;
      sections.forEach(function (s) { if (s.offsetTop <= y) cur = s.id; });
      navLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + cur); });
    }
    window.addEventListener('scroll', spy, { passive:true });
    window.addEventListener('resize', spy); spy();

    // ---- sticky CTA bar (after hero, hidden near the form) ----
    var sticky = document.getElementById('stickyCta');
    var hero = document.querySelector('.bank-hero');
    var enq = document.getElementById('enquire');
    if (sticky) {
      var onScroll = function () {
        var past = hero ? window.scrollY > (hero.offsetHeight - 80) : window.scrollY > 420;
        var nearForm = false;
        if (enq) { var r = enq.getBoundingClientRect(); nearForm = r.top < window.innerHeight && r.bottom > 0; }
        sticky.classList.toggle('show', past && !nearForm);
      };
      window.addEventListener('scroll', onScroll, { passive:true }); onScroll();
    }

    // ---- gallery lightbox ----
    var lb = document.getElementById('lightbox'), lbImg = lb && lb.querySelector('img');
    Array.prototype.slice.call(document.querySelectorAll('.gallery img')).forEach(function (img) {
      img.addEventListener('click', function () { if (lb && lbImg) { lbImg.src = img.src; lbImg.alt = img.alt; lb.classList.add('show'); } });
    });
    if (lb) lb.addEventListener('click', function () { lb.classList.remove('show'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb) lb.classList.remove('show'); });

    // ---- enquiry form -> success ----
    var form = document.getElementById('enqForm');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('enqFields').style.display = 'none';
      var ok = document.getElementById('enqSuccess'); ok.classList.add('show');
      ok.scrollIntoView({ behavior:'smooth', block:'center' });
    });
  });
})();
