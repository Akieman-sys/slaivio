# Pilot V1 - mise en service WhatsApp Wazzap

Cette integration est le fournisseur WhatsApp temporaire du Pilot V1. SLAIVIO reste le seul moteur IA autorise a repondre. L'IA du fournisseur Wazzap doit rester desactivee pour eviter les doubles reponses.

## 1. Contrat de production

Le parcours est le suivant :

```text
WhatsApp -> webhook Wazzap -> file durable SLAIVIO -> conversation Pilot
         -> IA SLAIVIO selon le mode du numero -> envoi Wazzap avec IA fournisseur desactivee
```

Garanties implementees :

- verification HMAC sur les octets bruts du webhook ;
- isolation de l'organisation par l'agent Wazzap configure ;
- idempotence par `messageId` ;
- stockage durable avant traitement metier ;
- reprise automatique des evenements interrompus ;
- aucune relance IA ni notification en double lors d'un rejeu ;
- `disableAiResponse: true` sur chaque envoi sortant ;
- aucun secret renvoye au frontend.

Wazzap ne fournit pas de webhook de livraison dans la documentation disponible. Le statut `accepted` signifie que Wazzap a accepte l'envoi, pas que le destinataire l'a lu.

## 2. Migration obligatoire

Appliquer `infra/sql/104_wazzap_whatsapp_provider.sql` dans le SQL Editor Supabase avant de deployer l'API. La migration est additive et idempotente. Elle conserve les connexions Meta existantes.

Ne pas activer Wazzap dans l'environnement de production avant que cette migration soit terminee.

## 3. Variables du service API

```text
APP_ENV=production
APP_RUNTIME=api
PUBLIC_BASE_URL=https://<API-PUBLIQUE>
WHATSAPP_PROVIDER=wazzap
META_CREDENTIALS_ENCRYPTION_KEY=<CLE-FERNET-DE-PRODUCTION>
WAZZAP_API_BASE_URL=https://api21.wazzap.ai/api/wazzap
WAZZAP_API_KEY=<SECRET-WAZZAP>
WAZZAP_AGENT_ID=<AGENT-WAZZAP>
WAZZAP_ORGANIZATION_ID=<ORGANISATION-WAZZAP>
WAZZAP_WEBHOOK_SECRET=<SECRET-HMAC-WAZZAP>
WAZZAP_PHONE_NUMBER=<NUMERO-INTERNATIONAL>
WAZZAP_VERIFIED_NAME=<NOM-AFFICHE>
```

La cle Fernet doit etre identique sur toutes les instances API et workers. Ne jamais placer `WAZZAP_API_KEY` ou `WAZZAP_WEBHOOK_SECRET` dans le dashboard.

## 4. Webhook Wazzap

Configurer dans Wazzap :

- URL : `https://<API-PUBLIQUE>/webhook/wazzap/whatsapp` ;
- secret : exactement la valeur de `WAZZAP_WEBHOOK_SECRET` ;
- evenements : `message.received` et `webhook.test`.

Le test Wazzap doit recevoir une reponse HTTP 2xx. Une signature incorrecte doit recevoir HTTP 403. L'API accuse reception apres la mise en file durable et poursuit le traitement en arriere-plan.

Executer chaque minute sur le service cron/worker :

```bash
cd apps/api
python -m app.jobs.wazzap_webhooks
```

Ce job reprend les evenements abandonnes apres une interruption de processus. Il ne remplace pas le webhook.

## 5. Activation de l'agence

1. Ouvrir **Parametres -> Canaux de communication**.
2. Verifier que le fournisseur affiche **Wazzap**.
3. Renseigner le numero international et le nom affiche.
4. Cliquer sur l'action d'activation.
5. Commencer avec le mode IA **Pause**.

L'agence configuree doit apparaitre comme active et le controle de preparation ne doit plus signaler de canal WhatsApp manquant.

## 6. Test sortant reel protege

Le script refuse tout envoi tant que `WAZZAP_SMOKE_CONFIRM=SEND` n'est pas present. Les secrets restent lus depuis l'environnement du backend.

```bash
cd apps/api
WAZZAP_SMOKE_RECIPIENT=+243XXXXXXXXX \
WAZZAP_SMOKE_CONFIRM=SEND \
python -m app.jobs.wazzap_smoke_test
```

Resultat attendu : une ligne JSON avec `success: true`, `provider: wazzap`, `status: accepted` et, si Wazzap le retourne, un `provider_message_id`. Le corps de reponse du fournisseur et les secrets ne sont jamais affiches.

## 7. Scenario reel obligatoire

Effectuer le test avec un telephone externe et une agence dediee :

1. Laisser le numero en mode **Pause**.
2. Envoyer `Bonjour, test Pilot` depuis le telephone externe.
3. Verifier une seule conversation et un seul message dans la Boite de reception.
4. Repondre manuellement depuis SLAIVIO et verifier la reception sur le telephone.
5. Renvoyer exactement le meme webhook signe et verifier qu'aucun second message n'apparait.
6. Passer en **Suggestion uniquement**, envoyer une question couverte par une connaissance publiee et verifier qu'aucune reponse ne part sans validation humaine.
7. Passer en **Automatique controle**, tester une question fiable et verifier une seule reponse SLAIVIO.
8. Poser une question absente ou sensible et verifier le passage dans **A reprendre**, sans invention.
9. Repasser immediatement en **Pause** et verifier qu'aucune reponse automatique ne part.
10. Confirmer qu'une autre agence ne voit ni le numero, ni la conversation, ni les messages.

Le Pilot ne doit pas etre remis a une agence tant qu'un seul de ces controles echoue.

## 8. Diagnostic

- HTTP 403 sur le webhook : secret HMAC different ou corps transforme avant verification.
- Webhook 2xx mais aucun message : verifier la route `agentId`, la migration 104 et le job de reprise.
- Deux reponses : mettre immediatement le numero en Pause et verifier que l'IA Wazzap est desactivee dans le compte fournisseur.
- Envoi refuse : verifier la cle API, l'agent, le format international du numero et la limite de 4096 caracteres.
- Message visible mais IA inactive : verifier le mode du numero, la connaissance publiee et les sujets autorises.

## 9. Retour arriere

1. Mettre tous les numeros en mode **Pause**.
2. Desactiver le webhook Wazzap.
3. Remettre `WHATSAPP_PROVIDER=meta` uniquement si une connexion Meta operationnelle existe.
4. Redeployer l'API.
5. Conserver les evenements, conversations et journaux pour l'audit. Ne supprimer aucune donnee de la migration 104.
