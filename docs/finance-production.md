# Facturation opérationnelle

Ce module facture les clients cargo de chaque agence. Il est volontairement séparé de `billing_invoices`, réservé aux abonnements SaaS SLAIVIO.

## Garanties du premier bloc

- devis, factures et avoirs avec lignes, quantité, remise et taxe ;
- calcul monétaire côté serveur et devise ISO sur chaque document ;
- numérotation atomique annuelle, propre à l’organisation et au type de document ;
- émission avec verrouillage optimiste ;
- paiements partiels idempotents, reçus numérotés et interdiction des trop-perçus ;
- annulation contrôlée seulement avant encaissement ;
- recherche, filtres, KPI et export CSV ;
- permissions séparées et journal d’audit immuable ;
- isolation multi-tenant dans chaque lecture et mutation.

## Déploiement

Exécuter `infra/sql/048_operational_invoicing.sql` dans Supabase avant de déployer l’API et le dashboard.

## Suite du module

La fondation rend le registre financier exploitable. Le prochain passage Facturation ajoutera les PDF brandés, conversion devis vers facture, notes de crédit appliquées au solde, rapprochement, taxes configurables, échéancier, emails et tests réels des rôles.
