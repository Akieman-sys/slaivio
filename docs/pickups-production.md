# Retraits en agence

Le module Retraits sécurise la remise physique d’un ou plusieurs colis appartenant au même client.

## Parcours

`READY_FOR_PICKUP → retrait préparé → notification/OTP → présence au guichet → identité + paiement + OTP → vérifié → remise → DELIVERED/RELEASED`

- l’OTP n’est jamais stocké en clair ;
- les références de pièce sont masquées ;
- un colis ne peut appartenir qu’à un retrait actif ;
- la remise est atomique, auditée et protégée par `row_version` ;
- les dérogations nécessitent `pickups.override` ;
- les frais de garde sont calculés selon le délai de grâce et le tarif quotidien de l’agence ;
- WhatsApp reçoit un événement `PICKUP_READY` dans la file de notifications existante.

## Déploiement

1. Exécuter `infra/sql/046_agency_pickups.sql` dans Supabase.
2. Déployer l’API et le dashboard.
3. Tester OWNER, MANAGER, COUNTER_AGENT, CASHIER et un utilisateur sans droit.

Le module ne requiert aucune nouvelle variable Railway. Une preuve textuelle signée est stockée dès la remise ; les pièces jointes privées de preuve seront activées avec le bucket `pickup-proofs` dans le bloc média suivant.
