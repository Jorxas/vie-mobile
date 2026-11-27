/* VIE — couche « appli » (aucune modification de core.js / app.js) :
   1) appli installable + service worker, UNIQUEMENT sur une adresse https (Tailscale ou GitHub Pages) : rien en file:// ni sur http://127.0.0.1
   2) stockage persistant demandé  3) barre d'onglets en bas sur téléphone  4) aide à l'installation
   5) rappel de sauvegarde (seulement si la synchronisation avec le PC n'est pas active)  6) raccourcis #week, #finance…
   Les données de VIE restent sous la clé « vie-personal-v1 » ; ce fichier n'utilise que sa propre clé « vie-mobile-ui ». */
(function () {
  'use strict';
  var UI_KEY = 'vie-mobile-ui';
  var VIEWS = ['today', 'week', 'projects', 'study', 'career', 'life', 'finance', 'goals', 'ideas', 'settings'];
  var $ = function (s) { return document.querySelector(s); };
  // Appli installable : sur https (Tailscale, GitHub Pages), ou sur http://127.0.0.1 pour la seule vitrine construite (balise <meta name="vie-pwa" content="toujours">, tests locaux).
  // Jamais pour l'appli servie localement par vie-server sur http://127.0.0.1 (développement, mode structure, tests existants) ni en file://.
  var https = location.protocol === 'https:' || (location.hostname === '127.0.0.1' && !!document.querySelector('meta[name="vie-pwa"][content="toujours"]'));
  // Textes de cette couche : français (appli) ; allemand ou anglais quand la démo publique est affichée dans cette langue (window.VieLang, posé par demo-i18n.js).
  var T = window.VieLang === 'en' ? {
    today: 'Today', week: 'Week', life: 'Routines', finance: 'Finance', all: 'All', allAria: 'All sections', bar: 'Quick navigation',
    install: '<strong>Install VIE on this device</strong>: icon on your home screen, full screen, works offline too.', no: 'No thanks', yes: 'Install',
    ios: '<strong>Install VIE:</strong> tap <b>Share</b>, then <b>“Add to Home Screen”</b>, then open VIE from the icon.', ok: 'Got it',
    backup: '<strong>Remember to back up.</strong> Here your data is only on this device: export a copy (JSON file) from time to time.', later: 'Later', exportNow: 'Export now'
  } : window.VieLang === 'de' ? {
    today: 'Heute', week: 'Woche', life: 'Routinen', finance: 'Finanzen', all: 'Alle', allAria: 'Alle Bereiche', bar: 'Schnellnavigation',
    install: '<strong>VIE auf diesem Gerät installieren</strong>: Symbol auf dem Startbildschirm, Vollbild, funktioniert auch ohne Netz.', no: 'Nein danke', yes: 'Installieren',
    ios: '<strong>VIE installieren:</strong> <b>Teilen</b> und dann <b>„Zum Home-Bildschirm“</b> antippen, danach VIE über das Symbol öffnen.', ok: 'Verstanden',
    backup: '<strong>Denk an eine Sicherung.</strong> Hier liegen deine Daten nur auf diesem Gerät: exportiere ab und zu eine Kopie (JSON-Datei).', later: 'Später', exportNow: 'Jetzt exportieren'
  } : {
    today: 'Aujourd’hui', week: 'Semaine', life: 'Habitudes', finance: 'Finances', all: 'Tout', allAria: 'Toutes les rubriques', bar: 'Navigation rapide',
    install: '<strong>Installer VIE sur cet appareil</strong> : icône sur l’écran d’accueil, ouverture plein écran, marche même sans réseau.', no: 'Non merci', yes: 'Installer',
    ios: '<strong>Installer VIE :</strong> touche <b>Partager</b> puis <b>« Sur l’écran d’accueil »</b>, puis ouvre VIE depuis l’icône.', ok: 'Compris',
    backup: '<strong>Pense à sauvegarder.</strong> Ici, tes données ne sont que sur cet appareil : exporte une copie (fichier JSON) de temps en temps.', later: 'Plus tard', exportNow: 'Exporter maintenant'
  };

  function readUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function writeUi(patch) {
    try { var u = readUi(); for (var k in patch) u[k] = patch[k]; localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) { /* stockage indisponible : on ignore */ }
  }
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* ---------- bannière réutilisable (aussi par vie-sync.js) ---------- */
  function banner(id, html, actions) {
    var old = document.getElementById(id); if (old) old.remove();
    var el = document.createElement('div');
    el.id = id; el.className = 'vie-pwa-banner'; el.setAttribute('role', 'status');
    var p = document.createElement('div'); p.className = 'vie-pwa-text'; p.innerHTML = html; el.appendChild(p);
    var box = document.createElement('div'); box.className = 'vie-pwa-actions';
    actions.forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = a.label;
      b.className = a.primary ? 'vie-pwa-btn primary' : 'vie-pwa-btn';
      b.addEventListener('click', function () { if (a.run) a.run(); el.remove(); });
      box.appendChild(b);
    });
    el.appendChild(box);
    document.body.appendChild(el);
    return el;
  }
  window.VieUI = Object.freeze({ banner: banner });

  /* ---------- 1) appli installable (https seulement) ---------- */
  if (https) {
    [['manifest', 'manifest.webmanifest'], ['icon', 'icons/favicon-48.png'], ['apple-touch-icon', 'icons/apple-touch-icon.png']].forEach(function (l) {
      var link = document.createElement('link'); link.rel = l[0]; link.href = l[1];
      if (l[0] === 'icon') { link.type = 'image/png'; link.sizes = '48x48'; }
      document.head.appendChild(link);
    });
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
        }).catch(function () { /* pas de hors-ligne, l'appli marche quand même */ });
      });
    }
    /* stockage persistant : le navigateur n'efface pas les données en cas de manque de place */
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (ok) { if (!ok) return navigator.storage.persist(); }).catch(function () {});
    }
  }

  /* ---------- 3) barre d'onglets en bas (visible seulement sur petit écran, voir mobile.css) ---------- */
  var TABS = [['today', T.today], ['week', T.week], ['life', T.life], ['finance', T.finance]];
  function navBtn(view) { return document.querySelector('#nav [data-view="' + view + '"]'); }
  function buildTabbar() {
    if (!$('#nav') || $('#vie-tabbar')) return;
    var bar = document.createElement('nav');
    bar.id = 'vie-tabbar'; bar.className = 'vie-tabbar'; bar.setAttribute('aria-label', T.bar);
    TABS.forEach(function (t) {
      var src = navBtn(t[0]);
      var icon = src && src.querySelector('.nav-icon') ? src.querySelector('.nav-icon').textContent : '•';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vie-tab'; b.dataset.tab = t[0];
      b.innerHTML = '<span class="ico" aria-hidden="true"></span><span class="lbl"></span>';
      b.firstChild.textContent = icon; b.lastChild.textContent = t[1];
      b.addEventListener('click', function () { var n = navBtn(t[0]); if (n) n.click(); });
      bar.appendChild(b);
    });
    var more = document.createElement('button');
    more.type = 'button'; more.className = 'vie-tab'; more.dataset.tab = 'more';
    more.innerHTML = '<span class="ico" aria-hidden="true">☰</span><span class="lbl"></span>';
    more.lastChild.textContent = T.all;
    more.setAttribute('aria-label', T.allAria);
    more.addEventListener('click', function () { var m = $('#menu-btn'); if (m) m.click(); });
    bar.appendChild(more);
    document.body.appendChild(bar);
    syncTabs();
    new MutationObserver(syncTabs).observe($('#nav'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  function syncTabs() {
    var active = document.querySelector('#nav .nav-btn.active');
    var v = active ? active.dataset.view : 'today';
    var inBar = TABS.some(function (t) { return t[0] === v; });
    Array.prototype.forEach.call(document.querySelectorAll('.vie-tab'), function (b) {
      var on = b.dataset.tab === v || (!inBar && b.dataset.tab === 'more');
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- 6) raccourcis d'icône : ./#week, ./#finance … ---------- */
  function openFromHash() {
    var v = (location.hash || '').replace(/^#/, '');
    if (VIEWS.indexOf(v) === -1) return;
    var n = navBtn(v); if (n) n.click();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignoré */ }
  }

  /* ---------- 4) aide à l'installation (https seulement) ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredPrompt = e;
    if (standalone || readUi().installDismissed) return;
    banner('vie-install', T.install, [
      { label: T.no, run: function () { writeUi({ installDismissed: true }); } },
      { label: T.yes, primary: true, run: function () { deferredPrompt.prompt(); deferredPrompt = null; } }
    ]);
  });
  function iosHint() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!https || !ios || standalone || readUi().iosDismissed) return;
    banner('vie-install', T.ios, [
      { label: T.ok, primary: true, run: function () { writeUi({ iosDismissed: true }); } }
    ]);
  }

  /* ---------- 5) rappel de sauvegarde (inutile quand la synchro avec le PC est active : le PC garde aussi l'historique) ---------- */
  function backupReminder() {
    if (document.documentElement.dataset.vieSync === 'on') return;
    var u = readUi(), now = Date.now(), DAY = 864e5;
    if (!u.firstSeen) { writeUi({ firstSeen: now }); return; }
    var last = u.lastExport || u.firstSeen;
    if (now - last < 14 * DAY) return;
    if (u.lastReminder && now - u.lastReminder < 3 * DAY) return;
    writeUi({ lastReminder: now });
    banner('vie-backup', T.backup, [
      { label: T.later },
      { label: T.exportNow, primary: true, run: function () { var b = document.querySelector('[data-action="export"]'); if (b) b.click(); } }
    ]);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-action="export"]')) writeUi({ lastExport: Date.now() });
  }, true);

  function start() {
    buildTabbar();
    openFromHash();
    iosHint();
    setTimeout(backupReminder, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
