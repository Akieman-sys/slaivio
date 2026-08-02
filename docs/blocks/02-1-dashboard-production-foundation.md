# Bloc 2.1 — Fondation du dashboard de production

## Résultat

Le dashboard `/app` utilise désormais un shell unique, persistant et responsive. Son design combine une barre utilitaire sombre et compacte avec un espace de travail clair, dense et structuré. La navigation ne présente que des pages réellement disponibles.

## Pourquoi ce bloc est important

Une agence doit pouvoir changer de page, d’organisation et de session sans rencontrer de menu incohérent, de lien 404 ou de fausse information de disponibilité. Cette fondation évite aussi que chaque futur module reconstruise sa propre navigation, sa propre gestion des erreurs ou son propre système de permissions.

## Éléments implémentés

### Shell partagé

- layout persistant pour toutes les routes `/app` ;
- barre supérieure compacte avec compte Clerk, support et recherche ;
- sidebar responsive, réductible sur ordinateur et adaptée au mobile ;
- organisation active affichée et sélectionnable ;
- styles et tokens visuels communs ;
- suppression des anciens shells et sidebars concurrents.

Fichiers principaux :

- `apps/web/dashboard/app/app/layout.tsx` ;
- `apps/web/dashboard/components/layout/app-shell.tsx` ;
- `apps/web/dashboard/app/globals.css`.

### Navigation fiable

`config/app-navigation.ts` est la source de vérité des routes publiées. Seules les pages réellement implémentées apparaissent : accueil, clients, dossiers, colis et expéditions.

Les routes Dossiers et Expéditions sont liées aux permissions backend existantes `dossiers.read` et `shipments.read`. Aucun faux code RBAC n’a été inventé pour Clients ou Colis. Le backend reste toujours l’autorité finale pour autoriser les données et les actions.

### Recherche globale

`Ctrl+K` ou `Cmd+K` ouvre une palette qui recherche les modules autorisés par nom et mots-clés. `Entrée` ouvre le premier résultat et `Échap` ferme la palette.

### États partagés

Les composants communs couvrent :

- chargement ;
- liste vide ;
- erreur avec nouvelle tentative ;
- accès interdit.

Next.js utilise également des écrans partagés pour le chargement et les erreurs imprévues du segment `/app`.

### Permissions et routes

Le chargement des permissions distingue maintenant trois situations : chargement, service disponible, service indisponible. Quand le service RBAC répond, une page interdite affiche un refus clair. Quand il est temporairement indisponible, l’interface ne produit pas un faux refus et laisse les API appliquer la sécurité réelle.

### Expiration de session

Toutes les réponses API `401` déclenchent un événement global. Le dashboard affiche alors une boîte de dialogue bloquante et propose une reconnexion en conservant l’URL de retour. Les données déjà affichées ne sont pas effacées et aucune action supplémentaire n’est silencieusement envoyée.

### En-têtes opérationnels

Clients, Dossiers, Colis et Expéditions utilisent le même composant d’en-tête : fil d’Ariane, titre, description, actions et onglets. Les traitements existants d’import, d’export et de création sont conservés.

## Décisions de fiabilité

- Aucun lien n’est affiché avant que sa page soit fonctionnelle.
- Aucun indicateur statique « API prête » n’est affiché : il pourrait mentir pendant un incident.
- Le bouton Notifications est explicitement désactivé jusqu’à l’implémentation du vrai centre de notifications.
- Les contrôles UI améliorent l’expérience mais ne remplacent jamais l’autorisation backend.
- Une panne du service de permissions ne doit pas être confondue avec un refus métier.

## Validation effectuée

Depuis `apps/web/dashboard` :

```text
npm run lint       OK
npm run typecheck  OK
npm run build      OK
git diff --check   OK
```

Le build Next.js 15 génère correctement les 24 pages et les routes dynamiques du dashboard.

## Vérification manuelle recommandée avant déploiement

1. Se connecter avec un membre autorisé et ouvrir les cinq routes publiées.
2. Se connecter avec un rôle sans `shipments.read` et confirmer le refus sur `/app/shipments`.
3. Changer d’organisation et vérifier le rechargement des données et permissions.
4. Tester `Ctrl+K`, `Entrée` et `Échap` sur ordinateur.
5. Tester ouverture, navigation et fermeture du menu sur mobile.
6. Forcer un jeton expiré et vérifier la reconnexion avec retour à la page initiale.

## Hors périmètre volontaire

Le centre de notifications, les modules Communication, Finance, Réseau cargo et Gestion ne sont pas simulés. Ils seront ajoutés à la navigation uniquement lorsque leurs pages, API, permissions et tests seront opérationnels.

## Étape suivante

Le prochain travail se fait onglet par onglet. L’onglet **Clients** doit être audité et finalisé en premier : contrat API, RBAC dédié, recherche et pagination serveur, création/modification, import/export, gestion des doublons, états vides/erreurs et tests avec données d’agence réelles.
