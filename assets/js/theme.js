/* theme: system preference, remembered override; press "d" to toggle night mode */
(function () {
	var r = document.documentElement, s = null;
	try { s = localStorage.getItem('theme'); } catch (e) {}
	if (s === 'dark' || (!s && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)) r.classList.add('dark');
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'd' || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
		var d = r.classList.toggle('dark');
		r.style.backgroundColor = '';
		try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch (e2) {}
	});
})();
