# VIE — appli mobile

Version installable (PWA) de VIE, mon tableau de bord personnel : semaine, projets, études, candidatures, habitudes, finances, objectifs et idées.

**Ouvrir / installer :** https://jorxas.github.io/vie-mobile/

## Installer sur Android

1. Ouvrir le lien ci-dessus dans **Chrome**.
2. Toucher **Installer** dans la bannière (ou menu ⋮ → **Installer l'application** / **Ajouter à l'écran d'accueil**).
3. VIE apparaît avec son icône ; elle s'ouvre en plein écran et fonctionne **sans réseau**.

## Données

- Tout ce qui est saisi reste **dans le téléphone** (stockage local du navigateur). Rien n'est envoyé sur Internet, ce dépôt ne contient que le code.
- Les données du téléphone et celles du PC sont **séparées**. Pour transférer : Réglages → **Exporter JSON** d'un côté, **Importer JSON** de l'autre.
- Désinstaller l'appli ou effacer les données de Chrome efface aussi les données VIE : exporter une sauvegarde de temps en temps (l'appli le rappelle toutes les deux semaines).

## Mises à jour

Ce dépôt est généré automatiquement (`mobile/build-mobile.cjs` puis `mobile/deploy-mobile.cjs` dans le projet VIE). Quand une nouvelle version est publiée, l'appli propose **« Mettre à jour »** ; les données ne sont pas touchées.

L'assistant IA de VIE (qui exige le serveur local du PC) n'est pas inclus dans la version mobile.
