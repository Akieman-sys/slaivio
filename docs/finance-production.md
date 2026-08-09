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

## Finalisation métier

La migration `049_operational_invoicing_completion.sql` ajoute les paramètres fiscaux et de présentation par agence, l'acceptation/refus puis la conversion transactionnelle des devis, l'application des avoirs, l'annulation auditée d'un paiement, le rafraîchissement des retards et les documents HTML imprimables en PDF par le navigateur. Les communications externes restent volontairement indépendantes jusqu'à la validation Meta.
