/* Animated favicon: a small rotating eddy. Falls back to favicon.jpg if unsupported. */
(function () {
  var link = document.querySelector('link[rel~="icon"]');
  var c = document.createElement('canvas');
  if (!link || !c.getContext) return;
  c.width = c.height = 64;
  var g = c.getContext('2d'), a = 0, root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw() {
    var dark = root.classList.contains('dark');
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = dark ? '#0b1620' : '#ffffff';
    g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
    g.lineCap = 'round';
    for (var arm = 0; arm < 3; arm++) {
      g.strokeStyle = dark ? '#5cc8e6' : '#0a6a8a';
      g.lineWidth = 5;
      g.beginPath();
      for (var th = 0; th <= 2.6 * Math.PI; th += 0.15) {
        var r = 3 + th * 3.2, ang = th + a + arm * 2 * Math.PI / 3;
        var x = 32 + r * Math.cos(ang), y = 32 + r * Math.sin(ang);
        if (th) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    link.type = 'image/png';
    link.href = c.toDataURL('image/png');
  }
  draw();
  if (!reduce) setInterval(function () { a -= 0.3; draw(); }, 150);
})();
