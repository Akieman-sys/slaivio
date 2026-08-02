# Bloc 2.2 — Module Clients de production

## Statut

Le module Clients est **code-complete** et prêt pour la recette de production. Sa clôture opérationnelle exige que la checklist de recette située plus bas soit exécutée après le déploiement du commit final.

## Résultat métier

Une agence peut gérer ses vrais prospects, clients, entreprises, agents et partenaires dans son organisation active. Elle peut rechercher, filtrer, créer, modifier, archiver, restaurer, importer, exporter et fusionner des fiches sans exposer les données d’une autre agence ni écraser silencieusement le travail d’un collègue.

## Pourquoi ce bloc est important

Le client est une identité centrale utilisée par les dossiers, colis, expéditions, messages, notifications, relances et opérations commerciales. Une mauvaise fusion, une fuite inter-agences ou un doublon non contrôlé contaminerait tous les modules suivants. Ce bloc établit donc les invariants d’identité et de sécurité dont dépend la suite de SLAIVIO.

## Fonctionnalités livrées

### Répertoire et fiche

- liste paginée côté serveur ;
- recherche par nom, entreprise, téléphone, WhatsApp et email ;
- filtres par statut, type, source, pays et ville ;
- tris stables ;
- fiche détaillée avec résumé, opérations, historique, doublons et notes ;
- compteurs calculés depuis les vraies données de l’agence active.

### Cycle de vie

- création et modification validées ;
- archivage logique sans suppression des relations ;
- restauration avec détection des conflits d’identité ;
- historique d’audit pour chaque changement ;
- contrôle `row_version` pour éviter les écrasements concurrents.

### Identité et doublons

- normalisation déterministe des téléphones et emails ;
- unicité par organisation ;
- détection de doublons ;
- fusion transactionnelle ;
- déplacement des relations vers la fiche conservée ;
- verrouillage des deux fiches ;
- clé d’idempotence protégée par verrou transactionnel PostgreSQL.

### Import CSV

- modèle CSV téléchargeable ;
- UTF-8 avec prise en charge du BOM ;
- maximum 5 Mo et 10 000 lignes ;
- validation ligne par ligne ;
- valeurs invalides refusées sans correction silencieuse ;
- doublons comptabilisés ;
- résumé des lignes traitées, créées, ignorées et rejetées ;
- rapport d’erreurs CSV téléchargeable ;
- aucune erreur interne brute exposée.

### Export CSV

- export des données de l’organisation active uniquement ;
- respect des filtres visibles ;
- maximum 50 000 lignes ;
- UTF-8 avec BOM pour Excel ;
- neutralisation des cellules pouvant déclencher une formule Excel ;
- événement d’audit contenant le volume et les filtres, sans coordonnées client.

## Sécurité

### Permissions

| Permission | Usage |
|---|---|
| `clients.read` | Liste, fiche, statistiques, historique et doublons |
| `clients.create` | Création |
| `clients.update` | Modification |
| `clients.archive` | Archivage et restauration |
| `clients.import` | Import CSV |
| `clients.export` | Export CSV |
| `clients.merge` | Fusion |

`OWNER` et `MANAGER` disposent de toutes les permissions Clients. Les autres rôles suivent le principe du moindre privilège défini dans `CLIENT_ROLE_PERMISSIONS`. Le backend reste l’autorité finale ; masquer un bouton ne constitue jamais la sécurité.

### Isolation des agences

Chaque requête utilise l’`org_id` issu de l’adhésion active vérifiée. Les identifiants fournis par le navigateur ne peuvent pas sélectionner l’agence. PostgreSQL impose en plus les références composites `(org_id, client_id)`, ce qui empêche un dossier, colis, message ou autre objet d’une agence de pointer vers le client d’une autre agence.

### Données sensibles et audit

Les actions unitaires et en masse sont journalisées avec l’agence et l’acteur. Les journaux d’import/export ne contiennent ni fichier CSV, ni nom, ni téléphone, ni email, ni notes client. La table d’audit n’accorde aucun accès direct au rôle `public`.

## Contrat API principal

| Méthode | Route | Permission |
|---|---|---|
| `GET` | `/clients` | `clients.read` |
| `POST` | `/clients` | `clients.create` |
| `GET` | `/clients/stats` | `clients.read` |
| `GET` | `/clients/duplicates` | `clients.read` |
| `GET` | `/clients/{id}` | `clients.read` |
| `PATCH` | `/clients/{id}` | `clients.update` |
| `DELETE` | `/clients/{id}?row_version=` | `clients.archive` |
| `POST` | `/clients/{id}/restore?row_version=` | `clients.archive` |
| `GET` | `/clients/{id}/timeline` | `clients.read` |
| `POST` | `/clients/merge` | `clients.merge` |
| `POST` | `/clients/import` | `clients.import` |
| `GET` | `/clients/export` | `clients.export` |

Les conflits de concurrence et d’identité répondent `409`. Les données absentes ou appartenant à une autre agence répondent `404`, sans révéler leur existence.

## Migrations nécessaires

Les migrations doivent être appliquées dans cet ordre :

1. `021_clients_module.sql` — modèle fonctionnel ;
2. `027_clients_rbac.sql` — permissions ;
3. `028_clients_identity_and_concurrency.sql` — identité et versions ;
4. `029_client_merge_operations.sql` — idempotence des fusions ;
5. `030_repair_clients_role_permissions.sql` — réparation des agences existantes ;
6. `031_clients_database_tenant_isolation.sql` — isolation relationnelle en base ;
7. `032_clients_audit_hardening.sql` — index et protection des audits.

Toutes sont conçues pour être réexécutables. Une erreur `tenant isolation violation` pendant `031` doit arrêter le déploiement : elle signale une incohérence existante à analyser, pas une migration à contourner.

## Déploiement

1. Sauvegarder la base Supabase et vérifier la restauration disponible.
2. Appliquer les migrations manquantes dans l’ordre.
3. Déployer le backend Railway.
4. Vérifier `/health/live` puis `/health/ready`.
5. Déployer le dashboard.
6. Exécuter la recette ci-dessous avec une agence de validation.
7. Surveiller les réponses `409`, `422`, `5xx`, le temps de réponse et les logs pendant au moins une heure.

Le frontend et le backend de ce bloc doivent être déployés ensemble lorsque le contrat `row_version` change. Les migrations ajoutent des protections compatibles avec le code déjà déployé et ne doivent pas être supprimées pour revenir en arrière.

## Recette de production obligatoire

Cocher chaque point sur l’organisation de validation, jamais sur une agence cliente active.

- [ ] Un `OWNER` voit création, import, export, archivage et fusion.
- [ ] Un rôle sans permission ne voit pas l’action et reçoit `403` si l’API est appelée directement.
- [ ] Créer un client avec nom, téléphone et email réels de test.
- [ ] Retrouver ce client par nom, téléphone et email.
- [ ] Modifier la fiche et vérifier l’incrément de `row_version`.
- [ ] Ouvrir la même fiche dans deux sessions ; la seconde modification obsolète doit répondre `409`.
- [ ] Archiver puis restaurer la fiche sans perdre dossiers, colis ou historique.
- [ ] Créer un doublon contrôlé, le détecter puis le fusionner.
- [ ] Vérifier que toutes les relations ont été déplacées vers la fiche conservée.
- [ ] Répéter la même requête de fusion avec la même clé : aucun second déplacement ne doit avoir lieu.
- [ ] Importer le modèle CSV avec une ligne valide, une ligne invalide et un doublon.
- [ ] Télécharger et vérifier le rapport d’erreurs.
- [ ] Exporter avec un filtre et vérifier que seules les lignes filtrées sont présentes.
- [ ] Ouvrir l’export dans Excel et vérifier les accents.
- [ ] Changer d’agence et confirmer qu’aucun client, compteur ou résultat précédent ne reste visible.
- [ ] Vérifier les événements `client.created`, `client.updated`, `client.archived`, `client.restored`, `client.merged`, `clients.imported` et `clients.exported` dans `audit_logs`.
- [ ] Vérifier `/health/ready` après la recette.

## Exploitation et diagnostic

### `403` sur une action OWNER

Vérifier l’organisation active et les lignes `role_permissions`. Réexécuter `030_repair_clients_role_permissions.sql` si nécessaire, puis reconnecter l’utilisateur pour recharger ses permissions.

### `409 stale_client_version`

La fiche a changé depuis son ouverture. Recharger la fiche et recommencer l’action avec la nouvelle version. Ne jamais désactiver le contrôle de version.

### `409 restore_identity_conflict`

Un client actif utilise déjà le téléphone ou l’email de la fiche archivée. Comparer les deux fiches puis utiliser la fusion si elles représentent la même identité.

### Fusion interrompue

La transaction PostgreSQL annule tous les déplacements. Recharger les deux fiches et réutiliser la même clé d’idempotence pour une reprise technique, ou lancer une nouvelle fusion depuis l’interface après vérification.

### Import partiel

Les lignes valides sont conservées. Télécharger le rapport, corriger uniquement les lignes rejetées et les réimporter. Les doublons seront à nouveau ignorés.

### Export supérieur à 50 000 lignes

Ajouter un filtre par statut, type, pays, ville ou source et effectuer plusieurs exports. Ne pas augmenter la limite sans concevoir un export asynchrone stocké hors processus.

## Tests automatisés

Backend :

```text
pytest
ruff check app scripts tests
pyright
```

Frontend :

```text
npm test
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

La CI GitHub exécute les tests backend et frontend sur les changements concernés. Les tests Clients couvrent les permissions des routes, les limites CSV, l’identité, les versions, l’idempotence, l’isolation, l’audit, la reprise réseau, le double export, l’archivage versionné et l’import du fichier sélectionné.

## Limites assumées

- Les vues Messages et Paiements affichent explicitement qu’elles dépendent de leurs futurs modules ; aucune donnée n’est inventée.
- Les exports synchrones sont limités à 50 000 lignes. Au-delà, un futur système asynchrone sera nécessaire.
- La recette humaine post-déploiement reste obligatoire malgré les tests automatisés.

## Critère de clôture

Le bloc 2.2 est clôturé lorsque :

1. toutes les migrations jusqu’à `032` sont appliquées ;
2. les deux CI sont vertes ;
3. la recette de production ci-dessus est entièrement cochée ;
4. aucun incident critique n’est observé pendant la fenêtre de surveillance.

Après clôture, le bloc suivant est **2.3 — Dossiers**, construit sur les identités Clients désormais sécurisées.
