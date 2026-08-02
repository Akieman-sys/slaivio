# Bloc 1 — Isolation des agences et sécurité des webhooks

Statut : implémenté et validé localement  
Date : 2 août 2026  
Périmètre : backend API, authentification des agences, webhooks WhatsApp et quarantaine plateforme

## 1. Résumé simple

Slaivio est une plateforme multi-agence. Chaque donnée doit donc appartenir à la bonne agence et ne jamais être placée dans une agence choisie par défaut.

Avant ce bloc, plusieurs parties du backend utilisaient `APP_ORG_ID=demo_agency` lorsqu'elles ne connaissaient pas l'agence. Cela convenait à une démonstration, mais c'était dangereux en production : un message ou une notification mal routé pouvait être enregistré chez le mauvais client.

Le principe appliqué est maintenant :

> Si Slaivio ne peut pas prouver à quelle agence appartient une opération, il n'écrit aucune donnée métier dans une agence.

Une requête utilisateur doit être liée à une adhésion Clerk vérifiée. Un webhook doit avoir une signature valide et être relié à un compte ou numéro fournisseur connu. Un webhook authentique mais non routable est conservé, chiffré, dans une quarantaine plateforme séparée.

## 2. Pourquoi ce bloc est indispensable

Ce bloc protège quatre éléments fondamentaux.

### Confidentialité

Une agence ne doit jamais voir les clients, messages, expéditions ou notifications d'une autre agence.

### Intégrité

Une donnée reçue sans agence vérifiée ne doit jamais modifier un dossier au hasard ou le compte de démonstration.

### Authenticité

Les endpoints publics de webhook doivent vérifier que les requêtes viennent réellement de Meta avant de leur faire confiance.

### Exploitabilité

Un événement fournisseur authentique mais non reconnu ne doit pas être perdu. Il doit pouvoir être inspecté par un opérateur plateforme autorisé, avec une trace d'audit.

Sans ces garanties, Slaivio ne peut pas raisonnablement accueillir de vraies agences ni contractualiser des engagements de sécurité et de disponibilité.

## 3. Règles d'architecture retenues

### 3.1 Aucun locataire par défaut

`APP_ORG_ID` a été supprimé de la configuration et du code actif. Les services internes demandent désormais explicitement un `org_id`.

Un `org_id` absent provoque un refus ou une erreur contrôlée. Il ne déclenche jamais un fallback vers `demo_agency`.

### 3.2 Requêtes des utilisateurs

Le token Clerk prouve l'identité de l'utilisateur. Le backend recherche ensuite son agence active et son adhésion dans la base Slaivio.

Une valeur `org_id` contenue dans le token ou envoyée par le navigateur ne suffit pas à elle seule. Sans adhésion active vérifiée en base, la réponse est `403`.

La création automatique d'une agence pendant une simple requête authentifiée a été supprimée. Le provisioning doit passer par un parcours d'onboarding explicite et contrôlé.

### 3.3 Webhooks fournisseurs

Le traitement suit cet ordre :

1. lire le corps brut de la requête ;
2. vérifier la signature du fournisseur ;
3. extraire le numéro ou compte destinataire ;
4. retrouver l'agence propriétaire en base ;
5. appliquer l'idempotence ;
6. seulement ensuite écrire les données métier.

Une signature invalide produit un refus `403`. Le payload rejeté n'est pas injecté dans les tables métier.

### 3.4 Quarantaine plateforme

Un événement signé mais impossible à router est enregistré dans `platform_inbound_event_envelopes`.

Cette table :

- n'a pas d'agence propriétaire par défaut ;
- chiffre le payload avec Fernet avant l'écriture ;
- conserve un hash SHA-256 pour le contrôle d'intégrité ;
- utilise une clé stable par fournisseur pour éviter les doublons ;
- conserve la raison de l'échec de routage ;
- indique si la signature a été validée ;
- expire par défaut après 30 jours ;
- permet une résolution manuelle auditée vers une agence existante.

Les permissions plateforme sont séparées des rôles d'agence :

- `quarantine.read` permet de consulter les métadonnées ;
- `quarantine.resolve` permet d'affecter un événement à une agence ;
- chaque résolution écrit une entrée dans `platform_quarantine_audit_log`.

La liste standard ne retourne jamais le payload déchiffré.

## 4. Comportement par canal

### Meta WhatsApp

- Vérification HMAC SHA-256 de `X-Hub-Signature-256` sur le corps brut.
- `META_APP_SECRET` est obligatoire lorsque Meta est le fournisseur actif en production.
- Routage par `phone_number_id` et configuration WhatsApp enregistrée.
- Messages et statuts non routables placés en quarantaine.
- Les endpoints de connexion Meta prennent l'agence depuis le contexte Clerk, pas depuis le body envoyé par le frontend.

### Politique Meta-only

Meta Cloud API est l'unique fournisseur WhatsApp supporté. Les routes, services, parseurs, configurations et dépendances Twilio/Infobip ont été retirés afin de réduire la surface d'attaque et la charge de maintenance. Ajouter un fournisseur nécessitera une décision d'architecture et une implémentation complète, pas un simple changement de variable.

### Anciennes interfaces

- Le webhook générique `/webhook/whatsapp` retourne `410` pour les requêtes POST.
- L'API manager protégée uniquement par une clé globale retourne `410` en environnement déployé.
- Les interfaces Clerk multi-tenant deviennent la voie normale pour les opérations d'agence.

## 5. Principaux fichiers

### Configuration et sécurité

- `apps/api/app/core/config.py` : contrat de configuration par environnement.
- `apps/api/app/core/tenant_context.py` : résolution stricte de l'agence active.
- `apps/api/app/core/platform_permissions.py` : autorisations des opérateurs plateforme.
- `apps/api/app/core/security.py` : désactivation de l'API manager historique en production.
- `apps/api/app/services/meta_webhook_security.py` : validation HMAC Meta.

### Routage des webhooks

- `apps/api/app/api/meta_webhook.py`
- `apps/api/app/db/organization_whatsapp_repository.py`

### Quarantaine

- `infra/sql/025_platform_inbound_event_quarantine.sql` : tables, contraintes et index.
- `infra/sql/026_platform_quarantine_replay.sql` : machine d'état, leases, backoff et index du rejeu.
- `apps/api/app/platform/quarantine_service.py` : canonicalisation, hash et chiffrement.
- `apps/api/app/platform/quarantine_repository.py` : persistance, permissions, résolution et audit.
- `apps/api/app/api/platform_quarantine.py` : endpoints réservés à la plateforme.

### Propagation stricte de l'agence

Les notifications, retries, transcriptions vocales, réponses automatiques, messages d'expédition et WebSockets exigent maintenant un `org_id` explicite.

## 6. Configuration requise en production

Variables minimales liées à ce bloc :

```env
APP_ENV=production
PUBLIC_BASE_URL=https://api.slaivio.com
PLATFORM_QUARANTINE_ENCRYPTION_KEY=<cle-fernet-secrete>
QUARANTINE_REPLAY_MAX_ATTEMPTS=5
QUARANTINE_REPLAY_LEASE_SECONDS=900
CLERK_ISSUER_URL=<issuer-clerk>
META_WA_VERIFY_TOKEN=<secret-aleatoire>
META_APP_SECRET=<secret-meta>
```

`APP_ORG_ID` doit être supprimé de Railway.

Génération de la clé Fernet :

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

La clé doit être conservée dans le gestionnaire de secrets. Sa perte rend les événements déjà mis en quarantaine indéchiffrables. Sa rotation future devra donc utiliser un mécanisme de version de clé et de rechiffrement.

## 7. Procédure de déploiement

1. Faire une sauvegarde vérifiée de la base de production.
2. Exécuter successivement les migrations `025` puis `026`.
3. Générer et enregistrer `PLATFORM_QUARANTINE_ENCRYPTION_KEY` dans Railway.
4. supprimer `APP_ORG_ID` de Railway ;
5. définir `APP_ENV=production` et `PUBLIC_BASE_URL` ;
6. configurer les secrets Meta et Clerk ;
7. effectuer la rotation de tous les secrets exposés dans les captures ;
8. déployer l'API ;
9. vérifier `/health/live` puis `/health/ready` ;
10. exécuter des webhooks signés de test pour une agence de validation ;
11. tester un numéro inconnu et vérifier sa présence dans la quarantaine ;
12. vérifier qu'un utilisateur sans adhésion active reçoit `403`.

Un déploiement qui échoue au démarrage à cause d'une variable obligatoire manquante est un comportement attendu : le système refuse de démarrer dans un état dangereux.

## 8. Tests exécutés

Résultats locaux au moment de clôturer ce bloc :

- Ruff : aucune erreur ;
- Pyright : aucune erreur ni avertissement ;
- Pytest : 20 tests réussis ;
- import complet de `app.main` : réussi ;
- `pip-audit` : aucune vulnérabilité connue ;
- recherche de `APP_ORG_ID` dans le code actif : aucun résultat.

Les tests ajoutés vérifient notamment :

- le refus d'un utilisateur qui présente une agence sans adhésion active ;
- une signature Meta valide, modifiée ou absente ;
- le chiffrement réel du payload de quarantaine ;
- la stabilité de la clé d'idempotence dérivée du payload.

## 9. Exploitation et alertes

Après le lancement, les métriques suivantes devront être surveillées :

- nombre d'événements mis en quarantaine par fournisseur et par raison ;
- taux de signatures invalides ;
- nombre de résolutions manuelles ;
- âge du plus ancien événement non résolu ;
- erreurs de déchiffrement ;
- collisions ou répétitions détectées par idempotence.

Alertes recommandées :

- événement en quarantaine depuis plus de 15 minutes ;
- hausse soudaine du taux de routage impossible ;
- échec de validation de signature au-dessus du niveau habituel ;
- échec d'écriture dans la quarantaine ;
- clé de chiffrement absente au démarrage.

## 10. Moteur de rejeu

Une résolution manuelle place désormais l'événement en `PENDING_REPLAY`. Le moteur obtient ensuite un lease exclusif en base avec `FOR UPDATE SKIP LOCKED`, déchiffre le payload, vérifie son hash, puis l'envoie au pipeline Meta.

Les états opérationnels sont : `QUARANTINED`, `PENDING_REPLAY`, `PROCESSING`, `PROCESSED`, `REPLAY_FAILED` et `DEAD_LETTER`.

Une erreur temporaire utilise un backoff exponentiel de 30 secondes à une heure. Après cinq tentatives, l'événement passe en dead-letter. Une erreur permanente, comme une corruption du payload ou un mauvais fournisseur, passe directement en dead-letter. Un opérateur autorisé peut ensuite le remettre en file avec une justification auditée.

Le moteur garantit qu'un seul worker possède le lease à un instant donné. Sa sémantique est « au moins une fois » : après un crash survenu entre une écriture métier et la confirmation finale, une nouvelle tentative reste possible. Les écritures possédant une clé fournisseur ou une clé de déduplication restent protégées, mais les futurs effets métier devront tous adopter des clés d'idempotence persistantes pour approcher une exécution exactement une fois.

Le worker peut être lancé par un cron Railway avec :

```powershell
python scripts/replay_quarantine.py
```

Les endpoints plateforme permettent aussi le rejeu d'un événement, le rejeu des événements dus, la remise en file et la consultation des métriques. Ils exigent la permission `quarantine.replay` ou `quarantine.read` selon l'action.

Un premier opérateur plateforme doit être autorisé explicitement avec son identifiant Clerk :

```sql
insert into platform_operator_permissions (user_id, permission_code, granted_by)
values
    ('<clerk_user_id>', 'quarantine.read', '<bootstrap_admin>'),
    ('<clerk_user_id>', 'quarantine.resolve', '<bootstrap_admin>'),
    ('<clerk_user_id>', 'quarantine.replay', '<bootstrap_admin>')
on conflict (user_id, permission_code) do update
set status = 'ACTIVE';
```

Cette opération bootstrap doit être exécutée par un administrateur de base autorisé et consignée dans le journal d'exploitation.

## 11. Limites connues

Tout fournisseur autre que Meta est hors du périmètre produit et refusé par le moteur.

Les anciennes migrations contiennent encore des données de démonstration historiques. Elles ne servent plus de fallback runtime, mais leur séparation des migrations de production devra être traitée dans le bloc de durcissement des migrations et données initiales.

Ces limites ne réintroduisent pas de mélange entre agences : elles privilégient le refus et la conservation sécurisée plutôt qu'un traitement non fiable.

## 12. Critères de clôture du bloc

Le développement local de la frontière de sécurité est terminé. La clôture opérationnelle exige encore que les conditions suivantes soient vraies en production :

- migrations 025 et 026 appliquées ;
- nouvelle clé Fernet configurée ;
- secrets exposés révoqués et remplacés ;
- `APP_ENV=production` ;
- `APP_ORG_ID` supprimé ;
- smoke tests réels Meta réussis ;
- test de quarantaine réussi ;
- vérification des logs sans secret ni payload sensible.

Le bloc suivant ne doit commencer qu'après validation de cette checklist sur Railway et Supabase.

## 13. Incident Railway du 2 août 2026

Le conteneur redémarrait parce que le contrat de configuration production refusait quatre valeurs absentes ou dangereuses. Ce fail-fast est volontaire : l'API ne doit pas démarrer sans ses protections.

Variables à corriger dans le service backend Railway :

```env
PLATFORM_QUARANTINE_ENCRYPTION_KEY=<cle-fernet-generee>
META_WA_VERIFY_TOKEN=<secret-aleatoire-d-au-moins-24-caracteres>
PUBLIC_BASE_URL=https://api.slaivio.com
```

`META_APP_SECRET` et une configuration Clerk valide restent également obligatoires. `MANAGER_API_KEY` n'est plus une condition de démarrage, car l'API manager historique est désactivée en production.

Après enregistrement des variables, Railway doit redéployer le dernier commit. Le contrôle attendu est un démarrage sans `ValidationError`, suivi de réponses `200` sur `/health/live` et `/health/ready`.
