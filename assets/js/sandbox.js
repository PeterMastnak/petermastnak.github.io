/* Sandbox: filter entries by tag; the filter is kept in the URL (#tag=ml) so it can be shared. */
(function () {
  var buttons = document.querySelectorAll('.tags button'), entries = document.querySelectorAll('.entry');
  var empty = document.querySelector('.empty');
  function apply(tag) {
    var shown = 0;
    entries.forEach(function (e) {
      var ok = tag === 'all' || (' ' + e.getAttribute('data-tags') + ' ').indexOf(' ' + tag + ' ') >= 0;
      e.hidden = !ok; if (ok) shown++;
    });
    buttons.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tag') === tag); });
    if (empty) empty.hidden = shown > 0;
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var tag = b.getAttribute('data-tag');
      apply(tag);
      history.replaceState(null, '', tag === 'all' ? location.pathname : '#tag=' + tag);
    });
  });
  var m = /#tag=([\w-]+)/.exec(location.hash);
  if (m) apply(m[1]);
})();
