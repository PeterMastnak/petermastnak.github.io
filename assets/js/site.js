/* Small page behaviours: collapsible news. */
(function () {
  // ---- news: show the latest few, toggle the rest
  var SHOW = 3, table = document.querySelector('#news');
  if (table) {
    var rows = table.querySelectorAll('tr');
    if (rows.length > SHOW) {
      for (var i = SHOW; i < rows.length; i++) rows[i].classList.add('older');
      table.classList.add('collapsed');
      var btn = document.createElement('button');
      btn.className = 'more'; btn.type = 'button';
      var n = rows.length - SHOW;
      btn.textContent = 'show ' + n + ' older';
      btn.addEventListener('click', function () {
        var open = table.classList.toggle('collapsed') === false;
        btn.textContent = open ? 'show less' : 'show ' + n + ' older';
      });
      table.parentNode.insertBefore(btn, table.nextSibling);
    }
  }
})();
