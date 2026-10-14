/* Velox World — home page behaviour:
   - the "generated worlds" wall: seamless loop, tiles play only while on screen
   - the two project cards: a looping A|B clip painted on a canvas with a sweeping wipe */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var still = /[?&]still\b/.test(location.search);
  var hasIO = 'IntersectionObserver' in window;

  /* ---- wall ---- */
  var track = document.getElementById('wall-track');
  if (track) {
    if (!reduce) {
      [].slice.call(track.children).forEach(function (n) {
        var c = n.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        track.appendChild(c);
      });
    }
    var vids = [].slice.call(track.querySelectorAll('video'));
    if (hasIO && !reduce) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) {
            if (!v.getAttribute('src')) v.src = v.getAttribute('data-src');
            var p = v.play(); if (p && p.catch) p.catch(function () {});
          } else if (v.getAttribute('src')) {
            v.pause();
          }
        });
      }, { rootMargin: '80px', threshold: 0.05 });
      vids.forEach(function (v) { io.observe(v); });
    }
  }

  /* ---- project cards ---- */
  [].forEach.call(document.querySelectorAll('[data-ab]'), function (box) {
    var cv = box.querySelector('canvas');
    var ctx = cv.getContext('2d');
    var vid = box.querySelector('video');
    var rule = box.querySelector('.rule');
    var W = parseInt(box.getAttribute('data-w'), 10) || 640;
    var H = parseInt(box.getAttribute('data-h'), 10) || 356;
    var poster = new Image(), posterReady = false, started = false, x = 0.5;
    var inView = false, raf = 0, t0 = performance.now();

    function paint() {
      var s = null, k = 1;
      if (started && vid.readyState >= 2 && vid.videoWidth) { s = vid; k = vid.videoWidth / (2 * W); }
      else if (posterReady && poster.naturalWidth) { s = poster; k = poster.naturalWidth / (2 * W); }
      if (!s) return;
      var xp = Math.round(x * W);
      try {
        ctx.drawImage(s, 0, 0, W * k, H * k, 0, 0, W, H);                                     // A: left half, everywhere
        if (xp < W) ctx.drawImage(s, (W + xp) * k, 0, (W - xp) * k, H * k, xp, 0, W - xp, H);  // B: right half, right of the line
      } catch (e) { /* not ready */ }
      if (rule) rule.style.setProperty('--x', (x * 100) + '%');
    }
    function frame(now) {
      raf = 0;
      if (!inView) return;
      x = 0.5 + 0.44 * Math.sin((now - t0) / 1700);
      paint();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!vid.getAttribute('src')) vid.src = box.getAttribute('data-video');
      var p = vid.play(); if (p && p.catch) p.catch(function () {});
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function stop() { vid.pause(); if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    vid.addEventListener('playing', function () { started = true; });
    poster.onload = function () { posterReady = true; paint(); };
    poster.src = box.getAttribute('data-poster');
    paint();

    if (hasIO && !reduce && !still) {
      new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) start(); else stop();
      }, { threshold: 0.25 }).observe(box);
    }
  });
})();
