# Pilot V1 — mise en production WhatsApp Meta

Le responsable de l’entreprise connecte WhatsApp depuis **Paramètres → WhatsApp & IA**. SLAIVIO ne lui demande ni identifiant technique, ni jeton, ni mot de passe Meta.

## 1. Configuration à réaliser une seule fois dans Meta

Dans l’application Meta Business de SLAIVIO :

1. activer le produit **WhatsApp** ;
2. activer **Facebook Login for Business** ;
3. créer une configuration **WhatsApp Embedded Signup** ;
4. autoriser `business_management`, `whatsapp_business_management` et `whatsapp_business_messaging` ;
5. ajouter le domaine du dashboard SLAIVIO dans les domaines autorisés du SDK JavaScript ;
6. renseigner l’URL de confidentialité, les conditions d’utilisation et la suppression des données ;
7. passer l’application en mode Live après les validations Meta nécessaires.

Conserver le **Configuration ID** obtenu. Ce n’est pas le WABA ID d’une agence : le même Configuration ID SLAIVIO sert à lancer le parcours, puis chaque agence choisit son propre portefeuille.

## 2. Webhook Meta

Dans la configuration WhatsApp de l’application Meta :

- URL de callback : `https://<API-PUBLIQUE>/webhook/meta/whatsapp`
- jeton de vérification : la même valeur que `META_WA_VERIFY_TOKEN` sur Render ;
- champ minimal : `messages`.

Après la connexion d’une agence, le backend abonne automatiquement l’application au WABA choisi. Le contrôle de préparation ne considère WhatsApp comme prêt que si le numéro, le compte et l’abonnement webhook sont tous actifs.

## 3. Variables du service API Render

```text
APP_ENV=production
APP_RUNTIME=api
PUBLIC_BASE_URL=https://<API-PUBLIQUE>
META_APP_ID=<ID-APPLICATION-META>
META_APP_SECRET=<SECRET-APPLICATION-META>
META_EMBEDDED_SIGNUP_CONFIG_ID=<CONFIGURATION-ID>
META_CREDENTIALS_ENCRYPTION_KEY=<CLE-FERNET-DEDIEE-AUX-JETONS-META>
META_WA_VERIFY_TOKEN=<SECRET-ALEATOIRE-AU-MOINS-24-CARACTERES>
META_WA_API_VERSION=v22.0
```

Les déploiements existants qui utilisent `META_CONFIGURATION_ID` restent compatibles. Le nom officiel pour les nouvelles installations est `META_EMBEDDED_SIGNUP_CONFIG_ID` ; il ne faut pas définir les deux avec des valeurs différentes.

`META_WA_ACCESS_TOKEN` n’est pas nécessaire pour une agence connectée avec Embedded Signup. Il reste seulement un secours pour les anciennes connexions techniques.

Générez `META_CREDENTIALS_ENCRYPTION_KEY` avec :

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Cette clé ne doit jamais être placée dans le frontend. Elle chiffre les jetons Meta stockés par le backend.

## 4. Parcours réel dans SLAIVIO

1. Le responsable ouvre **Paramètres → WhatsApp & IA**.
2. Il clique sur **Connecter WhatsApp**.
3. La fenêtre officielle Meta lui permet de choisir son entreprise et son numéro.
4. Le navigateur transmet uniquement un code temporaire et les identifiants de la session au backend.
5. Le backend échange le code avec le secret Meta, synchronise le numéro et abonne le webhook.
6. Aucun jeton d’accès n’est renvoyé à l’interface.
7. Le responsable sélectionne le numéro principal si plusieurs numéros sont disponibles.
8. Le contrôle de préparation de l’Accueil confirme que WhatsApp est opérationnel.

## 5. Test obligatoire avant ouverture

- envoyer un message entrant depuis un téléphone externe ;
- vérifier son apparition dans la Boîte de réception ;
- répondre manuellement depuis SLAIVIO ;
- vérifier les statuts envoyé, livré et lu ;
- tester les trois modes IA ;
- envoyer une relance approuvée ;
- déconnecter temporairement le réseau et vérifier qu’aucun envoi n’est inventé ;
- reconnecter et vérifier l’absence de doublon ;
- contrôler qu’une autre organisation ne voit ni le numéro ni la conversation.

La mise en service automatique ne doit pas être activée tant que ce scénario n’est pas entièrement réussi avec le numéro réel de l’entreprise pilote.
