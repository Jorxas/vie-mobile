/* Amorçage de la session Vie (premier script de la page, exécuté avant app.js).
   Le lanceur ouvre http://127.0.0.1:PORT/#vie-boot=<ticket> : un fragment n'est JAMAIS envoyé au serveur (ni requête, ni Referer). Ce script :
   1) lit le ticket, 2) le RETIRE aussitôt de l'adresse (replaceState, avant tout autre script et tout appel réseau), 3) l'échange une seule fois contre une session
   (POST /api/auth/exchange, cookie HttpOnly posé par le serveur). Le ticket n'est écrit ni dans le stockage, ni dans le DOM, ni dans la console. Sans ticket : aucun échange,
   le site fonctionne mais l'assistant et le mode Agent restent verrouillés. */
(function () {
  'use strict';
  var m = /^#vie-boot=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  var out = { ready: Promise.resolve({ attempted: false, ok: false }) };
  if (m && location.protocol === 'http:') {
    var ticket = m[1];
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* adresse conservée : le ticket est de toute façon à usage unique */ }
    out.ready = fetch('/api/auth/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: ticket }), cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { attempted: true, ok: r.ok && !!j && j.ok === true, status: r.status }; }); })
      .catch(function () { return { attempted: true, ok: false, status: 0 }; });
    ticket = null;
  } else if (location.hash.indexOf('vie-boot') !== -1) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignoré */ }   // fragment mal formé : on le jette sans l'utiliser
  }
  window.VieBoot = Object.freeze(out);
})();
