/* Ambient layers tied to the visitor's real clock.
 *   moon - at local night a moon (true current phase) hangs in the right margin
 *          over a glittering moon path whose brightness follows the illuminated
 *          fraction. It fades as you scroll (sink) below the surface.
 *   dvm  - diel vertical migration: a layer of zooplankton sits in the deep
 *          scattering layer (~400 m on the depth gauge) by day and rises to
 *          ~25 m at night, migrating at dusk and dawn. Scroll down to meet it.
 * Preview other times with ?hour=22 . Reads depth from window.__ocean (jet.js). */
(function () {
  var FEATURES = { moon: true, dvm: true };
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var c = document.createElement('canvas');
  if (!c.getContext) return;
  c.id = 'ambient'; c.setAttribute('aria-hidden', 'true');
  var jet = document.getElementById('jet');
  if (jet && jet.parentNode) jet.parentNode.insertBefore(c, jet.nextSibling); else document.body.appendChild(c);
  var g = c.getContext('2d');
  var W, H, dpr, colR, dots = [], sparks = [], raf, running = false;

  var qh = /[?&]hour=([\d.]+)/.exec(location.search);
  function localHour() { var d = new Date(); return qh ? +qh[1] : d.getHours() + d.getMinutes() / 60; }
  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  // 0 by day, 1 at night; dusk 18:30-20:00, dawn 5:00-6:30
  function nightness(h) { return Math.max(smooth(18.5, 20, h), 1 - smooth(5, 6.5, h)); }

  // moon: age in days since a known new moon (2000-01-06 18:14 UTC)
  var SYN = 29.530588853;
  function moonAge() { var a = ((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN; return a < 0 ? a + SYN : a; }

  function depthM(d) { return 4000 * Math.pow(d, 1.5); }          // same mapping as the depth readout
  function dOfM(m) { return Math.pow(m / 4000, 1 / 1.5); }
  var D_DAY = dOfM(400), D_NIGHT = dOfM(25);

  function size() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    colR = (W + Math.min(W, 720)) / 2;
    dots = [];
    var n = Math.round(Math.min(320, W * 0.22));
    for (var i = 0; i < n; i++) {
      var u = Math.random(), v = Math.random();
      dots.push({ x: Math.random() * W, off: Math.sqrt(-2 * Math.log(1 - u)) * Math.cos(2 * Math.PI * v) * 28,
                  ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8, lag: Math.random() * 0.6 });
    }
    sparks = [];
    for (var k = 0; k < 140; k++) sparks.push({ u: Math.random(), v: Math.random(), ph: Math.random() * 6.28, f: 0.5 + Math.random() * 2 });
  }

  function drawMoon(time, depth, nf, dark) {
    var mx = (colR + W) / 2, my = 74, r = 13;
    if (W - colR < 140) return;
    var age = moonAge(), illum = (1 - Math.cos(2 * Math.PI * age / SYN)) / 2, waxing = age < SYN / 2;
    var vis = nf * (1 - smooth(0, 0.12, depth));
    if (vis < 0.01) return;
    var col = dark ? '232,236,245' : '120,132,148';
    // moon path (glade): sparkles in a widening column below the moon
    var strength = vis * (0.25 + 0.75 * illum);
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i], yy = my + 40 + s.v * (H * 0.85 - my);
      var spread = 6 + (yy - my) * 0.16;
      var xx = mx + (s.u - 0.5) * 2 * spread * Math.abs(Math.sin(s.u * 9.1 + 1));
      var a = Math.max(0, Math.sin(time * 0.003 * s.f + s.ph)) * strength * (dark ? 0.7 : 0.45) * (1 - s.v * 0.6);
      if (a < 0.02) continue;
      g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      g.fillRect(xx - 3 - s.f, yy, 6 + 2 * s.f, 1);
    }
    // disk: faint full circle, then the lit part (northern-hemisphere view)
    g.save(); g.translate(mx, my); if (!waxing) g.scale(-1, 1);
    g.fillStyle = 'rgba(' + col + ',' + (0.12 * vis).toFixed(3) + ')';
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    var k = 1 - 2 * illum;                    // 1 new ... -1 full
    g.fillStyle = 'rgba(' + col + ',' + (0.85 * vis).toFixed(3) + ')';
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    g.fill();
    g.restore();
  }

  function drawDVM(time, depth, nf, dark) {
    var h = localHour();
    var layer = D_DAY + (D_NIGHT - D_DAY) * nf;          // migrating at dusk/dawn
    var migrating = nf > 0.02 && nf < 0.98, dir = (h > 12) ? -1 : 1;  // up at dusk, down at dawn
    var y0 = H * 0.55 + (layer - depth) * H / 0.11;
    if (y0 < -120 || y0 > H + 120) return;
    var col = dark ? '120,255,210' : '40,60,80';
    for (var i = 0; i < dots.length; i++) {
      var p = dots[i];
      var x = (p.x + Math.sin(time * 0.0004 * p.sp + p.ph) * 6 + W) % W;
      var y = y0 + p.off + Math.sin(time * 0.0011 * p.sp + p.ph) * 3 + (migrating ? dir * p.lag * 40 : 0);
      var tw = dark ? 0.35 + 0.65 * Math.max(0, Math.sin(time * 0.002 * p.sp + p.ph)) : 0.8;
      var a = (dark ? 0.75 : 0.5) * tw * Math.exp(-p.off * p.off / 3000);
      g.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      if (migrating) g.fillRect(x - 0.6, y - (dir > 0 ? 0 : 4), 1.2, 5);
      else g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
  }

  function frame(time) {
    var o = window.__ocean || { depth: 0 }, dark = root.classList.contains('dark');
    var nf = nightness(localHour());
    g.clearRect(0, 0, W, H);
    if (FEATURES.dvm) drawDVM(time, o.depth, nf, dark);
    if (FEATURES.moon) drawMoon(time, o.depth, nf, dark);
  }
  function loop(time) { if (!running) return; frame(time); raf = requestAnimationFrame(loop); }
  function update() {
    var should = !document.hidden && !reduce;
    if (should && !running) { running = true; raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  size();
  window.addEventListener('resize', function () { size(); if (reduce) frame(0); });
  if (reduce) { frame(0); window.addEventListener('scroll', function () { frame(0); }, { passive: true }); }
  document.addEventListener('visibilitychange', update);
  update();
})();
