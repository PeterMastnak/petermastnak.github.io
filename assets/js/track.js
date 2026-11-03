/* A synthetic Atlantic bluefin tuna track (illustration, not real tag data),
 * drawn behind the projects section on a coarse North Atlantic map.
 * Click near a coastline to launch a coastal Kelvin wave: it travels with the
 * coast on its right (left after pressing "g" for the Southern Hemisphere) and
 * decays offshore over a Rossby radius. */
(function () {
  var c = document.getElementById('track');
  if (!c || !c.getContext) return;
  var g = c.getContext('2d'), root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var LON0 = -84, LON1 = -2, LAT0 = 22, LAT1 = 50, COSL = Math.cos(36 * Math.PI / 180);
  // coarse coastlines (lon, lat)
  var COAST = [
    [-97.5,26,-97,28,-94,29.6,-90,29.2,-89,30.3,-85,29.7,-83,29,-82.6,27.5,-81.2,25.2,-80.1,25.8,-80.6,28.5,-81.4,30.6,-79.2,33.2,-77.9,34,-75.5,35.3,-76,37,-75.2,38.5,-74,40.5,-72,41,-70,41.6,-70.6,42.6,-70.2,43.7,-67,44.8,-65.5,43.5,-63.5,44.6,-60,45.6,-61.5,47,-64.5,48.9,-66,50.2,-60,50.3,-56,51.6,-56,53.5],
    [-59.3,47.6,-56,46.9,-53,46.6,-52.7,47.6,-53.5,49.3,-55.5,49.9,-55.6,51.6,-57.3,50.6,-59.3,47.6],
    [-85,21.8,-82,23.1,-79,22.5,-77,21,-74.2,20.2,-77.5,19.9,-80,21.6,-84,21.9,-85,21.8],
    [-97.5,26,-97.7,22,-96,19,-94.5,18.2,-92,18.6,-90.5,21,-87,21.5],
    [-5.6,36,-9,37,-9.5,39,-8.8,42,-9.2,43.2,-8,43.7,-1.8,43.4,-1.2,46,-4.7,48,-1.5,48.7,1.6,50.8,4,51.5],
    [-5.7,50,1.3,51.1,1.7,52.7,0,53.5,-1.6,55.6,-2.1,57.7,-5,58.6,-6.2,56.5,-4.8,54.8,-3,53.4,-5.2,51.7,-5.7,50],
    [-6,52.2,-6.3,54,-8,55.2,-10,54.2,-10.3,52,-8.5,51.6,-6,52.2],
    [-5.9,35.8,-6.8,34,-9.7,30.4,-13.2,27.6,-16,23.8,-17.1,21,-16.5,19],
    [-5.6,36,-4.4,36.7,-2,36.8,0.2,38.8],
    [-5.3,35.9,-2,35.1,1,36.5]
  ];
  // for each coastline: walking in vertex order, is the land on the left?
  var LANDLEFT = [true, true, false, false, false, true, true, true, true, false];
  // synthetic route: tagged off Cape Hatteras, rides the Gulf Stream, loops on the
  // Grand Banks feeding grounds, crosses the basin, enters the Mediterranean
  var CTRL = [[-75.2,35.4],[-73,36.4],[-70,37.4],[-66,38.9],[-61,40.3],[-55.5,41.8],[-50,43.8],[-47.5,46],
              [-50.5,47],[-52,45],[-48.5,42.5],[-43,41],[-36,39.6],[-28,38.6],[-20,37.6],[-13,36.6],[-8,36.1],[-5.4,35.95],[-3.5,36.3]];

  var W, H, dpr, sc, ox, oy, path = [], coasts = [], waves = [], t0 = null, running = false, visible = false, raf;
  var DRAW = 9000, HOLD = 3000, FADE = 1200;

  function proj(lon, lat) { return [ox + (lon - LON0) * COSL * sc, oy + (LAT1 - lat) * sc]; }

  function catmull(pts, n) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var k = 0; k < n; k++) {
        var t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(function (d) {
          return 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        }));
      }
    }
    out.push(pts[pts.length - 1]);
    return out.map(function (p, i) {        // daily-position jitter, deterministic
      return [p[0] + 0.35 * Math.sin(i * 0.9) + 0.2 * Math.sin(i * 2.3), p[1] + 0.3 * Math.sin(i * 1.3 + 1) + 0.15 * Math.sin(i * 3.1)];
    });
  }

  function size() {
    var r = c.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var mw = (LON1 - LON0) * COSL, mh = LAT1 - LAT0;
    sc = Math.min(W / mw, H / mh);
    ox = (W - mw * sc) / 2; oy = (H - mh * sc) / 2;
    path = catmull(CTRL, 8).map(function (p) { return proj(p[0], p[1]); });
    // coastlines resampled every ~3 px, with arclength and seaward normal
    coasts = COAST.map(function (line, li) {
      var pts = [], sAcc = 0;
      for (var i = 0; i < line.length - 2; i += 2) {
        var a = proj(line[i], line[i + 1]), b = proj(line[i + 2], line[i + 3]);
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = (LANDLEFT[li] ? -dy : dy) / L, ny = (LANDLEFT[li] ? dx : -dx) / L;  // seaward (screen coords)
        for (var q = 0; q < L; q += 3) pts.push({ x: a[0] + dx * q / L, y: a[1] + dy * q / L, s: sAcc + q, nx: nx, ny: ny });
        sAcc += L;
      }
      return { pts: pts, len: sAcc, landLeft: LANDLEFT[li] };
    });
    waves = [];
  }

  function launch(cx, cy, now) {
    var best = null, bd = 14 * 14;
    coasts.forEach(function (co) {
      co.pts.forEach(function (p) {
        var d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy);
        if (d < bd) { bd = d; best = { co: co, s0: p.s }; }
      });
    });
    if (!best) return false;
    var hemi = (window.__ocean && window.__ocean.hemi) || 1;
    waves.push({ co: best.co, s0: best.s0, dir: (best.co.landLeft ? -1 : 1) * hemi, t: now });
    if (waves.length > 8) waves.shift();
    return true;
  }

  function drawWaves(now, warm) {
    for (var w = waves.length - 1; w >= 0; w--) {
      var wv = waves[w], el = now - wv.t, sc0 = wv.s0 + wv.dir * 0.08 * el;
      var fade = Math.min(1, el / 200) * Math.max(0, 1 - el / 9000);
      if (fade <= 0 || sc0 < -60 || sc0 > wv.co.len + 60) { waves.splice(w, 1); continue; }
      var pts = wv.co.pts;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], ds = (p.s - sc0) / 20;
        if (ds < -3 || ds > 3) continue;
        var A = Math.exp(-ds * ds) * fade;
        for (var o = 0; o <= 15; o += 3) {
          var a = A * Math.exp(-o / 6) * 0.9;
          g.fillStyle = 'rgba(' + warm + ',' + a.toFixed(3) + ')';
          g.fillRect(p.x + p.nx * o - 1, p.y + p.ny * o - 1, 2, 2);
        }
      }
    }
  }

  function draw(now) {
    var dark = root.classList.contains('dark');
    var ink = dark ? '201,212,220' : '51,51,51', warm = dark ? '255,130,100' : '192,57,43';
    if (t0 === null) t0 = now;
    var el = (now - t0) % (DRAW + HOLD + FADE);
    var prog = Math.min(1, el / DRAW), fade = el > DRAW + HOLD ? 1 - (el - DRAW - HOLD) / FADE : 1;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 0.6; g.strokeStyle = 'rgba(' + ink + ',0.08)'; g.beginPath();
    for (var lo = -80; lo <= 0; lo += 10) { var a = proj(lo, LAT0), b = proj(lo, LAT1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    for (var la = 30; la <= 50; la += 10) { var e = proj(LON0, la), f = proj(LON1, la); g.moveTo(e[0], e[1]); g.lineTo(f[0], f[1]); }
    g.stroke();
    g.lineWidth = 0.9; g.strokeStyle = 'rgba(' + ink + ',0.22)';
    COAST.forEach(function (line) {
      g.beginPath();
      for (var i = 0; i < line.length; i += 2) { var p = proj(line[i], line[i + 1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
    });
    var n = Math.max(1, Math.floor(prog * (path.length - 1)));
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(' + warm + ',' + (0.45 * fade).toFixed(3) + ')'; g.beginPath();
    for (var k = 0; k <= n; k++) { if (k) g.lineTo(path[k][0], path[k][1]); else g.moveTo(path[k][0], path[k][1]); }
    g.stroke();
    g.fillStyle = 'rgba(' + warm + ',' + (0.5 * fade).toFixed(3) + ')';
    for (var d = 0; d <= n; d += 4) { g.beginPath(); g.arc(path[d][0], path[d][1], 1.3, 0, 7); g.fill(); }
    drawWaves(now, dark ? '92,200,230' : '10,106,138');
    var h = path[n];
    g.fillStyle = 'rgba(' + warm + ',' + (0.9 * fade).toFixed(3) + ')';
    g.beginPath(); g.arc(h[0], h[1], 2.6, 0, 7); g.fill();
    g.fillStyle = 'rgba(' + ink + ',0.35)'; g.font = '10px "Open Sans", sans-serif';
    g.textAlign = 'right'; g.fillText('bluefin track illustration', W - 2, H - 4);
  }

  function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function update() {
    var should = visible && !document.hidden && !reduce;
    if (should && !running) { running = true; t0 = null; raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  // click near a coast (canvas itself ignores pointer events; listen on window, capture phase)
  window.addEventListener('click', function (ev) {
    if (reduce || (ev.target.closest && ev.target.closest('a, button'))) return;
    var r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (x < -14 || y < -14 || x > W + 14 || y > H + 14) return;
    if (launch(x, y, performance.now())) ev.__kelvin = true;   // tells jet.js not to drop an eddy
  }, true);

  size();
  if (reduce) { t0 = 0; draw(DRAW); }
  window.addEventListener('resize', function () { size(); if (reduce) { t0 = 0; draw(DRAW); } });
  if ('IntersectionObserver' in window)
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; update(); }).observe(c);
  else visible = true;
  document.addEventListener('visibilitychange', update);
  update();
})();
