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

## Complément Warehouse Operating System

La migration `045_warehouse_operating_system.sql` ajoute les parcours quotidiens manquants :

- réception avec file d’attente des colis non identifiés et clé d’idempotence ;
- association à la fiche Colis canonique et détection de tracking en double ;
- scan individuel ou en lot par caméra, douchette USB ou PDA ;
- pesage manuel ou depuis une balance identifiée, dimensions, CBM et poids volumétrique ;
- contrôle qualité avec blocage automatique et création d’anomalie ;
- groupage multi-colis et workflow de chargement jusqu’au départ ;
- packing list exportable ;
- détection idempotente des colis oubliés, poids manquants, paiements bloquants et dimensions incohérentes ;
- rôles Réceptionnaire, Peseur, Contrôleur qualité et Superviseur entrepôt.

Les photos privées, l’OCR d’étiquette, les QR/codes-barres et les notifications WhatsApp restent fournis par la fiche Colis afin de conserver une seule source de vérité.
