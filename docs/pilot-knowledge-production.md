# Base de connaissances Pilot — mise en production

Le parcours Pilot accepte trois sources : saisie directe, image et document. Les fichiers ne deviennent jamais une instruction IA brute. Ils suivent le circuit suivant :

1. contrôle du format et de la taille (20 Mo maximum) ;
2. analyse antivirus ;
3. stockage dans le bucket privé `knowledge-files` ;
4. OCR pour les images et PDF, ou extraction locale pour DOCX, XLSX, CSV et TXT ;
5. affichage du texte extrait au responsable ;
6. correction et confirmation humaine ;
7. enregistrement en brouillon ou publication ;
8. utilisation par l’IA uniquement si la connaissance est publiée, communicable, à jour et non sensible.

## Configuration API requise

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY` pour les images et PDF
- `KNOWLEDGE_OCR_MODEL=mistral-ocr-latest`
- `CLAMAV_HOST` pointant vers un service ClamAV privé
- `CLAMAV_PORT=3310`
- `KNOWLEDGE_ANTIVIRUS_REQUIRED=true`

Le bucket Supabase `knowledge-files` doit exister et rester privé. Aucun lien public permanent n’est enregistré.

En production, l’absence de ClamAV bloque volontairement l’import. Ne désactivez pas ce contrôle pour contourner une erreur de déploiement.

## Formats pris en charge

- images : JPG, PNG, WebP ;
- documents : PDF, DOCX, XLSX, CSV, TXT.

Un format non reconnu, un fichier vide, infecté, supérieur à 20 Mo ou sans texte exploitable est refusé avec un message compréhensible. « Tous les formats » ne doit pas signifier exécuter ou accepter aveuglément des fichiers dangereux.

## Test réel avant ouverture aux agences

1. Importer une image contenant une information connue et vérifier le texte OCR.
2. Corriger volontairement une ligne puis enregistrer en brouillon.
3. Poser la question dans WhatsApp : le brouillon ne doit pas être utilisé.
4. Publier l’information comme communicable aux clients.
5. Reposer la question : la réponse doit provenir du passage publié.
6. Retirer la publication puis vérifier que l’IA cesse immédiatement de l’utiliser.
7. Répéter avec un PDF de plusieurs pages, un DOCX et un CSV.
8. Vérifier avec deux organisations que les fichiers et résultats ne se croisent jamais.
