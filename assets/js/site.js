/* Velox World — shared behaviour: nav state, scroll progress, reveal-on-scroll,
   card spotlight, count-up numbers, copy buttons. No dependencies. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav background + scroll progress ---- */
  var nav = document.querySelector('.nav');
  var bar = document.querySelector('.progress');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || doc.scrollTop;
      if (nav) nav.classList.toggle('scrolled', y > 8);
      if (bar) {
        var max = doc.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---- reveal on scroll ---- */
  var rv = [].slice.call(document.querySelectorAll('.rv'));
  var stillMode = /[?&]still\b/.test(location.search);   // static capture mode: show everything
  if ('IntersectionObserver' in window && !reduce && !stillMode && !document.hidden) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- spotlight follows the cursor on cards ---- */
  document.addEventListener('pointermove', function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var c = t.closest('.card');
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
    c.style.setProperty('--my', (ev.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---- count-up numbers: <span data-count="4.36" data-dec="2"> keeps real text without JS ---- */
  var counters = [].slice.call(document.querySelectorAll('[data-count]'));
  function runCount(el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var dur = 1300, t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * e).toFixed(dec);
      if (p < 1) requestAnimationFrame(step); else el.textContent = to.toFixed(dec);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window && !reduce) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { runCount(e.target); co.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---- copy buttons: <button data-copy="#id"> ---- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-copy]');
    if (!b) return;
    var src = document.querySelector(b.getAttribute('data-copy'));
    if (!src || !navigator.clipboard) return;
    navigator.clipboard.writeText(src.textContent.trim()).then(function () {
      var old = b.textContent;
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = old; }, 1400);
    });
  });
})();
