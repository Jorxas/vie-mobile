/* Öffentliche Demo der echten Vie-Oberfläche: erfundene Beispieldaten, nur im Arbeitsspeicher.
   Läuft zwischen core.js und app.js. Es gibt keinen Server: Speichern, Assistent und Agent sind nicht verbunden. */
(function () {
  'use strict';
  var C = window.VieCore;
  var s = C.seed();
  var mon = C.monday(new Date());
  var tag = function (n) { return C.iso(C.addDays(mon, n)); };
  s.settings.displayName = 'Alex';
  s.settings.workShifts = [];
  s.settings.budgetLiving = 650;
  s.settings.budgetProjects = 80;
  var fr = window.VieLang === 'fr';
  /* Erfundene Beispieldaten in beiden Sprachen. Interne Werte (status, priority, category) bleiben in beiden Fassungen gleich. */
  var T = fr ? {
    t1: 'Rapport de statistiques : relire la partie 2', t2: 'Lernlabor : tester le parcours d’inscription', n2: 'Trois cas : nouveau compte, mot de passe oublié, e-mail déjà utilisé.',
    t3: 'Exercices de Python sans assistance', t4: 'Préparer la candidature Werkstudent (exemple)', t5: 'Exposition : choisir les six affiches', t6: 'Courses et ménage',
    n1: 'Entretien en visio jeudi.', x1: 'Abonnement transport (exemple)', x2: 'Nom de domaine du projet'
  } : {
    t1: 'Statistikbericht: Teil 2 gegenlesen', t2: 'Lernlabor: Registrierungsablauf testen', n2: 'Drei Fälle: neues Konto, Passwort vergessen, E-Mail bereits verwendet.',
    t3: 'Python-Übungen ohne Hilfe', t4: 'Bewerbung als Werkstudent vorbereiten (Beispiel)', t5: 'Ausstellung: die sechs Plakate auswählen', t6: 'Einkaufen und Haushalt',
    n1: 'Videogespräch am Donnerstag.', x1: 'ÖPNV-Abo (Beispiel)', x2: 'Domainname für das Projekt'
  };
  s.tasks = [
    { id: 'd1', title: T.t1, projectId: '', category: 'study', priority: 'haute', duration: 90, date: tag(0), done: true, origin: 'manuel', notes: '' },
    { id: 'd2', title: T.t2, projectId: 'lernlabor', category: 'projects', priority: 'haute', duration: 60, date: tag(1), done: false, origin: 'manuel', notes: T.n2 },
    { id: 'd3', title: T.t3, projectId: '', category: 'study', priority: 'haute', duration: 45, date: tag(2), done: false, origin: 'manuel', notes: '' },
    { id: 'd4', title: T.t4, projectId: '', category: 'career', priority: 'haute', duration: 60, date: tag(3), done: false, origin: 'manuel', notes: '' },
    { id: 'd5', title: T.t5, projectId: 'marketing', category: 'projects', priority: 'normale', duration: 40, date: tag(4), done: false, origin: 'manuel', notes: '' },
    { id: 'd6', title: T.t6, projectId: '', category: 'life', priority: 'normale', duration: 50, date: tag(5), done: false, origin: 'manuel', notes: '' }
  ];
  s.applications = [
    { id: 'a1', company: 'Nordlicht Software GmbH', role: 'Werkstudent Webentwicklung', status: 'entretien', sentAt: tag(-6), followup: tag(2), url: '', notes: T.n1 },
    { id: 'a2', company: 'Morgenrot Digital', role: 'Praktikum Datenanalyse', status: 'envoyée', sentAt: tag(-2), followup: tag(5), url: '', notes: '' },
    { id: 'a3', company: 'Hafenwerk Systeme', role: 'Werkstudent IT-Support', status: 'brouillon', sentAt: '', followup: '', url: '', notes: '' }
  ];
  s.transactions = [
    { id: 't1', date: tag(0), label: T.x1, amount: 29.9, type: 'expense', category: 'vie' },
    { id: 't2', date: tag(1), label: T.x2, amount: 12, type: 'expense', category: 'projets' }
  ];
  s.habitChecks = {};
  s.habitChecks['gym:' + tag(0)] = true;
  s.habitChecks['code:' + tag(0)] = true;
  try { s = C.validateImported(s); } catch (e) { s = C.seed(); }

  /* Speicher nur im Arbeitsspeicher: Neuladen setzt die Demo zurück, nichts bleibt im Browser des Besuchers. */
  var daten = {};
  daten['vie-personal-v1'] = JSON.stringify(s);
  var speicher = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(daten, k) ? daten[k] : null; },
    setItem: function (k, v) { daten[k] = String(v); },
    removeItem: function (k) { delete daten[k]; },
    clear: function () { daten = {}; },
    key: function (i) { return Object.keys(daten)[i] || null; },
    get length() { return Object.keys(daten).length; }
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return speicher; } });

  /* Hinweis unten auf der Seite: erfundene Daten, dazu der Sprachwechsel DE | FR (Deutsch ist Standard, ?lang=fr zeigt die französische Originalsprache). */
  document.addEventListener('DOMContentLoaded', function () {
    var h = document.createElement('div');
    h.setAttribute('data-demo-hinweis', '');
    h.setAttribute('role', 'note');
    h.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:50;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px 14px;border-radius:18px;background:#1c2142;color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center';
    var text = document.createElement('span');
    text.setAttribute('data-demo-text', '');
    text.textContent = fr
      ? 'Démo avec des données fictives. Les modifications ne durent que jusqu’au rechargement ; l’assistant et l’agent ne sont pas connectés.'
      : 'Demo mit erfundenen Daten. Änderungen gelten nur bis zum Neuladen; Assistent und Agent sind nicht verbunden.';
    h.appendChild(text);
    var wahl = document.createElement('span');
    wahl.setAttribute('data-sprachwahl', '');
    wahl.setAttribute('role', 'group');
    wahl.setAttribute('aria-label', fr ? 'Langue' : 'Sprache');
    [['de', 'DE', 'Deutsch'], ['fr', 'FR', 'Français']].forEach(function (l, i) {
      if (i) wahl.appendChild(document.createTextNode(' | '));
      var a = document.createElement('a');
      a.href = '?lang=' + l[0];
      a.textContent = l[1];
      a.lang = l[0];
      a.title = l[2];
      var aktiv = (l[0] === 'fr') === fr;
      a.style.cssText = 'color:#fff;text-decoration:' + (aktiv ? 'none' : 'underline') + ';font-weight:' + (aktiv ? '700' : '400') + ';padding:4px 2px';
      if (aktiv) a.setAttribute('aria-current', 'true');
      wahl.appendChild(a);
    });
    h.appendChild(wahl);
    document.body.appendChild(h);
  });
})();
