/* RPO project page: interactive pieces.

   1) A/B viewer: a side-by-side clip (A | B, 2568 x 704) is decoded once and painted
      onto one canvas; the wipe line decides how much of B replaces A.
   2) Route lab: a toy of the attention-mass draw and the controlled two-rollout pair.
      Each row is a query block. Its route logits are the log of the share of its
      attention that falls on each key block; a categorical draw over the candidate
      blocks plus a "dense" option, perturbed with Gumbel noise and ranked, decides
      whether the row stays dense or keeps its own block plus the top K candidates.
      Two rollouts share everything except the routing seed. It illustrates the rule
      on toy attention masses, not real attention maps.
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
    var sT = document.getElementById('m-T'), sK = document.getElementById('m-k');
    var oT = document.getElementById('m-Tv'), oK = document.getElementById('m-kv');
    var btn = document.getElementById('m-resample'), autoBtn = document.getElementById('m-auto');
    var stats = {
      d1: document.getElementById('m-d1'), d2: document.getElementById('m-d2'), df: document.getElementById('m-d')
    };

    var Q = 16, CELL = 18;                 // Q query blocks (rows) over Q key blocks (columns)
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    [c1, c2, c3].forEach(function (c) {
      c.width = Q * CELL * DPR; c.height = Q * CELL * DPR;
      c.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    });

    function hash(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
    function sq(v) { return v * v; }

    /* toy attention mass m[q][j]: rows sum to one. Each block mostly attends to itself and its
       neighbours, plus two globally salient blocks and some texture. */
    var M = [];
    for (var i = 0; i < Q; i++) {
      var row = [], sum = 0;
      for (var j = 0; j < Q; j++) {
        var v = 1.6 * Math.exp(-sq((j - i) / 0.9))
              + 0.55 * Math.exp(-sq((j - i) / 2.6))
              + 0.42 * Math.exp(-sq((j - 3) / 0.8)) * (0.7 + 0.3 * Math.sin(i))
              + 0.34 * Math.exp(-sq((j - 11) / 0.8)) * (0.7 + 0.3 * Math.cos(i * 0.7))
              + 0.05 + 0.10 * hash(i, j);
        row.push(v); sum += v;
      }
      for (j = 0; j < Q; j++) row[j] /= sum;
      M.push(row);
    }

    var T = 1.6, KAPPA = 0.25;                 // at T = 1 a local row mostly stays dense (about 1/(2 - m_qq)); a higher T mixes more
    var mA = null, mB = null, seed = 7;
    function rng() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function gumbel() { return -Math.log(-Math.log(Math.max(1e-12, rng()))); }

    /* one routing draw for one query block:
       options = candidate blocks (every other block) + the dense option "*", with logits
       log m_j and log(total mass) = 0. Perturb each logit / T with Gumbel noise and rank.
       Dense first -> the row attends densely. Otherwise: own block + the K highest candidates. */
    function drawRow(q) {
      var K = Math.ceil(KAPPA * Q);                       // kappa * (|C_q| + 1), and |C_q| + 1 = Q
      var opts = [];
      for (var j = 0; j < Q; j++) if (j !== q) opts.push({ j: j, s: Math.log(M[q][j]) / T + gumbel() });
      opts.push({ j: -1, s: 0 / T + gumbel() });          // dense option, logit log(sum of mass) = 0
      opts.sort(function (a, b) { return b.s - a.s; });
      var row = new Array(Q).fill(0);
      if (opts[0].j === -1) { for (var k = 0; k < Q; k++) row[k] = 2; return row; }   // 2 = dense row
      row[q] = 3;                                          // 3 = own block, always kept
      for (var r = 0, kept = 0; r < opts.length && kept < K; r++) {
        if (opts[r].j >= 0) { row[opts[r].j] = 1; kept++; }                           // 1 = kept candidate
      }
      return row;
    }

    function sample() {
      mA = []; mB = [];
      for (var q = 0; q < Q; q++) { mA.push(drawRow(q)); mB.push(drawRow(q)); }
    }

    var AMBER = '#ffa347', BLUE = '#4f8cff', OWN = '#dbe4ff', DENSE = '#52e0ff', DROP = '#94aad7';
    function paintCell(g, i, j, st, mass, mode, other) {
      var col, al;
      if (mode === 'diff') {
        var a = st > 0, b = other > 0;                     // attended in this rollout / in the partner
        if (st === 3 && other === 3) { col = OWN; al = 0.22; }
        else if (a !== b) { col = a ? AMBER : BLUE; al = 1; }
        else if (a) { col = (st === 2 ? DENSE : AMBER); al = 0.16; }
        else { col = DROP; al = 0.05 + 0.5 * mass; }
      } else {
        if (st === 3) { col = OWN; al = 0.92; }
        else if (st === 2) { col = DENSE; al = 0.5; }
        else if (st === 1) { col = AMBER; al = 0.95; }
        else { col = DROP; al = 0.05 + 0.5 * mass; }
      }
      g.globalAlpha = al; g.fillStyle = col;
      g.fillRect(j * CELL + 1, i * CELL + 1, CELL - 2, CELL - 2);
    }
    function draw(canvas, mode) {
      var g = canvas.getContext('2d');
      g.clearRect(0, 0, Q * CELL, Q * CELL);
      for (var i = 0; i < Q; i++) for (var j = 0; j < Q; j++) {
        var st = mode === 'a2' ? mB[i][j] : mA[i][j];
        var other = mode === 'diff' ? mB[i][j] : 0;
        paintCell(g, i, j, st, M[i][j], mode, other);
      }
      g.globalAlpha = 1;
    }

    function render() {
      draw(c1, 'a1'); draw(c2, 'a2'); draw(c3, 'diff');
      var d1 = 0, d2 = 0, df = 0, cells = 0;
      for (var i = 0; i < Q; i++) {
        if (mA[i][0] === 2) d1++;                           // a dense row sets every cell to 2
        if (mB[i][0] === 2) d2++;
        for (var j = 0; j < Q; j++) {
          if (i === j) continue;
          cells++;
          var a = mA[i][j] > 0, b = mB[i][j] > 0;
          if (a !== b) df++;
        }
      }
      stats.d1.textContent = Math.round(100 * d1 / Q) + '%';
      stats.d2.textContent = Math.round(100 * d2 / Q) + '%';
      stats.df.textContent = Math.round(100 * df / cells) + '%';
      oT.textContent = T.toFixed(2); oK.textContent = KAPPA.toFixed(2);
      sT.style.setProperty('--fill', ((sT.value - sT.min) / (sT.max - sT.min) * 100) + '%');
      sK.style.setProperty('--fill', ((sK.value - sK.min) / (sK.max - sK.min) * 100) + '%');
    }
    function resample() { seed = (Math.random() * 1e9) | 0; sample(); render(); }

    sT.addEventListener('input', function () { T = parseFloat(sT.value); sample(); render(); });
    sK.addEventListener('input', function () { KAPPA = parseFloat(sK.value); sample(); render(); });
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
