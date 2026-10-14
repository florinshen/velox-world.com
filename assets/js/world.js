/* Velox World — hero "world".
   A mesh of points flying through a valley, rendered live on a 2D canvas.
   Three ideas are baked in on purpose:
     - the camera responds to the cursor (interaction is the point),
     - terrain far from the camera is still "noise" and settles into structure as
       it approaches (the world is being denoised into existence ahead of you),
     - an agent imagines several futures ahead of it; they fan out, blur with
       the horizon, and it commits to the one you are looking toward.
   Pauses when off-screen or the tab is hidden. `?still=<seconds>` (and
   prefers-reduced-motion) render a single frame instead of animating. */
(function () {
  'use strict';
  var canvas = document.getElementById('world');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stillParam = /[?&]still(?:=([\d.]+))?/.exec(location.search);
  var still = reduce || !!stillParam;
  var stillT = stillParam && stillParam[1] ? parseFloat(stillParam[1]) * 1000 : 4200;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;

  /* mesh */
  var COLS = 96, ROWS = 84;
  var DX = 0.62, DZ = 0.78;
  var CAM_H = 2.6;

  var lowQ = false, dtAvg = 16, nFrames = 0, lastT = 0;   // drops detail if frames run long
  var look = { tx: 0, ty: 0 };
  var FUT = 7, chosen = 3;                                // imagined futures; index of the committed one
  var hudPlan = document.getElementById('hud-plan');
  var pointer = { x: 0.5, y: 0.5, active: false };

  /* projected mesh, reused every frame */
  var PX = new Float32Array(ROWS * COLS);
  var PY = new Float32Array(ROWS * COLS);
  var PH = new Float32Array(ROWS * COLS);   // normalised height 0..1
  var OK = new Uint8Array(ROWS * COLS);

  function hash(ix, iz) {
    var h = (ix * 374761393 + iz * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  /* a canyon: floor near y=0, walls rising with |x|, a few rolling swells */
  function terrain(x, z) {
    return 0.05 * x * x
      + 1.15 * Math.sin(x * 0.23 + z * 0.10)
      + 0.85 * Math.sin(x * 0.075 - z * 0.17 + 1.7)
      + 0.4 * Math.sin(x * 0.5 + z * 0.33 + 0.4)
      - 1.2;
  }

  /* height ramp: blue -> cyan -> violet-white */
  var RAMP = [];
  (function () {
    var stops = [[34, 78, 190], [52, 150, 235], [82, 224, 255], [150, 150, 255], [238, 242, 255]];
    var N = 10;
    for (var i = 0; i < N; i++) {
      var f = i / (N - 1) * (stops.length - 1);
      var a = Math.floor(f), b = Math.min(stops.length - 1, a + 1), t = f - a;
      RAMP.push([0, 1, 2].map(function (k) { return Math.round(stops[a][k] + (stops[b][k] - stops[a][k]) * t); }));
    }
  })();
  var AL = 5;
  var dotBuckets = [];
  for (var q = 0; q < RAMP.length * AL; q++) dotBuckets.push([]);
  var colSeg = [];
  for (var q2 = 0; q2 < 6; q2++) colSeg.push([]);

  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function frame(t) {
    var time = t * 0.001;
    ctx.clearRect(0, 0, W, H);

    var tx, ty;
    if (pointer.active) { tx = (pointer.x - 0.5) * 2; ty = (pointer.y - 0.5) * 2; }
    else { tx = Math.sin(time * 0.17) * 0.5; ty = Math.sin(time * 0.11 + 1.3) * 0.2; }
    look.tx += (tx - look.tx) * 0.05;
    look.ty += (ty - look.ty) * 0.05;

    var yaw = look.tx * 0.34;
    var pitch = -0.06 + look.ty * 0.09;
    var camX = Math.sin(time * 0.21) * 1.4 + look.tx * 2.4;
    var camY = CAM_H + Math.sin(time * 0.29) * 0.14 - look.ty * 0.5;
    var z0 = time * 4.6;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);

    var focal = Math.max(W * 0.62, H * 0.95);
    var cx = W * (W > 900 ? 0.64 : 0.5), cyS = H * 0.36;      // on wide screens the world opens to the right of the headline
    var baseRow = Math.floor(z0 / DZ);
    var off = z0 - baseRow * DZ;
    var tB = Math.floor(time * 8);          // shimmer cadence of the unresolved far field

    for (var b = 0; b < dotBuckets.length; b++) dotBuckets[b].length = 0;
    for (var s = 0; s < colSeg.length; s++) colSeg[s].length = 0;

    /* ---- project the mesh ---- */
    for (var j = 0; j < ROWS; j++) {
      var rowIdx = baseRow + j;
      var zw = rowIdx * DZ;
      var dzRel = j * DZ - off + 1.5;
      var dN = j / (ROWS - 1);
      var noise = dN < 0.42 ? 0 : Math.pow((dN - 0.42) / 0.58, 1.5);

      for (var i = 0; i < COLS; i++) {
        var k = j * COLS + i;
        var colIdx = i - COLS / 2;
        var xw = colIdx * DX;
        var yw = terrain(xw, zw);
        var zj = 0;
        if (noise > 0) {
          var h1 = hash(colIdx, rowIdx + tB * 7);
          var h2 = hash(colIdx + 91, rowIdx - tB * 3);
          xw += (h1 - 0.5) * 1.5 * noise;
          yw += (h2 - 0.5) * 3.0 * noise;
          zj = (h1 - 0.5) * 1.2 * noise;
        }
        var rx = xw - camX, ry = yw - camY, rz = dzRel + zj;
        var x1 = rx * cy - rz * sy;
        var z1 = rx * sy + rz * cy;
        var y2 = ry * cp - z1 * sp;
        var z2 = ry * sp + z1 * cp;
        if (z2 < 0.5) { OK[k] = 0; continue; }
        OK[k] = 1;
        PX[k] = cx + (x1 / z2) * focal;
        PY[k] = cyS - (y2 / z2) * focal;
        PH[k] = Math.min(1, Math.max(0, (yw + 1.5) / 7.5));
      }
    }

    /* ---- soft glow where the world meets the sky ---- */
    var hg = ctx.createLinearGradient(0, cyS - H * 0.22, 0, cyS + H * 0.14);
    hg.addColorStop(0, 'rgba(82,224,255,0)'); hg.addColorStop(0.62, 'rgba(82,224,255,0.10)'); hg.addColorStop(1, 'rgba(82,224,255,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, cyS - H * 0.22, W, H * 0.36);

    /* ---- row lines: one polyline per row, alpha by distance ---- */
    ctx.lineWidth = 1;
    var pulseRow = (time * 9) % (ROWS * 1.5);              // a sensing front sweeping away from the camera
    for (var jr = 0; jr < ROWS; jr += (lowQ ? 2 : 1)) {
      var dn = jr / (ROWS - 1);
      var fog = Math.pow(1 - dn, 1.15);
      if (fog < 0.05) continue;
      var nz = dn < 0.42 ? 0 : (dn - 0.42) / 0.58;
      ctx.strokeStyle = 'rgba(70,160,255,' + (0.05 + 0.30 * fog * (1 - 0.6 * nz)).toFixed(3) + ')';
      ctx.beginPath();
      var pen = false;
      for (var ic = 0; ic < COLS; ic++) {
        var kk = jr * COLS + ic;
        if (!OK[kk]) { pen = false; continue; }
        if (!pen) { ctx.moveTo(PX[kk], PY[kk]); pen = true; } else ctx.lineTo(PX[kk], PY[kk]);
      }
      ctx.stroke();
      var pz = Math.exp(-Math.pow((jr - pulseRow) / 2.3, 2));
      if (pz > 0.05) {
        ctx.strokeStyle = 'rgba(190,240,255,' + (0.55 * pz * fog).toFixed(3) + ')';
        ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1;
      }
    }

    /* ---- column segments (every 3rd column), bucketed by distance ---- */
    for (var jc = 0; jc < ROWS - 1; jc++) {
      var dnc = jc / (ROWS - 1);
      var fc = Math.pow(1 - dnc, 1.15);
      if (fc < 0.05) continue;
      var bkt = Math.min(5, Math.floor(fc * 6));
      var arr = colSeg[bkt];
      for (var cc = 0; cc < COLS; cc += (lowQ ? 6 : 3)) {
        var a0 = jc * COLS + cc, a1 = a0 + COLS;
        if (!OK[a0] || !OK[a1]) continue;
        arr.push(PX[a0], PY[a0], PX[a1], PY[a1]);
      }
    }
    for (var bb = 0; bb < colSeg.length; bb++) {
      var sg = colSeg[bb];
      if (!sg.length) continue;
      ctx.strokeStyle = 'rgba(70,160,255,' + (0.04 + 0.16 * (bb / 5)).toFixed(3) + ')';
      ctx.beginPath();
      for (var m = 0; m < sg.length; m += 4) { ctx.moveTo(sg[m], sg[m + 1]); ctx.lineTo(sg[m + 2], sg[m + 3]); }
      ctx.stroke();
    }

    /* ---- points, bucketed by height colour and distance ---- */
    for (var jd = 0; jd < ROWS; jd++) {
      var dd = jd / (ROWS - 1);
      var fd = Math.pow(1 - dd, 1.1);
      var ndz = dd < 0.42 ? 0 : (dd - 0.42) / 0.58;
      var alpha = fd * (1 - 0.5 * ndz);
      if (alpha < 0.06) continue;
      var ai = Math.min(AL - 1, Math.floor(alpha * AL));
      for (var id = 0; id < COLS; id += (lowQ ? 4 : 2)) {
        var kd = jd * COLS + id;
        if (!OK[kd]) continue;
        var px = PX[kd], py = PY[kd];
        if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
        var ci = Math.min(RAMP.length - 1, Math.floor(PH[kd] * RAMP.length));
        var sz = 1.2 + 2.4 * fd * fd;
        dotBuckets[ci * AL + ai].push(px, py, sz);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (var c = 0; c < RAMP.length; c++) {
      for (var al = 0; al < AL; al++) {
        var pts = dotBuckets[c * AL + al];
        if (!pts.length) continue;
        var A = 0.22 + 0.78 * ((al + 1) / AL);
        ctx.fillStyle = 'rgba(' + RAMP[c][0] + ',' + RAMP[c][1] + ',' + RAMP[c][2] + ',' + A.toFixed(2) + ')';
        ctx.beginPath();
        for (var p = 0; p < pts.length; p += 3) {
          var sd = pts[p + 2];
          ctx.rect(pts[p] - sd * 0.5, pts[p + 1] - sd * 0.5, sd, sd);
        }
        ctx.fill();
      }
    }

    /* ---- imagined futures: a fan of candidate rollouts from the agent, blurring with the horizon ---- */
    var want = Math.round((FUT - 1) / 2 + look.tx * 2.6);
    want = Math.max(0, Math.min(FUT - 1, want));
    chosen += (want - chosen) * 0.06;
    var selI = Math.round(chosen);
    var STEP = lowQ ? 2 : 1, NS = 24;
    for (var f = 0; f < FUT; f++) {
      var isSel = f === selI;
      var curv = (f - (FUT - 1) / 2) * 0.0043 + 0.0009 * Math.sin(time * 0.6 + f * 1.7);
      var psx = 0, psy = 0, have = false;
      for (var si = 0; si <= NS; si += STEP) {
        var dz = 2.4 + si * 1.5;
        var unc = Math.max(0, (dz - 12) / 26);                         // uncertainty grows with horizon
        var fx = camX + curv * dz * dz + Math.sin(time * 1.4 + f * 2.1 + si * 0.7) * 0.55 * unc;
        var fyw = terrain(fx, z0 + dz - 1.5) + 0.18 + Math.sin(time * 1.1 + f + si * 0.5) * 0.25 * unc;
        var frx = fx - camX, fry = fyw - camY;
        var fx1 = frx * cy - dz * sy, fz1 = frx * sy + dz * cy;
        var fy2 = fry * cp - fz1 * sp, fz2 = fry * sp + fz1 * cp;
        if (fz2 < 0.5) { have = false; continue; }
        var fsx = cx + (fx1 / fz2) * focal, fsy = cyS - (fy2 / fz2) * focal;
        if (have) {
          var fa = Math.pow(1 - si / (NS + 4), 1.3);
          if (isSel) {
            ctx.strokeStyle = 'rgba(120,225,255,' + (0.22 * fa).toFixed(3) + ')'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(psx, psy); ctx.lineTo(fsx, fsy); ctx.stroke();
            ctx.strokeStyle = 'rgba(205,245,255,' + (0.95 * fa).toFixed(3) + ')'; ctx.lineWidth = 2.1;
          } else {
            ctx.strokeStyle = 'rgba(170,150,255,' + (0.75 * fa).toFixed(3) + ')'; ctx.lineWidth = 1.3;
          }
          ctx.beginPath(); ctx.moveTo(psx, psy); ctx.lineTo(fsx, fsy); ctx.stroke();
        }
        psx = fsx; psy = fsy; have = true;
      }
      if (have) {                                                    // where this future ends
        ctx.strokeStyle = isSel ? 'rgba(205,245,255,0.9)' : 'rgba(160,140,255,0.45)';
        ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(psx, psy, isSel ? 4.5 : 3, 0, 6.2832); ctx.stroke();
      }
    }

    /* ---- the agent ---- */
    var adz = 2.2, ax = camX, ayw = terrain(ax, z0 + adz - 1.5) + 0.3;
    var arx = ax - camX, ary = ayw - camY;
    var ax1 = arx * cy - adz * sy, az1 = arx * sy + adz * cy;
    var ay2 = ary * cp - az1 * sp, az2 = ary * sp + az1 * cp;
    if (az2 > 0.5) {
      var asx = cx + (ax1 / az2) * focal, asy = cyS - (ay2 / az2) * focal;
      var ar = 14 + 5 * Math.sin(time * 3);
      var ag = ctx.createRadialGradient(asx, asy, 0, asx, asy, ar * 2.2);
      ag.addColorStop(0, 'rgba(160,235,255,0.55)'); ag.addColorStop(1, 'rgba(160,235,255,0)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(asx, asy, ar * 2.2, 0, 6.2832); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(asx, asy, 3.2, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (hudPlan) hudPlan.textContent = String(selI + 1);
  }

  var raf = 0, running = false, visible = true;
  function loop(t) {
    if (!running) return;
    if (lastT) {
      var d = t - lastT;
      if (d < 250) dtAvg = dtAvg * 0.94 + d * 0.06;
      if (++nFrames > 90 && !lowQ && dtAvg > 26) { lowQ = true; DPR = 1; resize(); }
    }
    lastT = t;
    frame(t);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (running || still) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; lastT = 0; cancelAnimationFrame(raf); }
  function sync() { if (visible && !document.hidden) start(); else stop(); }

  resize();
  if (still) { frame(stillT); }
  else { sync(); }

  window.addEventListener('resize', function () { resize(); if (still) frame(stillT); });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(canvas);
  }

  var host = canvas.parentElement;
  host.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = host.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
    pointer.active = true;
  }, { passive: true });
  host.addEventListener('pointerleave', function () { pointer.active = false; });

  /* live HUD readouts, if present */
  var hudCam = document.getElementById('hud-cam');
  var hudFps = document.getElementById('hud-fps');
  if (hudCam || hudFps) {
    var frames = 0, last = performance.now();
    (function tick() {
      frames++;
      var now = performance.now();
      if (now - last >= 500) {
        if (hudFps) hudFps.textContent = running ? Math.round(frames * 1000 / (now - last)) : '—';
        frames = 0; last = now;
      }
      if (hudCam) {
        hudCam.textContent = (look.tx * 2.4).toFixed(2) + ' · ' + (CAM_H - look.ty * 0.5).toFixed(2);
      }
      if (running) requestAnimationFrame(tick); else setTimeout(tick, 500);
    })();
  }
})();
