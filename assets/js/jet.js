/* Drifters in a meandering jet: full-page background.
 *
 * Particles are advected (RK2) by an analytic stream function: an eastward
 * Gulf-Stream-like tanh jet with a propagating meander, plus Gaussian eddies.
 * u = -dpsi/dy, v = dpsi/dx (y up). Northern Hemisphere sense:
 * warm-core rings (north of the jet) spin clockwise, cold-core rings (south)
 * counter-clockwise.
 *
 * Extras (switch off in FEATURES):
 *   depth      - scrolling sinks you through the water column: jet slides away
 *                overhead, internal waves take over, colours deepen, depth readout
 *   stir       - the mouse leaves a wake in the flow
 *   hemisphere - press "g" to flip hemispheres (every eddy reverses its spin)
 *   seasons    - the jet sits further north and sheds more warm rings in late
 *                summer, further south in late winter (preview with ?doy=60)
 *
 * Clicking empty page space drops an eddy. Dark mode = bioluminescence.
 * No dependencies. */
(function () {
  var FEATURES = { depth: true, stir: true, hemisphere: true, seasons: true };

  var canvas = document.getElementById('jet');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var warmup = window.JET_WARMUP || 0;       // used by tools/og.html to render a still

  var THEMES = {
    light: { cold: [10, 106, 138], warm: [192, 57, 43], deep: [28, 50, 112],
             bg0: [255, 255, 255], bg1: [228, 236, 242], under: 0.28, comp: 'source-over', gain: 1 },
    dark:  { cold: [70, 205, 235], warm: [255, 130, 100], deep: [110, 120, 255],
             bg0: [11, 22, 32], bg1: [2, 5, 10], under: 0.3, comp: 'lighter', gain: 0.8 }
  };
  function theme() { return root.classList.contains('dark') ? THEMES.dark : THEMES.light; }

  var W = 0, H = 0, dpr = 1, N = 0, P = [], eddies = [], t = 0, K = 0;
  var colL = 0, colR = 0, S = 1;              // text column edges, length scale
  var running = false, raf = 0, lastSpawn = 0;
  var depth = 0, depthTarget = 0, hemi = 1, stirs = [];
  var MAX_EDDIES = 14;
  // phones / narrow screens: the jet stays put and at full strength while scrolling
  var narrow = false;
  function jd() { return narrow ? 0 : depth; }   // depth as felt by the jet and eddies

  // seasonal cycle: +1 around late August (warmest, northernmost), -1 in late February
  var season = 0;
  if (FEATURES.seasons) {
    var now = new Date(), qd = /[?&]doy=(\d+)/.exec(location.search);
    var doy = qd ? +qd[1] : (now - new Date(now.getFullYear(), 0, 0)) / 864e5;
    season = Math.cos(2 * Math.PI * (doy - 235) / 365.25);
  }
  // shared with ambient.js / track.js
  var shared = window.__ocean = { depth: 0, hemi: 1, season: season };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function mix(a, b, s) { return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]; }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  // ---- flow field -------------------------------------------------------
  function jetCenter(x) {
    return H * (0.62 + 0.05 * season + 0.6 * jd()) + S * 0.55 * Math.sin(K * x - 0.005 * t) + S * 0.16 * Math.sin(2.3 * K * x + 0.0035 * t);
  }
  function jetSlope(x) {
    return S * 0.55 * K * Math.cos(K * x - 0.005 * t) + S * 0.16 * 2.3 * K * Math.cos(2.3 * K * x + 0.0035 * t);
  }

  // analytic velocity; y is "up"
  function vel(x, y) {
    var L = S * 0.2, U = 1.5 * (1 - 0.7 * jd());
    var eta = (y - jetCenter(x)) / L, u = 0, v = 0;
    if (eta > -12 && eta < 12) {
      var ch = Math.cosh(eta), s2 = U / (ch * ch);  // psi = -U L tanh(eta)
      u = s2; v = s2 * jetSlope(x);
    }
    var ef = 1 - 0.6 * jd();
    for (var i = 0; i < eddies.length; i++) {
      var e = eddies[i], dx = x - e.x, dy = y - e.y, R2 = e.R * e.R, r2 = dx * dx + dy * dy;
      if (r2 > 9 * R2) continue;
      var ps = e.G * e.a * ef * Math.exp(-r2 / R2);  // psi = G exp(-r^2/R^2)
      u += 2 * dy / R2 * ps;
      v -= 2 * dx / R2 * ps;
    }
    if (jd() > 0.02) {                        // mode-2 internal wave, grows with depth
      var kx = 2 * Math.PI / (S * 5), m = 2 * Math.PI / H, A = jd() * 0.45 / kx;
      var th = kx * x - 0.008 * t;
      u -= A * m * Math.sin(th) * Math.cos(m * y);
      v += A * kx * Math.cos(th) * Math.sin(m * y);
    }
    for (var j = 0; j < stirs.length; j++) {
      var s = stirs[j], sx = x - s.x, sy = y - s.y, w = s.a * Math.exp(-(sx * sx + sy * sy) / 2000);
      u += s.vx * w; v += s.vy * w;
    }
    return [u, v];
  }

  function spawn(p) { p.x = rand(0, W); p.y = rand(0, H); p.life = rand(80, 320); }

  function addEddy(x, y, fadeIn) {
    var warm = y > jetCenter(x);              // above (north of) the jet
    var R = S * rand(0.3, 0.5);
    eddies.push({ x: x, y: y, R: R, G: hemi * (warm ? 1 : -1) * rand(4.5, 6) * R / 8,
                  a: fadeIn ? 0 : 1, age: 0, life: rand(1400, 2400), warm: warm });
    if (eddies.length > MAX_EDDIES) eddies.shift();
  }

  function randomEddy(fadeIn) {
    var x = rand(0, W), yc = jetCenter(x);
    var y = Math.random() < 0.5 + 0.15 * season ? rand(yc + S * 0.6, H + S) : rand(S * 0.2, yc - S * 0.6);
    if (y > S * 0.1 && y < H) addEddy(x, y, fadeIn);
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    narrow = W < 900;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.max(110, Math.min(W, H) * 0.16);
    K = 2 * Math.PI / Math.max(W * 0.6, 500);
    var col = Math.min(W, 720);
    colL = (W - col) / 2; colR = colL + col;
    if (warmup) colL = colR = -1e4;           // still render: no text-column fade
    N = Math.min(6000, Math.round(W * H / 200));
    P = [];
    for (var i = 0; i < N; i++) { var p = {}; spawn(p); p.life = rand(0, 320); P.push(p); }
    eddies = [];
    var n0 = Math.round(W * H / 160000) + 2;
    for (var j = 0; j < n0; j++) randomEddy(false);
  }

  // fainter under the text column, full strength in the margins
  function colFade(x, under) {
    var edge = 60;
    if (x < colL - edge || x > colR + edge) return 1;
    if (x > colL + edge && x < colR - edge) return under;
    var d = x < (colL + colR) / 2 ? (colL + edge - x) : (x - (colR - edge));
    return under + (1 - under) * Math.max(0, Math.min(1, d / (2 * edge)));
  }

  function nearestEddy(x, y) {
    for (var i = 0; i < eddies.length; i++) {
      var e = eddies[i], dx = x - e.x, dy = y - e.y;
      if (e.a > 0.3 && dx * dx + dy * dy < e.R * e.R * 1.4) return e;
    }
    return null;
  }

  // ---- depth: background tint + readout ----------------------------------
  var readout = null, lastBg = '', lastRead = '';
  if (FEATURES.depth && !warmup) {
    readout = document.createElement('div');
    readout.id = 'depth'; readout.setAttribute('aria-hidden', 'true');
    document.body.appendChild(readout);
  }
  function applyDepth() {
    var th = theme(), bg = rgb(mix(th.bg0, th.bg1, depth));
    if (bg !== lastBg) { root.style.backgroundColor = bg; lastBg = bg; }
    if (readout) {
      var m = Math.round(4000 * Math.pow(depth, 1.5) / 10) * 10;
      var txt = m < 5 ? 'surface' : m.toLocaleString('en-US') + ' m';
      if (txt !== lastRead) { readout.textContent = txt; lastRead = txt; }
    }
  }
  function onScroll() {
    if (!FEATURES.depth) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    depthTarget = Math.max(0, Math.min(1, window.scrollY / max));
    if (reduce || !running) { depth = depthTarget; shared.depth = depth; applyDepth(); }
  }

  // ---- main step ----------------------------------------------------------
  function step(draw) {
    t += 1;
    depth += (depthTarget - depth) * 0.05;
    shared.depth = depth;
    for (var i = eddies.length - 1; i >= 0; i--) {
      var e = eddies[i]; e.age++;
      e.a = Math.min(1, e.a + 0.008) * (e.age > e.life - 250 ? Math.max(0, (e.life - e.age) / 250) : 1);
      e.x -= 0.12;                            // westward (Rossby) drift
      if (e.age >= e.life || e.x < -e.R * 2) eddies.splice(i, 1);
    }
    for (var s = stirs.length - 1; s >= 0; s--) { stirs[s].a *= 0.93; if (stirs[s].a < 0.03) stirs.splice(s, 1); }
    if (t - lastSpawn > 220) { lastSpawn = t; randomEddy(true); }

    var th = theme(), cCold, cWarm;
    if (draw) {
      applyDepth();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = warmup ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.075)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = th.comp;
      ctx.lineWidth = 0.8;
      cCold = mix(th.cold, th.deep, jd()).map(Math.round).join(',');
      cWarm = mix(th.warm, th.deep, jd() * 0.5).map(Math.round).join(',');
    }
    for (var j = 0; j < N; j++) {
      var p = P[j], yU = H - p.y;
      var k1 = vel(p.x, yU);
      var k2 = vel(p.x + 0.5 * k1[0], yU + 0.5 * k1[1]);
      var nx = p.x + k2[0], ny = p.y - k2[1];
      p.life--;
      if (p.life <= 0 || ny < -2 || ny > H + 2) { spawn(p); continue; }
      if (nx > W) { nx -= W; p.x -= W; } else if (nx < 0) { nx += W; p.x += W; }
      if (draw) {
        var sp = Math.sqrt(k2[0] * k2[0] + k2[1] * k2[1]);
        var a = Math.min(0.85, 0.14 + sp * 0.45) * colFade(nx, narrow ? 0.42 : th.under) * th.gain;
        var near = nearestEddy(nx, H - ny);
        ctx.strokeStyle = 'rgba(' + (near && near.warm ? cWarm : cCold) + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      }
      p.x = nx; p.y = ny;
    }
  }

  function loop() {
    if (!running) return;
    step(true);
    raf = requestAnimationFrame(loop);
  }
  function update() {
    var should = !document.hidden && !reduce;
    if (should && !running) { running = true; raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  function staticFrame() {                    // reduced motion: one still frame of trails
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < 60; i++) step(false);
    for (var k = 0; k < 40; k++) step(true);
  }

  // ---- interaction ---------------------------------------------------------
  document.addEventListener('click', function (ev) {
    if (ev.__kelvin || (ev.target.closest && ev.target.closest('a, img, button, input, textarea, [data-noeddy]'))) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;
    addEddy(ev.clientX, H - ev.clientY, false);
    if (reduce) staticFrame();
  });

  if (FEATURES.stir) {
    var last = null;
    window.addEventListener('pointermove', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      var x = ev.clientX, y = H - ev.clientY;
      if (last) {
        var dx = x - last.x, dy = y - last.y;
        if (dx * dx + dy * dy > 9) {
          var c = function (v) { return Math.max(-2.5, Math.min(2.5, v * 0.3)); };
          stirs.push({ x: x, y: y, vx: c(dx), vy: c(dy), a: 1 });
          if (stirs.length > 24) stirs.shift();
          last = { x: x, y: y };
        }
      } else last = { x: x, y: y };
    }, { passive: true });
  }

  var toast = null, toastT = 0;
  function say(msg) {
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'toast';
      toast.setAttribute('role', 'status'); document.body.appendChild(toast);
    }
    toast.textContent = msg; toast.style.opacity = '1';
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.style.opacity = '0'; }, 2200);
  }
  if (FEATURES.hemisphere) {
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'g' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || ev.target.isContentEditable) return;
      hemi = -hemi; shared.hemi = hemi;
      for (var i = 0; i < eddies.length; i++) eddies[i].G = -eddies[i].G;
      say(hemi > 0 ? 'northern hemisphere · f > 0' : 'southern hemisphere · f < 0');
      if (reduce) staticFrame();
    });
  }

  // ---- start ---------------------------------------------------------------
  resize();
  if (warmup) { for (var w = 0; w < warmup; w++) step(true); return; }
  onScroll(); depth = depthTarget; applyDepth();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (reduce) staticFrame();

  var rt, lastW = W;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      // mobile URL-bar show/hide changes only height; don't reset for that
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - H) < 120) return;
      lastW = window.innerWidth; resize(); onScroll(); if (reduce) staticFrame();
    }, 150);
  });
  document.addEventListener('visibilitychange', update);

  update();
})();
