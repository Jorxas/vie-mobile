/* Vitrine publique (démo pour recruteurs) : neutralise les derniers noms réels encore visibles dans l'interface d'origine
   (nom d'un projet personnel, magasin habituel). Ne fait que compléter le dictionnaire d'affichage de la démo (window.VIE_I18N),
   chargé juste après i18n-woerterbuch.js et avant demo-i18n.js : aucun fichier de la démo d'origine n'est modifié. */
(function () {
  'use strict';
  var W = window.VIE_I18N;
  if (!W || !W.de || !W.fr) return;
  var extra = {
    de: {
      'VIE ne lit pas encore les missions Hermes, GitHub ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.':
        'VIE liest noch keine Aufträge aus dem Werkzeugkasten, kein GitHub und keine Netzwerkstatistiken. Die Daten sind bearbeitbar und müssen geprüft werden.',
      'Hermes · missions & preuves': 'Werkzeugkasten · Aufträge & Nachweise',
      'PENNY': 'Discounter in der Nähe'
    },
    fr: {
      'VIE ne lit pas encore les missions Hermes, GitHub ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.':
        'VIE ne lit pas encore les missions de la boîte à outils, ni GitHub, ni les statistiques des réseaux. Les données sont éditables et doivent être vérifiées.',
      'Hermes · missions & preuves': 'Boîte à outils · missions & preuves',
      'PENNY': 'Supermarché du quartier'
    }
  };
  ['de', 'fr'].forEach(function (l) { Object.keys(extra[l]).forEach(function (k) { W[l][k] = extra[l][k]; }); });
})();
