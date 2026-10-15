/* RPO project page — interactive pieces.

   1) A/B viewer: a side-by-side clip (A | B, 2568 x 704) is decoded once and painted
      onto one canvas; the wipe line decides how much of B replaces A.
   2) Route lab: a toy of the controlled two-rollout estimator. Each cell is one
      candidate key block for one query block; Bernoulli keep probability is
      sigma(z / T + beta0). Two rollouts share everything except the sampled masks.
      It illustrates the sampling rule, not real attention maps.
   3) Image pairs: SD3.5 base vs. RPO wipes. */

(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ====================================================================
     1) A/B viewer
     ==================================================================== */
  (function viewer() {
    var wipe = document.getElementById('v-wipe');
    if (!wipe) return;
    var cv = document.getElementById('v-canvas');
    var ctx = cv.getContext('2d');
    var vid = document.getElementById('v-video');
    var range = document.getElementById('v-x');
    var playBtn = document.getElementById('v-play');
    var tabs = document.getElementById('v-tabs');
    var HALF = 1280, GAP = 8, H = 704;
    var x = 0.5;                       // wipe position, 0..1
    var poster = new Image();
    var posterReady = false;
    var current = null;
    var playing = !reduce;
    var inView = false;
    var started = false;

    function source() {
      if (vid.readyState >= 2 && vid.videoWidth > 0 && started) return vid;
      return posterReady ? poster : null;
    }
    function paint() {
      var s = source();
      if (!s) return;
      var xp = Math.round(x * HALF);
      /* the clip and poster are 2568 x 704 (A | 8px | B). */
      var sw = s === vid ? vid.videoWidth : s.naturalWidth;
      var k = sw / (2 * HALF + GAP);
      try {
        ctx.drawImage(s, 0, 0, HALF * k, H * k, 0, 0, HALF, H);                                        // A everywhere
        if (xp < HALF) ctx.drawImage(s, (HALF + GAP + xp) * k, 0, (HALF - xp) * k, H * k, xp, 0, HALF - xp, H);  // B right of the line
      } catch (e) { /* not ready */ }
    }
    function setX(v) {
      x = clamp(v, 0, 1);
      wipe.style.setProperty('--x', (x * 100) + '%');
      range.value = Math.round(x * 1000);
      paint();
    }

    function loadClip(btn) {
      var n = btn.getAttribute('data-n');
      current = n;
      posterReady = false; started = false;
      poster.onload = function () { posterReady = true; paint(); };
      poster.src = 'https://media.velox-world.com/rpo/wan2.2/posters-v629s50/' + n + '.jpg';
      [].forEach.call(tabs.querySelectorAll('button'), function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      if (inView) attachVideo();
    }
    function attachVideo() {
      if (!current) return;
      var url = 'https://media.velox-world.com/rpo/wan2.2/side-by-side-v629s50/' + current + '.mp4';
      if (vid.getAttribute('data-n') !== current) {
        vid.setAttribute('data-n', current);
        started = false;
        vid.src = url;
        vid.load();
      }
      if (playing) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    }

    vid.addEventListener('playing', function () { started = true; });
    vid.addEventListener('loadeddata', function () { paint(); });

    var rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    var loopOn = false;
    function loop() {
      if (!loopOn) return;
      paint();
      if (rvfc) vid.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
    }
    function startLoop() { if (loopOn) return; loopOn = true; if (rvfc) vid.requestVideoFrameCallback(loop); else requestAnimationFrame(loop); }
    function stopLoop() { loopOn = false; }

    function setPlaying(p) {
      playing = p;
      playBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
      playBtn.setAttribute('aria-label', p ? 'Pause clip' : 'Play clip');
      playBtn.innerHTML = p
        ? '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1.5" width="3.6" height="11" rx="1"/><rect x="8.4" y="1.5" width="3.6" height="11" rx="1"/></svg>'
        : '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z"/></svg>';
      if (p && inView) { attachVideo(); startLoop(); } else { vid.pause(); }
    }

    range.addEventListener('input', function () { setX(range.value / 1000); });
    playBtn.addEventListener('click', function () { setPlaying(!playing); });
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (!b) return;
      loadClip(b);
    });

    /* gentle intro sweep so the wipe reads as draggable */
    var swept = false;
    function intro() {
      if (swept || reduce) return;
      swept = true;
      var t0 = null;
      (function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 1800);
        setX(0.5 + 0.28 * Math.sin(p * Math.PI * 2) * (1 - p));
        if (p < 1) requestAnimationFrame(step); else setX(0.5);
      })(performance.now());
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) { attachVideo(); if (playing) startLoop(); intro(); }
        else { vid.pause(); stopLoop(); }
      }, { threshold: 0.25 }).observe(wipe);
    } else { inView = true; attachVideo(); startLoop(); }

    var first = tabs.querySelector('button[aria-selected="true"]') || tabs.querySelector('button');
    setX(0.5);
    loadClip(first);
  })();

  /* ====================================================================
     2) route lab
     ==================================================================== */
  (function lab() {
    var c1 = document.getElementById('m-a1');
    if (!c1) return;
    var c2 = document.getElementById('m-a2');
    var c3 = document.getElementById('m-diff');
    var sT = document.getElementById('m-T'), sB = document.getElementById('m-b');
    var oT = document.getElementById('m-Tv'), oB = document.getElementById('m-bv');
    var btn = document.getElementById('m-resample'), autoBtn = document.getElementById('m-auto');
    var stats = {
      k1: document.getElementById('m-k1'), k2: document.getElementById('m-k2'), d: document.getElementById('m-d')
    };

    var RQ = 14, RK = 24, CELL = 14;
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    [c1, c2, c3].forEach(function (c) {
      c.width = RK * CELL * DPR; c.height = RQ * CELL * DPR;
      c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    });

    function hash(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
    function sig(v) { return 1 / (1 + Math.exp(-v)); }
    function sq(v) { return v * v; }

    /* toy affinity logits z[i][j]: a locality band, one globally salient key column, texture */
    var Z = [], SAFE = [];
    for (var i = 0; i < RQ; i++) {
      Z.push([]); SAFE.push([]);
      var centre = 2 + i * (RK - 6) / (RQ - 1);
      for (var j = 0; j < RK; j++) {
        var z = 2.6 * Math.exp(-sq((j - centre) / 2.4))
              + 1.5 * Math.exp(-sq((j - RK * 0.68) / 1.6)) * (0.65 + 0.35 * Math.sin(i * 0.8))
              + 1.0 * (hash(i, j) - 0.5) * 2 - 1.3;
        Z[i].push(z);
        SAFE[i].push(j === 0 || Math.abs(j - centre) < 1.2);
      }
    }

    var T = 1, B0 = 0;
    var mA = null, mB = null, seed = 7;
    function rng() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

    function prob(i, j) { return sig(Z[i][j] / T + B0); }

    function sample() {
      mA = []; mB = [];
      for (var i = 0; i < RQ; i++) {
        mA.push([]); mB.push([]);
        for (var j = 0; j < RK; j++) {
          var p = prob(i, j);
          mA[i].push(SAFE[i][j] ? 1 : (rng() < p ? 1 : 0));
          mB[i].push(SAFE[i][j] ? 1 : (rng() < p ? 1 : 0));
        }
      }
    }

    var AMBER = '#ffa347', BLUE = '#4f8cff';
    function draw(canvas, mode) {
      var g = canvas.getContext('2d');
      g.clearRect(0, 0, RK * CELL, RQ * CELL);
      for (var i = 0; i < RQ; i++) {
        for (var j = 0; j < RK; j++) {
          var x = j * CELL, y = i * CELL, p = prob(i, j);
          var a = mA[i][j], b = mB[i][j], col, al = 1;
          if (mode === 'diff') {
            if (SAFE[i][j]) { col = '#dbe4ff'; al = 0.22; }
            else if (a !== b) { col = a ? AMBER : BLUE; al = 1; }
            else if (a) { col = AMBER; al = 0.16; }
            else { col = '#94aad7'; al = 0.05 + 0.1 * p; }
          } else {
            var m = mode === 'a1' ? a : b;
            if (SAFE[i][j]) { col = '#dbe4ff'; al = 0.9; }
            else if (m) { col = AMBER; al = 0.95; }
            else { col = '#94aad7'; al = 0.05 + 0.2 * p; }
          }
          g.globalAlpha = al; g.fillStyle = col;
          g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
      }
      g.globalAlpha = 1;
    }

    function render() {
      draw(c1, 'a1'); draw(c2, 'a2'); draw(c3, 'diff');
      var cand = 0, k1 = 0, k2 = 0, d = 0;
      for (var i = 0; i < RQ; i++) for (var j = 0; j < RK; j++) {
        if (SAFE[i][j]) continue;
        cand++; k1 += mA[i][j]; k2 += mB[i][j]; if (mA[i][j] !== mB[i][j]) d++;
      }
      stats.k1.textContent = Math.round(100 * k1 / cand) + '%';
      stats.k2.textContent = Math.round(100 * k2 / cand) + '%';
      stats.d.textContent = Math.round(100 * d / cand) + '%';
      oT.textContent = T.toFixed(2); oB.textContent = (B0 >= 0 ? '+' : '') + B0.toFixed(1);
      sT.style.setProperty('--fill', ((sT.value - sT.min) / (sT.max - sT.min) * 100) + '%');
      sB.style.setProperty('--fill', ((sB.value - sB.min) / (sB.max - sB.min) * 100) + '%');
    }
    function resample() { seed = (Math.random() * 1e9) | 0; sample(); render(); }

    sT.addEventListener('input', function () { T = parseFloat(sT.value); sample(); render(); });
    sB.addEventListener('input', function () { B0 = parseFloat(sB.value); sample(); render(); });
    btn.addEventListener('click', function () { auto(false); resample(); });

    var timer = 0, on = false;
    function auto(v) {
      on = v;
      autoBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
      autoBtn.textContent = v ? 'Auto: on' : 'Auto: off';
      clearInterval(timer);
      if (v) timer = setInterval(resample, 1600);
    }
    autoBtn.addEventListener('click', function () { auto(!on); });

    sample(); render();
    if ('IntersectionObserver' in window && !reduce) {
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { if (!on && !timer) auto(true); }
        else { clearInterval(timer); timer = 0; if (on) { on = false; autoBtn.setAttribute('aria-pressed', 'false'); autoBtn.textContent = 'Auto: off'; } }
      }, { threshold: 0.4 }).observe(c1);
    }
  })();

  /* ====================================================================
     3) image pairs
     ==================================================================== */
  [].forEach.call(document.querySelectorAll('.pair'), function (pair) {
    var input = pair.querySelector('input');
    function set() {
      var v = input.value / 10;
      pair.style.setProperty('--x', v + '%');
    }
    input.addEventListener('input', set);
    set();
  });
})();
