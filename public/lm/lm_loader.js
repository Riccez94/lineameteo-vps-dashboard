/* Linea Meteo - caricatore della pagina Vortice polare per il blocco CMS del forum.
   Nel blocco: <div id="lmvps" class="lm-keep-colors" data-base="https://lineameteo-vps-dashboard.pages.dev"></div>
   + questo script. Carica contenuto, stile e programma da data-base: ogni aggiornamento del progetto arriva da solo. */
(function () {
	var root = document.getElementById('lmvps');
	if (!root || root.getAttribute('data-lm-loaded')) { return; }
	root.setAttribute('data-lm-loaded', '1');
	var base = (root.getAttribute('data-base') || 'https://lineameteo-vps-dashboard.pages.dev').replace(/\/+$/, '');
	function fail() {
		root.innerHTML = '<div style="padding:22px;border-radius:12px;background:var(--surface,#fff);color:var(--muted,#5f6f84);text-align:center">' +
			'La pagina del vortice polare non &egrave; raggiungibile in questo momento. Riprova tra qualche minuto.</div>';
	}
	fetch(base + '/lm/contenuto.html', { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
		if (!r.ok) { throw new Error(r.status); }
		return r.text();
	}).then(function (html) {
		var v = (/data-v="([0-9a-f]+)"/.exec(html) || [])[1] || String(Date.now());
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = base + '/lm/lm_vps.css?v=' + v;
		css.onload = function () {
			root.innerHTML = html;
			var js = document.createElement('script');
			js.src = base + '/lm/lm_vps.js?v=' + v;
			js.onerror = fail;
			document.body.appendChild(js);
		};
		css.onerror = fail;
		document.head.appendChild(css);
	})['catch'](fail);
})();
