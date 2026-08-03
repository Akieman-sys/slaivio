# Expéditions — déploiement du durcissement production

## Supabase

1. Exécuter `infra/sql/043_shipments_production_hardening.sql` dans SQL Editor.
2. Créer le bucket Storage privé `shipment-documents`.
3. Limiter les fichiers à 25 Mo.
4. MIME autorisés : `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `text/plain`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
5. Ne créer aucune policy publique : l’API utilise la service role et retourne uniquement des URL signées.

## Recette

- OWNER/MANAGER : création, modification, documents, colis, checkpoints, anomalies, finance et archivage.
- OPERATOR/WAREHOUSE : opérations autorisées sans accès administratif supplémentaire.
- SUPPORT/FINANCE : lecture seule selon le rôle provisionné.
- Sans permission : chaque route privée doit répondre 403.
- Multi-tenant : un identifiant d’une autre organisation doit répondre 404/403.
- Concurrence : deux modifications avec la même version doivent produire une réussite puis un conflit 409.
- Cycle de vie : vérifier qu’un passage direct de PREPARING à DELIVERED est rejeté.
- Export : comparer le CSV avec une liste filtrée supérieure à 100 lignes.
- Documents : vérifier téléversement, URL signée, refus MIME et limite 25 Mo.
