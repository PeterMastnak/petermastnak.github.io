/* Twilight-zone light meter (bottom-left).
 * How much light reaches the depth on the scroll gauge, right now, relative to
 * the noon sun overhead.
 *   surface light: real sun + moon positions over Monterey Bay (low-precision
 *     ephemerides, ~1 deg), clear sky; twilight interpolated from typical
 *     illuminance (0 deg ~400 lx, -6 ~3 lx, -12 ~0.008 lx, -18 ~ starlight);
 *     full moon at zenith ~0.25 lx; night-sky floor ~1 mlx; noon sun ~1e5 lx.
 *   underwater: Beer-Lambert, E(z) = E0 exp(-Kd z), Kd = 0.04 1/m
 *     (clear open-ocean blue light).
 * Reads the scroll depth from window.__ocean (jet.js); same depth mapping. */
(function () {
  var LAT = 36.6, LON = -121.9, KD = 0.04;
  var D2R = Math.PI / 180;

  function days(ms) { return (ms - Date.UTC(2000, 0, 1, 12)) / 864e5; }
  function altitude(ra, dec, d) {            // degrees in, altitude in degrees
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    var ha = (gmst + LON - ra) * D2R;
    return Math.asin(Math.sin(LAT * D2R) * Math.sin(dec * D2R) + Math.cos(LAT * D2R) * Math.cos(dec * D2R) * Math.cos(ha)) / D2R;
  }
  function eclToEq(lon, lat, d) {
    var e = (23.439 - 4e-7 * d) * D2R, l = lon * D2R, b = lat * D2R;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / D2R;
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / D2R;
    return [ra, dec];
  }
  function sunAlt(d) {
    var g = (357.528 + 0.9856003 * d) * D2R, L = 280.460 + 0.9856474 * d;
    var q = eclToEq(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g), 0, d);
    return altitude(q[0], q[1], d);
  }
  function moon(d) {
    var L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.229350 * d) * D2R;
    var q = eclToEq(L + 6.289 * Math.sin(M), 5.128 * Math.sin(F), d);
    var age = ((d + 2451545 - 2451550.1) % 29.530588853 + 29.530588853) % 29.530588853;
    return { alt: altitude(q[0], q[1], d), illum: (1 - Math.cos(2 * Math.PI * age / 29.530588853)) / 2 };
  }

  // relative surface light (1 = overhead noon sun)
  var TW = [[0, 4e-3], [-6, 3e-5], [-12, 8e-8], [-18, 1e-8]];
  function surface(ms) {
    var d = days(ms), h = sunAlt(d), E;
    if (h > 0) {
      var s = Math.sin(h * D2R);
      E = Math.max(TW[0][1], s * Math.exp(-0.2 / Math.max(s, 0.05)) / Math.exp(-0.2));
    } else if (h > -18) {
      for (var i = 0; i < 3; i++) if (h <= TW[i][0] && h >= TW[i + 1][0]) {
        var f = (h - TW[i][0]) / (TW[i + 1][0] - TW[i][0]);
        E = Math.pow(10, Math.log10(TW[i][1]) + f * (Math.log10(TW[i + 1][1]) - Math.log10(TW[i][1])));
      }
    } else E = 0;
    var m = moon(d);
    E += 2.5e-6 * Math.pow(m.illum, 1.5) * Math.max(0, Math.sin(m.alt * D2R)) + 1e-8;
    return { E: E, sun: h, moon: m };
  }

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sci(x) {
    if (x >= 0.1) return x.toFixed(x >= 0.995 ? 0 : 2);
    var e = Math.floor(Math.log10(x)), m = x / Math.pow(10, e);
    return (m >= 9.5 ? '' : Math.round(m) + '×') + '10' + String(m >= 9.5 ? e + 1 : e).split('').map(function (c) { return SUP[c]; }).join('');
  }
  function zone(z) {
    return z < 1 ? 'surface' : z < 200 ? 'sunlit zone' : z < 1000 ? 'twilight zone' : 'midnight zone';
  }
  function like(E) {
    return E > 3e-2 ? 'daylight' : E > 3e-4 ? 'as dim as dusk' : E > 3e-5 ? 'as dim as twilight' : E > 1e-6 ? 'as dim as moonlight' :
           E > 5e-9 ? 'as dim as starlight' : E > 1e-14 ? 'too dim for us; fish still see' : 'dark; only bioluminescence';
  }

  var el = document.createElement('div');
  el.id = 'light'; el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  var line1 = document.createElement('div'), line2 = document.createElement('div'), bar = document.createElement('div'), dot = document.createElement('i');
  line2.className = 'l2'; bar.className = 'bar'; bar.appendChild(dot);
  el.appendChild(line1); el.appendChild(line2); el.appendChild(bar);

  var surf = surface(Date.now()), last = '';
  setInterval(function () { surf = surface(Date.now()); }, 60000);
  function render() {
    var dpt = (window.__ocean && window.__ocean.depth) || 0;
    var z = Math.round(4000 * Math.pow(dpt, 1.5) / 10) * 10;
    var E = surf.E * Math.exp(-KD * z);
    var t1 = zone(z) + (z >= 1 ? ' · ' + z.toLocaleString('en-US') + ' m' : '');
    var t2 = (E < 1e-30 ? 'light < 10⁻³⁰' : 'light ' + sci(E)) + ' × noon sun · ' + like(E);
    var key = t1 + t2;
    if (key !== last) {
      line1.textContent = t1; line2.textContent = t2; last = key;
      dot.style.left = Math.max(0, Math.min(100, -Math.log10(Math.max(E, 1e-30)) / 30 * 100)) + '%';
      el.title = 'Monterey Bay: sun ' + surf.sun.toFixed(0) + '°, moon ' + surf.moon.alt.toFixed(0) + '° (' +
        Math.round(surf.moon.illum * 100) + '% lit); clear water, Kd = 0.04 m⁻¹';
    }
  }
  render();
  setInterval(render, 120);
})();
