/* Vitrine publique (démo pour recruteurs) : neutralise les derniers noms réels encore visibles dans l'interface d'origine
   (nom d'un projet personnel, magasin habituel). Ne fait que compléter le dictionnaire d'affichage de la démo (window.VIE_I18N),
   chargé après i18n-woerterbuch.js et i18n-en.js, avant demo-i18n.js : aucun fichier de la démo d'origine n'est modifié. */
(function () {
  'use strict';
  var W = window.VIE_I18N;
  if (!W || !W.de || !W.fr || !W.en) return;
  var extra = {
    de: {
      'VIE ne lit pas encore les missions Hermes, GitHub ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.':
        'VIE liest noch keine Aufträge aus dem Werkzeugkasten, kein GitHub und keine Netzwerkstatistiken. Die Daten sind bearbeitbar und müssen geprüft werden.',
      'Hermes · missions & preuves': 'Werkzeugkasten · Aufträge & Nachweise',
      'PENNY': 'Discounter in der Nähe'
    },
    en: {
      'VIE ne lit pas encore les missions Hermes, GitHub ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.':
        'VIE does not read toolbox tasks, GitHub or network statistics yet. The data is editable and must be checked.',
      'Hermes · missions & preuves': 'Toolbox · tasks & evidence',
      'PENNY': 'Discount store nearby'
    },
    fr: {
      'VIE ne lit pas encore les missions Hermes, GitHub ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.':
        'VIE ne lit pas encore les missions de la boîte à outils, ni GitHub, ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.',
      'Hermes · missions & preuves': 'Boîte à outils · missions & preuves',
      'PENNY': 'Supermarché du quartier'
    }
  };
  ['de', 'en', 'fr'].forEach(function (l) { Object.keys(extra[l]).forEach(function (k) { W[l][k] = extra[l][k]; }); });
})();
