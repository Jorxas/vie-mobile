/* VIE mobile — couche « appli » ajoutée par-dessus le site existant (aucune modification de core.js / app.js).
   1) service worker (hors ligne + mise à jour sur demande)  2) stockage persistant demandé au navigateur
   3) barre d'onglets en bas sur téléphone  4) aide à l'installation  5) rappel de sauvegarde  6) raccourcis #week, #finance…
   Les données de VIE restent sous la clé « vie-personal-v1 » ; ce fichier n'utilise que sa propre clé « vie-mobile-ui ». */
(function () {
  'use strict';
  var UI_KEY = 'vie-mobile-ui';
  var VIEWS = ['today', 'week', 'projects', 'study', 'career', 'life', 'finance', 'goals', 'ideas', 'settings'];
  var $ = function (s) { return document.querySelector(s); };

  function readUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function writeUi(patch) {
    try { var u = readUi(); for (var k in patch) u[k] = patch[k]; localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) { /* stockage indisponible : on ignore */ }
  }
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /* ---------- petite bannière réutilisable ---------- */
  function banner(id, html, actions) {
    if (document.getElementById(id)) return;
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
  }

  /* ---------- 1) service worker ---------- */
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    var reloading = false, userAsked = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!userAsked || reloading) return;
      reloading = true; location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        function offer(worker) {
          banner('vie-update', '<strong>Nouvelle version de VIE disponible.</strong> Tes données restent sur le téléphone.', [
            { label: 'Plus tard' },
            { label: 'Mettre à jour', primary: true, run: function () { userAsked = true; worker.postMessage('VIE_SKIP_WAITING'); } }
          ]);
        }
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var w = reg.installing; if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
      }).catch(function () { /* pas de hors-ligne, le site marche quand même */ });
    });
  }

  /* ---------- 2) stockage persistant (évite que le navigateur efface les données en cas de manque de place) ---------- */
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (ok) { if (!ok) return navigator.storage.persist(); }).catch(function () {});
  }

  /* ---------- 3) barre d'onglets en bas ---------- */
  var TABS = [['today', 'Aujourd’hui'], ['week', 'Semaine'], ['life', 'Habitudes'], ['finance', 'Finances']];
  function navBtn(view) { return document.querySelector('#nav [data-view="' + view + '"]'); }
  function buildTabbar() {
    if (!$('#nav') || $('#vie-tabbar')) return;
    var bar = document.createElement('nav');
    bar.id = 'vie-tabbar'; bar.className = 'vie-tabbar'; bar.setAttribute('aria-label', 'Navigation rapide');
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
    more.innerHTML = '<span class="ico" aria-hidden="true">☰</span><span class="lbl">Tout</span>';
    more.setAttribute('aria-label', 'Toutes les rubriques');
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

  /* ---------- 4) aide à l'installation ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredPrompt = e;
    if (standalone || readUi().installDismissed) return;
    banner('vie-install', '<strong>Installer VIE sur ce téléphone</strong> : icône sur l’écran d’accueil, ouverture plein écran, marche sans réseau.', [
      { label: 'Non merci', run: function () { writeUi({ installDismissed: true }); } },
      { label: 'Installer', primary: true, run: function () { deferredPrompt.prompt(); deferredPrompt = null; } }
    ]);
  });
  function iosHint() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || standalone || readUi().iosDismissed) return;
    banner('vie-install', '<strong>Installer VIE :</strong> touche <b>Partager</b> <span aria-hidden="true">⬆︎</span> puis <b>« Sur l’écran d’accueil »</b>. Ouvre ensuite VIE depuis l’icône (l’appli installée a ses propres données).', [
      { label: 'Compris', primary: true, run: function () { writeUi({ iosDismissed: true }); } }
    ]);
  }

  /* ---------- 5) rappel de sauvegarde (les données n'existent que sur ce téléphone) ---------- */
  function backupReminder() {
    var u = readUi(), now = Date.now(), DAY = 864e5;
    if (!u.firstSeen) { writeUi({ firstSeen: now }); return; }
    var last = u.lastExport || u.firstSeen;
    if (now - last < 14 * DAY) return;
    if (u.lastReminder && now - u.lastReminder < 3 * DAY) return;
    writeUi({ lastReminder: now });
    banner('vie-backup', '<strong>Pense à sauvegarder.</strong> Tes données ne sont que sur ce téléphone : exporte une copie (fichier JSON) de temps en temps.', [
      { label: 'Plus tard' },
      { label: 'Exporter maintenant', primary: true, run: function () { var b = document.querySelector('[data-action="export"]'); if (b) b.click(); } }
    ]);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-action="export"]')) writeUi({ lastExport: Date.now() });
  }, true);

  function start() {
    buildTabbar();
    openFromHash();
    iosHint();
    backupReminder();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
