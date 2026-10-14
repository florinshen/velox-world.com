/* Velox project page — interactive pieces.

   1) Frustum-slab router (top-down toy scene).
      A camera loops through a room. Every chunk it leaves behind becomes a set of
      "slabs": a thin wedge of space (angular block x depth interval) sitting on the
      surface that block saw. For the current view, each query block is scored against
      every remembered slab by overlap (polygon IoU here, oriented-box IoU in the paper).
      Overlap softly boosts the model's own importance:  p~ ∝ p · (1 + λ · ĝ).
      The route keeps the previous chunk plus the top few fused scores.
      This is an illustration of the mechanism, not a rendering of real model state.

   2) Dense | Velox viewer: pre-rendered WBench navigation cases, one side-by-side file
      per case (dense on the left half, Velox on the right half), painted onto a canvas. */

(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stillMode = /[?&]still\b/.test(location.search);
  var uParam = /[?&]u=([\d.]+)/.exec(location.search);

  /* ====================================================================
     1) frustum-slab router
     ==================================================================== */
  (function router() {
    var cv = document.getElementById('slab-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var WW = 1000, WH = 560;

    /* ---- scene: a room with two pillars ---- */
    var walls = [];
    function rect(x0, y0, x1, y1) { walls.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]); }
    var ROOM = [40, 36, 960, 524], P1 = [300, 196, 424, 296], P2 = [584, 268, 716, 372];
    rect.apply(null, ROOM); rect.apply(null, P1); rect.apply(null, P2);

    var CX = 500, CY = 280, RX = 340, RY = 176;
    var CH_PER_LOOP = 14, LOOPS = 2.2;
    var DTH = 2 * Math.PI / CH_PER_LOOP;
    var NCH = Math.floor(LOOPS * CH_PER_LOOP);
    var FOV = 70 * Math.PI / 180, NB = 12;
    var LAMBDA = 2, GREF = 0.10, TAU = 0.01, KROUTE = 3;

    function pose(th) {
      var x = CX + RX * Math.cos(th), y = CY + RY * Math.sin(th);
      var tx = -RX * Math.sin(th), ty = RY * Math.cos(th);
      return { x: x, y: y, h: Math.atan2(ty, tx) + 0.38 * Math.sin(3 * th + 0.7) };
    }
    function cast(px, py, a) {
      var dx = Math.cos(a), dy = Math.sin(a), best = 1e9;
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i], ax = w[0], ay = w[1], ex = w[2] - ax, ey = w[3] - ay;
        var den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var t = ((ax - px) * ey - (ay - py) * ex) / den;
        var u = ((ax - px) * dy - (ay - py) * dx) / den;
        if (t > 1 && u >= 0 && u <= 1 && t < best) best = t;
      }
      return best;
    }
    function area(p) { var s = 0; for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
    function ccw(p) { return area(p) < 0 ? p.slice().reverse() : p; }
    function side(A, B, P) { return (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]); }
    function inter(S, E, A, B) {
      var x1 = S[0], y1 = S[1], x2 = E[0], y2 = E[1], x3 = A[0], y3 = A[1], x4 = B[0], y4 = B[1];
      var d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      var a = x1 * y2 - y1 * x2, b = x3 * y4 - y3 * x4;
      return [(a * (x3 - x4) - (x1 - x2) * b) / d, (a * (y3 - y4) - (y1 - y2) * b) / d];
    }
    function clip(subj, clp) {
      var out = subj;
      for (var i = 0; i < clp.length && out.length; i++) {
        var A = clp[i], B = clp[(i + 1) % clp.length], inp = out, S = inp[inp.length - 1];
        out = [];
        for (var j = 0; j < inp.length; j++) {
          var E = inp[j], eIn = side(A, B, E) >= 0, sIn = side(A, B, S) >= 0;
          if (eIn) { if (!sIn) out.push(inter(S, E, A, B)); out.push(E); }
          else if (sIn) out.push(inter(S, E, A, B));
          S = E;
        }
      }
      return out;
    }
    function hash(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

    function blocksFor(P, chunk) {
      var out = [];
      for (var b = 0; b < NB; b++) {
        var a0 = P.h - FOV / 2 + FOV * b / NB, a1 = P.h - FOV / 2 + FOV * (b + 1) / NB, am = (a0 + a1) / 2;
        var d = cast(P.x, P.y, am), th = Math.max(4, d * 0.035), lo = d - th, hi = d + th;
        var q = ccw([
          [P.x + lo * Math.cos(a0), P.y + lo * Math.sin(a0)], [P.x + lo * Math.cos(a1), P.y + lo * Math.sin(a1)],
          [P.x + hi * Math.cos(a1), P.y + hi * Math.sin(a1)], [P.x + hi * Math.cos(a0), P.y + hi * Math.sin(a0)]
        ]);
        var cxm = P.x + d * Math.cos(am), cym = P.y + d * Math.sin(am), r = 0;
        for (var k = 0; k < 4; k++) r = Math.max(r, Math.hypot(q[k][0] - cxm, q[k][1] - cym));
        out.push({ chunk: chunk, b: b, quad: q, area: area(q), cx: cxm, cy: cym, r: r });
      }
      return out;
    }

    /* history: one pose per chunk, cached once */
    var hist = [];
    for (var k = 0; k < NCH; k++) {
      var Ph = pose((k + 0.5) * DTH);
      hist.push({ pose: Ph, blocks: blocksFor(Ph, k) });
    }

    /* ---- UI state ---- */
    var state = { u: uParam ? parseFloat(uParam[1]) : 0.78, playing: !reduce && !stillMode, mode: 'route' };
    var elScrub = document.getElementById('slab-scrub');
    var elPlay = document.getElementById('slab-play');
    var elMode = document.getElementById('slab-mode');
    var ro = {
      chunk: document.getElementById('ro-chunk'), hist: document.getElementById('ro-hist'),
      dense: document.getElementById('ro-dense'), velox: document.getElementById('ro-velox'),
      recall: document.getElementById('ro-recall')
    };

    var cssW = 0, cssH = 0, S = 1, OX = 0, OY = 0;
    function resize() {
      var r = cv.getBoundingClientRect();
      cssW = r.width; cssH = r.height;
      cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR);
      S = Math.min(cssW / WW, cssH / WH);
      OX = (cssW - WW * S) / 2; OY = (cssH - WH * S) / 2;
    }

    function poly(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }

    function draw() {
      var u = state.u, theta = 2 * Math.PI * LOOPS * u;
      var c = Math.min(NCH, Math.floor(theta / DTH));              // chunks fully behind us
      var P = pose(theta);
      var Q = blocksFor(P, c);

      /* history list */
      var H = [];
      for (var k2 = 0; k2 < c; k2++) for (var b2 = 0; b2 < NB; b2++) H.push(hist[k2].blocks[b2]);

      /* score: overlap -> soft fusion -> route */
      var gmax = new Float32Array(H.length);
      var routes = [];
      var recalled = 0;
      for (var i = 0; i < Q.length; i++) {
        var q = Q[i], cand = [];
        for (var h = 0; h < H.length; h++) {
          var hb = H[h], g = 0;
          var dx = q.cx - hb.cx, dy = q.cy - hb.cy, rr = q.r + hb.r;
          if (dx * dx + dy * dy < rr * rr) {
            var I = area(clip(hb.quad, q.quad));
            if (I > 0) g = I / (q.area + hb.area - I);
          }
          var gh = g > TAU ? Math.min(g / GREF, 1) : 0;
          if (gh > gmax[h]) gmax[h] = gh;
          /* toy model importance: stable per pair, favouring nearby memory like real attention tends to */
          var near = Math.exp(-Math.hypot(dx, dy) / 360);
          var p = (0.25 + 0.75 * hash(i * 131 + hb.chunk * 17 + hb.b * 3 + 1)) * (0.35 + 0.65 * near);
          cand.push({ h: h, hb: hb, gh: gh, s: p * (1 + LAMBDA * gh) });
        }
        var prevSet = [], rest = [];
        for (var m = 0; m < cand.length; m++) {
          var cd = cand[m];
          if (cd.hb.chunk === c - 1 && Math.abs(cd.hb.b - i) <= 1) prevSet.push(cd); else rest.push(cd);
        }
        rest.sort(function (a, b) { return b.s - a.s; });
        routes.push({ prev: prevSet, top: rest.slice(0, KROUTE), all: cand });
      }

      /* ---- paint ---- */
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
      var lw = 1 / S;

      /* floor grid */
      ctx.strokeStyle = 'rgba(148,170,215,0.07)'; ctx.lineWidth = lw;
      ctx.beginPath();
      for (var gx = 40; gx <= 960; gx += 40) { ctx.moveTo(gx, 36); ctx.lineTo(gx, 524); }
      for (var gy = 36; gy <= 524; gy += 40) { ctx.moveTo(40, gy); ctx.lineTo(960, gy); }
      ctx.stroke();

      /* walls */
      ctx.strokeStyle = 'rgba(190,205,240,0.55)'; ctx.lineWidth = 2 * lw; ctx.lineJoin = 'round';
      ctx.strokeRect(ROOM[0], ROOM[1], ROOM[2] - ROOM[0], ROOM[3] - ROOM[1]);
      [P1, P2].forEach(function (pl) {
        ctx.fillStyle = 'rgba(148,170,215,0.06)';
        ctx.fillRect(pl[0], pl[1], pl[2] - pl[0], pl[3] - pl[1]);
        ctx.strokeRect(pl[0], pl[1], pl[2] - pl[0], pl[3] - pl[1]);
      });

      /* camera path */
      ctx.setLineDash([4 * lw, 7 * lw]); ctx.strokeStyle = 'rgba(148,170,215,0.28)'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

      /* history slabs */
      var selectedSet = {};
      if (state.mode === 'route') {
        routes.forEach(function (r) {
          r.prev.forEach(function (cd) { selectedSet[cd.h] = selectedSet[cd.h] || 'prev'; });
          r.top.forEach(function (cd) { selectedSet[cd.h] = cd.gh > 0 ? 'geo' : (selectedSet[cd.h] || 'model'); });
        });
      }
      for (var hi = 0; hi < H.length; hi++) {
        var sb = H[hi], gm = gmax[hi], sel = selectedSet[hi];
        var a = 0.18 + 0.5 * gm;
        if (sel === 'geo') a = 0.95;
        poly(sb.quad);
        ctx.fillStyle = (gm > 0 || sel) ? 'rgba(82,224,255,' + a.toFixed(2) + ')' : 'rgba(120,150,210,0.20)';
        ctx.fill();
        if (sel === 'geo' && sb.chunk < c - 6) {
          recalled++;
          ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.6 * lw; ctx.stroke();
        }
      }

      /* history cameras */
      ctx.fillStyle = 'rgba(190,205,240,0.35)';
      for (var kc = 0; kc < c; kc++) { ctx.beginPath(); ctx.arc(hist[kc].pose.x, hist[kc].pose.y, 2.6, 0, 6.2832); ctx.fill(); }

      /* current frustum: the visibility polygon, ending on whatever the camera sees */
      var fa0 = P.h - FOV / 2, fa1 = P.h + FOV / 2;
      ctx.beginPath(); ctx.moveTo(P.x, P.y);
      for (var fs = 0; fs <= 28; fs++) {
        var fa = fa0 + (fa1 - fa0) * fs / 28, fd = cast(P.x, P.y, fa);
        ctx.lineTo(P.x + fd * Math.cos(fa), P.y + fd * Math.sin(fa));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(140,123,255,0.13)'; ctx.fill();
      ctx.strokeStyle = 'rgba(180,170,255,0.55)'; ctx.lineWidth = lw; ctx.stroke();

      /* links: query -> remembered slab */
      function link(q, hb, col, wid) {
        ctx.strokeStyle = col; ctx.lineWidth = wid * lw;
        ctx.beginPath(); ctx.moveTo(q.cx, q.cy);
        var mx = (q.cx + hb.cx) / 2, my = (q.cy + hb.cy) / 2;
        var nx = -(hb.cy - q.cy) * 0.12, ny = (hb.cx - q.cx) * 0.12;
        ctx.quadraticCurveTo(mx + nx, my + ny, hb.cx, hb.cy);
        ctx.stroke();
      }
      if (state.mode === 'dense') {
        for (var di = 0; di < routes.length; di++) {
          var al = routes[di].all;
          for (var dj = 0; dj < al.length; dj++) link(Q[di], al[dj].hb, 'rgba(160,175,215,0.075)', 1);
        }
      } else {
        for (var ri = 0; ri < routes.length; ri++) {
          var rt = routes[ri];
          rt.prev.forEach(function (cd) { link(Q[ri], cd.hb, 'rgba(255,255,255,0.45)', 1.2); });
          rt.top.forEach(function (cd) {
            if (cd.gh > 0) link(Q[ri], cd.hb, 'rgba(82,224,255,0.85)', 1.6);
            else link(Q[ri], cd.hb, 'rgba(140,123,255,0.5)', 1.2);
          });
        }
      }

      /* current query slabs */
      for (var qj = 0; qj < Q.length; qj++) {
        poly(Q[qj].quad);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4 * lw; ctx.stroke();
      }

      /* camera */
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P.x, P.y, 6, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5 * lw;
      ctx.beginPath(); ctx.arc(P.x, P.y, 11, 0, 6.2832); ctx.stroke();

      /* readouts */
      var M = H.length;
      if (ro.chunk) ro.chunk.textContent = (c + 1) + ' / ' + NCH;
      if (ro.hist) ro.hist.textContent = M;
      if (ro.dense) ro.dense.textContent = M;
      if (ro.velox) ro.velox.textContent = state.mode === 'route' ? '≤ ' + (KROUTE + 3) : M;
      if (ro.recall) ro.recall.textContent = state.mode === 'route' ? recalled : '—';
      if (elScrub) { elScrub.value = Math.round(u * 1000); elScrub.style.setProperty('--fill', (u * 100) + '%'); }
    }

    /* ---- loop + controls ---- */
    var raf = 0, last = 0, visible = true, holdUntil = 0;
    var DURATION = 30000;    // ms for one full rollout
    function setPlaying(p) {
      state.playing = p;
      if (elPlay) {
        elPlay.setAttribute('aria-pressed', p ? 'true' : 'false');
        elPlay.setAttribute('aria-label', p ? 'Pause' : 'Play');
        elPlay.innerHTML = p
          ? '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1.5" width="3.6" height="11" rx="1"/><rect x="8.4" y="1.5" width="3.6" height="11" rx="1"/></svg>'
          : '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z"/></svg>';
      }
      schedule();
    }
    function frame(ts) {
      raf = 0;
      if (!state.playing || !visible || document.hidden) { last = 0; return; }
      if (!last) last = ts;
      var dt = Math.min(100, ts - last); last = ts;
      if (holdUntil) {
        if (ts >= holdUntil) { state.u = 0.02; holdUntil = 0; }
      } else {
        state.u += dt / DURATION;
        if (state.u >= 1) { state.u = 1; holdUntil = ts + 1800; }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }
    function schedule() {
      if (!raf && state.playing && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
    }

    if (elPlay) elPlay.addEventListener('click', function () { last = 0; setPlaying(!state.playing); });
    if (elScrub) elScrub.addEventListener('input', function () {
      state.u = Math.max(0.0, Math.min(1, elScrub.value / 1000));
      holdUntil = 0; setPlaying(false); draw();
    });
    if (elMode) elMode.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      state.mode = b.getAttribute('data-mode');
      [].forEach.call(elMode.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      draw();
    });

    /* drag the canvas to scrub */
    var drag = null;
    cv.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, u: state.u };
      cv.setPointerCapture(e.pointerId);
      holdUntil = 0; setPlaying(false);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var du = (e.clientX - drag.x) / Math.max(1, cssW) * 0.7;
      state.u = Math.max(0, Math.min(1, drag.u + du));
      draw();
    });
    function endDrag() { drag = null; }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); last = 0; setPlaying(!state.playing); }
      if (e.key === 'ArrowRight') { state.u = Math.min(1, state.u + 0.02); setPlaying(false); draw(); }
      if (e.key === 'ArrowLeft') { state.u = Math.max(0, state.u - 0.02); setPlaying(false); draw(); }
    });

    window.addEventListener('resize', function () { resize(); draw(); });
    document.addEventListener('visibilitychange', function () { last = 0; schedule(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; last = 0; schedule(); }, { threshold: 0.15 }).observe(cv);
    }

    resize();
    draw();
    setPlaying(state.playing);
  })();

  /* ====================================================================
     2) dense | Velox viewer
     ==================================================================== */
  (function viewer() {
    var wipe = document.getElementById('vx-wipe');
    if (!wipe) return;
    var cv = document.getElementById('vx-canvas');
    var ctx = cv.getContext('2d');
    var vid = document.getElementById('vx-video');
    var xr = document.getElementById('vx-x');
    var tr = document.getElementById('vx-t');
    var tt = document.getElementById('vx-tt');
    var playBtn = document.getElementById('vx-play');
    var modeBox = document.getElementById('vx-mode');
    var picker = document.getElementById('vx-cases');
    var label = document.getElementById('vx-case');

    var HALF = 832, H = 464, FULL = 1664;
    var mode = 'wipe', x = 0.5, cur = null;
    var playing = !reduce, inView = false, started = false, seeking = false;
    var poster = new Image(), posterReady = false;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function fmt(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

    function src() {
      if (started && vid.readyState >= 2 && vid.videoWidth) return { s: vid, k: vid.videoWidth / FULL };
      if (posterReady && poster.naturalWidth) return { s: poster, k: poster.naturalWidth / FULL };
      return null;
    }
    function paint() {
      var o = src();
      if (!o) return;
      var s = o.s, k = o.k;
      try {
        if (mode === 'pair') {
          ctx.drawImage(s, 0, 0, FULL * k, H * k, 0, 0, FULL, H);
        } else {
          var xp = Math.round(x * HALF);
          ctx.drawImage(s, 0, 0, HALF * k, H * k, 0, 0, HALF, H);
          if (xp < HALF) ctx.drawImage(s, (HALF + xp) * k, 0, (HALF - xp) * k, H * k, xp, 0, HALF - xp, H);
        }
      } catch (e) { /* not ready yet */ }
    }
    function setX(v) {
      x = clamp(v, 0, 1);
      wipe.style.setProperty('--x', (x * 100) + '%');
      xr.value = Math.round(x * 1000);
      paint();
    }
    function setMode(m) {
      mode = m;
      wipe.setAttribute('data-mode', m);
      cv.width = m === 'pair' ? FULL : HALF; cv.height = H;
      [].forEach.call(modeBox.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === m ? 'true' : 'false'); });
      paint();
    }
    function timeUi() {
      var d = vid.duration || 0, t = vid.currentTime || 0;
      if (!seeking && d) tr.value = Math.round(t / d * 1000);
      tr.style.setProperty('--fill', (d ? t / d * 100 : 0) + '%');
      tt.textContent = fmt(t) + ' / ' + fmt(d);
    }

    function attach() {
      if (!cur) return;
      var url = 'https://media.velox-world.com/velox/videos/clip_' + cur + '.mp4';
      if (vid.getAttribute('data-n') !== cur) {
        vid.setAttribute('data-n', cur);
        started = false;
        vid.src = url;
        vid.load();
      }
      if (playing) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    }
    function load(btn) {
      cur = btn.getAttribute('data-n');
      posterReady = false; started = false;
      poster.onload = function () { posterReady = true; paint(); };
      poster.src = 'https://media.velox-world.com/velox/videos/posters/clip_' + cur + '.jpg';
      [].forEach.call(picker.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      label.textContent = 'Clip ' + parseInt(cur, 10) + ' of ' + picker.querySelectorAll('button').length;
      tr.value = 0; tt.textContent = '0:00 / 0:00';
      if (inView) attach();
    }

    vid.addEventListener('playing', function () { started = true; });
    vid.addEventListener('loadeddata', function () { paint(); timeUi(); });
    vid.addEventListener('timeupdate', timeUi);
    vid.addEventListener('durationchange', timeUi);

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
      if (p && inView) { attach(); startLoop(); } else { vid.pause(); }
    }

    xr.addEventListener('input', function () { setX(xr.value / 1000); });
    tr.addEventListener('input', function () {
      seeking = true;
      var d = vid.duration || 0;
      if (d) { vid.currentTime = tr.value / 1000 * d; }
      timeUi(); paint();
    });
    tr.addEventListener('change', function () { seeking = false; });
    playBtn.addEventListener('click', function () { setPlaying(!playing); });
    modeBox.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (b) setMode(b.getAttribute('data-mode'));
    });
    picker.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (b) load(b);
    });

    /* one gentle sweep on arrival so the wipe reads as draggable */
    var swept = false;
    function intro() {
      if (swept || reduce || mode !== 'wipe') return;
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
        if (inView) { attach(); if (playing) startLoop(); intro(); }
        else { vid.pause(); stopLoop(); }
      }, { threshold: 0.25 }).observe(wipe);
    } else { inView = true; attach(); startLoop(); }

    var first = picker.querySelector('button[aria-pressed="true"]') || picker.querySelector('button');
    setMode('wipe');
    setX(0.5);
    load(first);
  })();
})();
