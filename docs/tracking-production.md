# Tracking Control Center — mise en production

## Ce qui est livré

- Control Center multi-tenant : KPI, recherche, filtres complets, pagination, sélection multiple et vues sauvegardées.
- Vues Carte, Timeline, Alertes et Analytics.
- Export CSV exhaustif respectant les filtres actifs.
- Fiche dédiée à dix onglets : Overview, Tracking Timeline, Map, Shipments, Parcels, Events, Alerts, Documents, Notes et Settings.
- Événements idempotents, mise à jour concurrente protégée pour ETA/responsable, audit, RBAC et archivage non destructif.
- Alertes assignables avec historique et résolution commentée.
- Détection déterministe : ETA dépassée, document manquant, expédition sans colis, douane bloquée et signal ancien.
- Documents privés avec URL signée et limite de 25 Mo.
- Liens publics renouvelables, révocables et journalisés.

## Migration Supabase obligatoire

Exécuter le fichier `infra/sql/042_tracking_control_tower.sql` dans le SQL Editor Supabase avant le déploiement du backend.

Créer deux buckets Supabase Storage privés :

- `tracking-documents`
- les buckets déjà utilisés par Dossiers/Colis doivent rester privés.

Ne jamais rendre `tracking-documents` public. Les téléchargements passent par une URL signée créée par l’API.

## Railway Cron

Créer un service Cron depuis le même dépôt et les mêmes variables sécurisées que le backend.

- Start command : `python -m app.jobs.tracking_alerts`
- Schedule recommandé : `*/5 * * * *`
- Root directory : `apps/api` si le service Railway ne reprend pas déjà cette racine.

Le Cron doit recevoir au minimum la configuration base de données et `APP_ENV=production`. Le job définit lui-même `APP_RUNTIME=cron`.

## Recette manuelle obligatoire

Effectuer la recette dans une organisation de test, jamais directement avec les données principales :

1. OWNER : lecture, export, modification ETA, assignation, alertes, notifications, lien public et archivage.
2. MANAGER : mêmes opérations que OWNER.
3. OPERATOR : lecture, événements, alertes et notifications ; absence des actions export/lien public.
4. Utilisateur sans droit : navigation et API refusées en 403.
5. Deux organisations : vérifier qu’un identifiant de l’agence A renvoie 404/403 depuis l’agence B.
6. Ouvrir deux navigateurs, modifier la même ETA et vérifier que la seconde écriture obsolète reçoit HTTP 409.
7. Envoyer deux fois le même événement avec la même `idempotency_key` et vérifier une seule ligne en timeline.
8. Téléverser PDF/image autorisé, refuser un exécutable et vérifier l’ouverture par URL signée.
9. Lancer le Cron et vérifier les cinq règles d’alerte sur des données contrôlées.
10. Exporter plus de 100 suivis et comparer le nombre de lignes au total filtré.

## Fonctions volontairement exclues

- prédiction IA ;
- géolocalisation transporteur en direct ;
- escalades complexes ;
- optimisation statistique avancée.
