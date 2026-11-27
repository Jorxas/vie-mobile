/* Vitrine publique (démo pour recruteurs) : deux réglages d'affichage, sans toucher aux fichiers de la démo d'origine.
   1) Le bandeau « démo avec des données fictives » ne reste plus à l'écran : bouton × et disparition automatique après quelques secondes.
      Le choix de langue n'y figure plus.
   2) Choix de la langue dans Réglages / Einstellungen / Settings : Deutsch, English, Français. La démo s'ouvre TOUJOURS en allemand ;
      le choix recharge la page avec ?lang=en ou ?lang=fr (rien n'est enregistré chez le visiteur) et rouvre les réglages.
   Chargé en « defer » après demo-start.js : son écouteur DOMContentLoaded passe après celui qui crée le bandeau. */
(function () {
  'use strict';
  var lang = window.VieLang === 'en' || window.VieLang === 'fr' ? window.VieLang : 'de';
  var HIDE_AFTER_MS = 9000;
  var T = {
    de: { close: 'Hinweis schließen', title: 'Sprache', help: 'Die Demo öffnet sich immer auf Deutsch. Hier kannst du die Sprache wechseln.' },
    en: { close: 'Close notice', title: 'Language', help: 'The demo always opens in German. You can switch the language here.' },
    fr: { close: 'Fermer l’avis', title: 'Langue', help: 'La démo s’ouvre toujours en allemand. Tu peux changer de langue ici.' }
  }[lang];
  var LANGS = [['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français']];

  /* ---------- 1) bandeau « démo » : fermable, disparaît tout seul ---------- */
  function tameNotice() {
    var h = document.querySelector('[data-demo-hinweis]');
    if (!h || h.dataset.vitrine) return;
    h.dataset.vitrine = 'ok';
    var choice = h.querySelector('[data-sprachwahl]');
    if (choice) choice.remove();
    // × à droite du texte (sur une seule rangée) : le bandeau reste bas et ne chevauche pas la bannière d'installation.
    h.style.flexWrap = 'nowrap'; h.style.textAlign = 'left'; h.style.paddingRight = '8px';
    var txt = h.querySelector('[data-demo-text]');
    if (txt) txt.style.flex = '1 1 auto';
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('data-demo-schliessen', '');
    x.setAttribute('aria-label', T.close);
    x.title = T.close;
    x.textContent = '×';
    x.style.cssText = 'border:0;background:rgba(255,255,255,.16);color:#fff;font:700 16px/1 system-ui,sans-serif;width:28px;height:28px;border-radius:50%;cursor:pointer;flex:none;padding:0';
    h.appendChild(x);
    var gone = false;
    function hide(fast) {
      if (gone) return; gone = true;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (fast || reduce) { h.remove(); return; }
      h.style.transition = 'opacity .5s ease';
      h.style.opacity = '0';
      setTimeout(function () { h.remove(); }, 550);
    }
    x.addEventListener('click', function () { hide(true); });
    setTimeout(function () { hide(false); }, HIDE_AFTER_MS);
  }

  /* ---------- 2) langue dans les réglages ---------- */
  function languagePanel() {
    var active = document.querySelector('#nav .nav-btn.active');
    if (!active || active.dataset.view !== 'settings' || document.getElementById('vitrine-sprache')) return;
    var col = document.querySelector('#view .stack');
    if (!col) return;
    var sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'vitrine-sprache';
    var head = document.createElement('div'); head.className = 'panel-title';
    var h2 = document.createElement('h2'); h2.textContent = T.title; head.appendChild(h2); sec.appendChild(head);
    var p = document.createElement('p'); p.className = 'section-help'; p.textContent = T.help; sec.appendChild(p);
    var row = document.createElement('div'); row.className = 'inline-actions'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', T.title);
    LANGS.forEach(function (l) {
      var a = document.createElement('a');
      var on = l[0] === lang;
      a.className = 'btn ' + (on ? 'primary' : 'secondary');
      a.href = '?lang=' + l[0] + '#settings';
      a.hreflang = l[0]; a.lang = l[0];
      a.setAttribute('data-sprache', l[0]);
      a.textContent = l[1];
      a.style.textDecoration = 'none';
      if (on) a.setAttribute('aria-current', 'true');
      row.appendChild(a);
    });
    sec.appendChild(row);
    col.insertBefore(sec, col.firstChild);
  }

  function start() {
    tameNotice();
    var view = document.getElementById('view');
    if (view) new MutationObserver(languagePanel).observe(view, { childList: true });
    languagePanel();
  }
  // Script « defer » : il s'exécute AVANT DOMContentLoaded, donc avant la création du bandeau par demo-start.js → attendre cet événement.
  if (document.readyState === 'complete') start(); else { document.addEventListener('DOMContentLoaded', start); window.addEventListener('load', tameNotice); }
})();
