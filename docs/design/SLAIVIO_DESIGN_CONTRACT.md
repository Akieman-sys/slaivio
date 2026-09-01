# Contrat de design officiel SLAIVIO

Statut : référence officielle du Pilot V1  
Version : 1.0  
Date : 1 septembre 2026

## 1. Objectif

Ce contrat définit le langage visuel unique de SLAIVIO. Il s'applique à l'authentification, à l'onboarding et à toutes les pages du produit. Les références comme Mercor servent à étudier la discipline visuelle, la hiérarchie et le placement des actions ; leur identité, leurs couleurs et leur structure métier ne doivent pas être copiées.

SLAIVIO doit paraître humain, calme, précis et fiable. Le vert reste la couleur de marque et d'action. L'interface privilégie la lisibilité et le travail quotidien de l'entreprise avant les effets décoratifs.

## 2. Résultat de l'audit

L'audit du frontend a identifié plusieurs générations de styles qui coexistent : anciennes pages Cargo, composants Pilot, utilitaires Tailwind locaux et règles globales historiques. Le dépôt contient plus de 2 000 déclarations locales de taille ou de couleur. Cela explique les variations de typographie, de densité, de boutons, d'onglets et de panneaux entre modules.

Les primitives partagées existantes sont conservées, puis deviendront progressivement le passage obligatoire pour les nouvelles interfaces. Cette première partie fixe le socle ; les parties suivantes migreront les écrans sans réécrire leur logique métier.

## 3. Principes non négociables

- Une action identique possède le même composant, le même libellé et le même emplacement logique.
- Le vert indique une action principale, une sélection ou un état positif. Il ne sert pas de décoration permanente.
- Une icône n'est utilisée que si elle accélère la compréhension. Elle ne remplace jamais un libellé essentiel.
- Les informations techniques, UUID et codes backend ne sont pas affichés aux entreprises.
- Une page possède un seul titre principal et une seule action principale dominante.
- Les séparations utilisent des bordures fines. Les ombres fortes et les blocs imbriqués sans nécessité sont interdits.
- Les états vide, chargement, erreur, succès et hors connexion font partie du design de chaque écran.
- Aucun rafraîchissement de données ne doit déplacer la mise en page ou réinitialiser le défilement de l'utilisateur.

## 4. Typographie

La police officielle est **Inter Variable**, chargée localement avec `@fontsource-variable/inter`. L'application ne dépend pas d'un CDN de polices.

| Usage | Taille / hauteur | Graisse |
| --- | --- | --- |
| Titre de page | 24 / 32 px | 700 |
| Titre de fenêtre ou panneau | 20 / 28 px | 600 |
| Titre de section | 16 / 24 px | 600 |
| Titre de carte | 15 / 22 px | 600 |
| Corps de texte | 14 / 20 px | 400 |
| Bouton | 14 / 20 px | 600 |
| Onglet | 14 / 20 px | 500 |
| Libellé de champ | 14 / 20 px | 500 |
| Aide et métadonnée | 13 / 18 px | 400 |
| Badge | 12 / 16 px | 500 |

Le gras courant est limité à 600. La graisse 700 est réservée aux titres de page et aux chiffres réellement importants. Une taille arbitraire comme `text-[13.5px]` est interdite dans une nouvelle fonctionnalité.

## 5. Couleurs officielles

| Rôle | Jeton | Valeur |
| --- | --- | --- |
| Fond application | `--sl-color-canvas` | `#f7f8f8` |
| Surface principale | `--sl-color-surface` | `#ffffff` |
| Surface secondaire | `--sl-color-surface-subtle` | `#f5f7f6` |
| Surface au survol | `--sl-color-surface-hover` | `#eef2f0` |
| Bordure | `--sl-color-border` | `#dfe4e1` |
| Bordure forte | `--sl-color-border-strong` | `#cbd3cf` |
| Texte principal | `--sl-color-text` | `#17201c` |
| Texte secondaire | `--sl-color-text-secondary` | `#56615c` |
| Texte discret | `--sl-color-text-muted` | `#75807b` |
| Action principale | `--sl-color-brand` | `#087a46` |
| Survol principal | `--sl-color-brand-hover` | `#06673b` |
| Action pressée | `--sl-color-brand-active` | `#05532f` |
| Fond sélectionné | `--sl-color-brand-soft` | `#e8f6ef` |
| Danger | `--sl-color-danger` | `#b42318` |
| Avertissement | `--sl-color-warning` | `#8b5400` |

Les couleurs hexadécimales locales sont interdites dans les nouvelles pages. Une nouvelle couleur doit d'abord être ajoutée au contrat et aux jetons globaux.

## 6. Espacement, dimensions et profondeur

- Échelle d'espacement : 4, 8, 12, 16, 20, 24, 32, 40, 48 et 64 px.
- Hauteur standard d'un champ ou bouton : 40 px.
- Hauteur compacte : 32 px. Hauteur tactile mobile : 44 px minimum.
- Rayon de contrôle : 6 px. Surface interne : 8 px. Carte ou fenêtre : 12 px.
- Largeur de contenu métier : 1536 px maximum.
- Largeur de formulaire : 720 px maximum, sauf formulaire à deux colonnes justifié.
- Les ombres sont réservées aux éléments flottants : menus, fenêtres, notifications et panneaux.

## 7. Contrat des composants

### Boutons

Le bouton principal est vert, plein et unique dans une zone d'action. Le bouton secondaire est blanc avec une bordure. Le bouton tertiaire est textuel. Une action destructive est rouge et demande une confirmation SLAIVIO, jamais une boîte de dialogue native du navigateur.

Les boutons avec icône utilisent une icône de 16 px, un espace de 8 px et un libellé explicite. Un bouton uniquement iconique doit avoir une infobulle et un nom accessible.

### Champs et sélecteurs

Tous les champs ont une hauteur de 40 px, une bordure fine, un rayon de 6 px et un focus vert visible. Le libellé reste au-dessus du champ. L'aide se place sous le champ. L'erreur ne remplace pas le libellé et indique comment corriger la saisie.

Un menu de sélection doit être aligné sur son déclencheur, rester visible dans la fenêtre et présenter chaque option avec la même hiérarchie typographique.

### Onglets

Les onglets sont textuels, en 14 px/500. L'onglet actif est vert et souligné par une ligne de 2 px. Les onglets suivent immédiatement le titre ou l'introduction de leur contexte. Ils ne contiennent pas d'icônes décoratives. Si l'espace manque, les éléments secondaires passent dans un menu « Plus » ; aucun défilement horizontal permanent n'est accepté sur ordinateur.

### Cartes et indicateurs

Une carte utilise une surface blanche, une bordure de 1 px et un rayon de 12 px. Elle n'est cliquable que si toute sa surface mène au même résultat. Les KPI affichent d'abord la valeur, puis un libellé clair, et utilisent la couleur seulement pour exprimer un état.

### Tableaux

Les en-têtes utilisent 13 px/600, les cellules 14 px/400. Une ligne ouvrable se termine par une flèche vers la droite. Les actions secondaires sont regroupées sans concurrencer l'ouverture du détail. Le survol signale la ligne sans modifier sa taille.

### Menus, fenêtres et panneaux

Un menu contextuel est ancré à son déclencheur. Une fenêtre centrale sert à une décision courte ou un formulaire ciblé. Un panneau latéral sert au contexte détaillé sans quitter la liste. Les trois utilisent les mêmes bordures, rayons, titres, boutons et espacements.

### Navigation, avatar et notifications

La barre latérale affiche l'icône SLAIVIO seule en tête, puis les modules Pilot dans l'ordre métier. Les réglages de compte, l'aide et la déconnexion appartiennent au menu avatar. Les paramètres de l'entreprise restent dans le centre Paramètres si l'utilisateur en a le droit.

La cloche ouvre un panneau compact contenant uniquement les notifications utiles, classées par date, avec état lu/non lu et destination claire. Elle ne duplique pas la boîte de réception WhatsApp.

## 8. Comportement responsive

- Mobile : jusqu'à 767 px. Navigation en panneau, formulaires en une colonne, actions principales pleine largeur si nécessaire, panneau latéral en plein écran.
- Compact : 768 à 1199 px. Navigation réduite possible, grilles limitées à deux colonnes.
- Bureau : à partir de 1200 px. Contenu centré avec largeur maximale et densité standard.
- Aucun écran ne doit provoquer un défilement horizontal global.
- Les tableaux passent en liste structurée sur mobile lorsque les colonnes ne peuvent pas rester compréhensibles.

## 9. Accessibilité et mouvement

- Contraste WCAG AA pour le texte et les contrôles.
- Focus clavier visible avec l'anneau officiel vert.
- Navigation complète au clavier pour menus, onglets, fenêtres et panneaux.
- Zone tactile minimale de 44 px sur mobile.
- Les interactions rapides durent 120 ms et les transitions standard 180 ms ; aucune animation fonctionnelle ne dépasse 220 ms.
- `prefers-reduced-motion` désactive les mouvements non essentiels.
- Un chargement conserve les dimensions finales afin d'éviter les sauts de page.

## 10. Gouvernance d'implémentation

Toute nouvelle interface doit utiliser les jetons globaux et, lorsqu'elles existent, les primitives partagées de `components/ui`. Les exceptions doivent être documentées dans la revue de code.

La validation d'une partie comprend au minimum :

1. contrôle visuel bureau et mobile ;
2. navigation clavier et focus ;
3. états chargement, vide, erreur et succès ;
4. absence de code technique visible ;
5. test TypeScript et test du contrat visuel ;
6. vérification qu'aucune règle locale ne réintroduit une police, une couleur ou une dimension arbitraire.

## 11. Périmètre de cette première partie

Cette partie installe Inter localement, fixe les jetons, normalise les fondations globales, harmonise l'apparence de l'authentification et ajoute un test de non-régression. Elle ne prétend pas que chaque écran historique est déjà migré. La navigation, l'accueil, les paramètres, l'onboarding, les formulaires, les tableaux, les fenêtres, les panneaux et la boîte de réception seront repris dans les parties suivantes sur ce socle unique.
