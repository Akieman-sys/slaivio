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

Le module ne requiert aucune nouvelle variable Railway.

## Preuves, reçus et relances

La migration `047_pickups_proofs_reminders.sql` ajoute :

- photos et signatures privées avec somme SHA-256 ;
- reçu numéroté imprimable ou enregistrable en PDF depuis le navigateur ;
- relances WhatsApp idempotentes, limitées à une par période de 24 heures ;
- paramètres agence pour délai de grâce, frais journaliers et règles de contrôle ;
- analytics des délais, agents et frais de garde.

Créer dans Supabase Storage un bucket privé nommé `pickup-proofs`, limité aux formats `image/jpeg`, `image/png` et `image/webp`.
