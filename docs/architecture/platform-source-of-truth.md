# Sources de vérité et relations inter-modules

Une donnée configurable est créée dans son module propriétaire puis référencée
par son identifiant dans les autres modules. Les libellés copiés ne servent que
de snapshots historiques (devis, facture, tracking passé) et ne sont jamais la
source d’une nouvelle opération.

| Donnée | Module propriétaire | Principaux consommateurs |
|---|---|---|
| Client | Clients | Dossiers, colis, paiements, relances, broadcasts |
| Dossier | Dossiers | Colis, finance, relances, communications |
| Route | Routes | Services, dossiers, colis, départs, expéditions, pricing |
| Service | Services | Dossiers, colis, départs, expéditions, pricing |
| Tarif calculé | Tarification | Devis, dossier, colis, facture, IA WhatsApp |
| Entrepôt | Entrepôts | Routes, dossiers, colis, départs, expéditions |
| Bureau | Organisation | Routes, dossiers, retraits, départs |
| Départ | Calendrier | Colis, expéditions, tracking, notifications |
| Statut réel | Module opérationnel concerné | Tracking, dashboard, IA, notifications |
| Consentement/contact | Clients | Broadcasts, relances, WhatsApp |
| Connaissance | Knowledge Base | IA interne, WhatsApp, support |

## Règles d’implémentation

1. Les formulaires utilisent `/references` et affichent des libellés humains,
   jamais un champ demandant un UUID.
2. Le backend valide systématiquement `org_id` pour chaque référence.
3. Route et Service alimentent automatiquement les champs d’affichage hérités
   (origine, destination et mode).
4. Devis et factures figent un `pricing_snapshot_id`; modifier une grille future
   ne change pas une transaction passée.
5. Les références historiques ambiguës restent visibles dans
   `platform_reference_integrity` jusqu’à leur correction humaine.
