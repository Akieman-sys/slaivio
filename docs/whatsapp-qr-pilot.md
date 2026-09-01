# Connexion WhatsApp QR — pilote limité

Ce connecteur permet à une petite cohorte d’entreprises pilotes de lier leur
numéro actuel comme un appareil WhatsApp secondaire. Il ne remplace pas
l’intégration officielle Meta. Le passage futur à Meta conserve les clients,
dossiers, conversations et connaissances, car seul le transport change.

## Limites communiquées aux entreprises

- ce mode repose sur le protocole appareil lié et une bibliothèque non
  officielle ; Meta peut l’interrompre ;
- aucun envoi massif, scraping ou contournement des règles WhatsApp ;
- le responsable doit accepter explicitement les conditions avant le QR ;
- le pilote commence en mode IA `Suggestion uniquement` ;
- la déconnexion révoque le numéro et supprime les clés de session stockées ;
- l’API Meta officielle reste la cible de production durable.

Références du moteur utilisé :
[Baileys](https://github.com/WhiskeySockets/Baileys) et sa
[gestion des sessions](https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx).

## Déploiement

1. Exécuter `infra/sql/105_whatsapp_qr_linked_device.sql` après la migration 104.
2. Déployer `apps/whatsapp-qr-gateway` comme service privé Node 20 à partir de
   son `Dockerfile`.
3. Générer deux secrets différents :

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
   ```

4. Variables du gateway :
   - `DATABASE_URL` et `DATABASE_SSLMODE=require` ;
   - `SLAIVIO_API_URL=https://api.slaivio.com` ;
   - `WHATSAPP_QR_GATEWAY_SHARED_SECRET` = premier secret ;
   - `WHATSAPP_QR_SESSION_ENCRYPTION_KEY` = seconde valeur base64 ;
   - `PORT=8080`.
5. Variables de l’API FastAPI :
   - `WHATSAPP_QR_GATEWAY_URL=https://<service-qr-render>` ;
   - `WHATSAPP_QR_GATEWAY_SHARED_SECRET` = exactement le premier secret.
   - `WHATSAPP_QR_PILOT_MAX_ORGANIZATIONS=10` pour verrouiller la cohorte.
6. Redéployer l’API et le dashboard. `WHATSAPP_PROVIDER` peut rester `meta` :
   le routage choisit le fournisseur enregistré pour chaque agence.

### Exploitation continue

- le gateway doit utiliser une instance Render toujours active, sans mise en
  veille automatique ; un service endormi ne peut pas recevoir de message ;
- configurer le contrôle de santé Render sur `/health` ; ce contrôle vérifie
  aussi l’accès à PostgreSQL ;
- les coupures temporaires déclenchent une reconnexion progressive, plafonnée
  à une minute entre deux tentatives ;
- les sessions persistées sont réconciliées toutes les cinq minutes, notamment
  après un redémarrage ou une indisponibilité temporaire de la base ;
- une déconnexion explicitement demandée depuis le téléphone ou depuis
  SLAIVIO révoque volontairement la session et exige un nouveau QR code.

Le gateway ne journalise ni QR, ni contenu des messages, ni clés. Les clés
Baileys sont chiffrées individuellement en AES-256-GCM dans PostgreSQL. Les
appels API ↔ gateway sont signés HMAC avec une durée de validité de cinq minutes.

## Validation avant la première agence

- connecter un numéro de test et vérifier `CONNECTED` dans Paramètres ;
- recevoir un message dans la Boîte de réception ;
- répondre manuellement et vérifier la réception sur le téléphone ;
- redémarrer le gateway et vérifier la reprise sans nouveau QR ;
- déconnecter depuis SLAIVIO et vérifier que l’appareil disparaît de WhatsApp ;
- confirmer que `whatsapp_qr_auth_state` ne contient plus cette session ;
- garder l’IA en suggestion uniquement pendant la période d’observation.
