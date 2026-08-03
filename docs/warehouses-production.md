# Module Entrepôts — livraison production

Le workspace Entrepôts consolide le stock physique porté par `cargo_packages`. Il ne duplique pas les colis : il ajoute la structure WMS nécessaire aux agences (sites, capacités, emplacements, transferts, inventaires, anomalies et audit).

## Fonctions livrées

- liste multi-entrepôts, recherche, KPI et export CSV complet ;
- fiche avec stock, emplacements, mouvements, transferts, inventaires, anomalies, analytics et paramètres ;
- déplacement atomique d’un colis avec verrou de ligne et historique ;
- transfert multi-colis avec transitions strictes `DRAFT → IN_TRANSIT → RECEIVED` ;
- inventaire physique avec attendu, réel et écart ;
- anomalies à sévérité et résolution tracée ;
- contrôle de concurrence par `row_version`, audit des mutations et RBAC par rôle ;
- UI progressive : opérations courantes visibles, fonctions secondaires sous « Plus ».

## Déploiement

1. Exécuter `infra/sql/044_warehouses_workspace.sql` dans Supabase SQL Editor.
2. Déployer l’API puis le dashboard.
3. Tester avec OWNER, MANAGER, WAREHOUSE, OPERATOR et un membre sans droit.
4. Créer deux entrepôts, un emplacement, déplacer un colis, effectuer un transfert puis un inventaire.

Aucun bucket Supabase supplémentaire ni variable Railway n’est nécessaire pour ce bloc.
