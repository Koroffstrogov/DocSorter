# UI_RIGHT_PANEL_TARGET.md — DocSorter Local

## 1. Objectif du document

Ce fichier est la spécification cible du **volet droit** de DocSorter Local.

Il sert de référence obligatoire pour les prochains lots d’interface. Les prochains prompts Codex doivent commencer par :

```text
Lis UI_RIGHT_PANEL_TARGET.md à la racine du repo.
Ne cherche pas à améliorer légèrement l’existant : remplace la structure actuelle de la section concernée par la structure cible décrite dans UI_RIGHT_PANEL_TARGET.md.
```

## 2. Objectif produit

DocSorter Local doit permettre de trier un document rapidement :

```text
Voir le document
→ lancer ou obtenir une analyse IA
→ choisir / corriger rapidement les champs utiles
→ vérifier le nom final et le dossier final
→ valider le classement
```

Le volet droit doit être une **console de décision**, pas un panneau de configuration.

L’utilisateur doit pouvoir :
- comprendre immédiatement l’état du document ;
- voir le nom proposé ;
- voir le dossier proposé ;
- corriger une date, une cible, un type ou un dossier sans chercher dans des blocs techniques ;
- accéder aux diagnostics seulement si nécessaire.

## 3. Décision structurante

Le volet droit doit fonctionner avec deux niveaux :

```text
[ Simple ] [ Avancé / diagnostic ]
```

### Mode Simple

Mode par défaut. Utilisé pour le tri quotidien.

Il doit afficher uniquement :
- le choix du profil IA ;
- l’état court du modèle et du texte ;
- les boutons principaux ;
- le nom final proposé ;
- le dossier final proposé ;
- les candidats par champ ;
- les candidats dossier ;
- les alertes importantes.

### Mode Avancé / diagnostic

Mode secondaire. Utilisé pour comprendre, diagnostiquer ou configurer.

Il peut contenir :
- détails Ollama ;
- URL ;
- timeout ;
- keep alive ;
- chemin de config ;
- derniers tests ;
- diagnostic JSON ;
- export diagnostic ;
- détails OCR ;
- logs sobres.

Le mode avancé ne doit pas polluer le mode simple.

## 4. Structure globale de l’application

L’application reste en trois colonnes :

```text
┌───────────────┬───────────────────────────────┬──────────────────────────────┐
│ File à trier   │ Aperçu document               │ Assistant de tri             │
│               │                               │                              │
│ Liste docs     │ PDF / image / scan            │ Mode simple / avancé         │
│ Statuts        │ Document lisible              │ Nom + dossier + champs       │
└───────────────┴───────────────────────────────┴──────────────────────────────┘
```

Le document doit rester lisible au centre. Aucun panneau ne doit venir se superposer au document.

## 5. Structure cible du volet droit — Mode Simple

Ordre obligatoire :

```text
1. Bascule Simple / Avancé
2. Assistant IA
3. Proposition de tri
4. Affiner les champs
5. Dossier cible
6. Diagnostic, replié
7. Réglages avancés, replié
```

## 6. Bascule de mode

En haut du volet droit :

```text
[ Simple ] [ Avancé / diagnostic ]
```

Règles :
- `Simple` actif par défaut ;
- `Avancé / diagnostic` accessible en un clic ;
- l’état sélectionné doit être visuellement clair ;
- la bascule ne doit pas modifier les données de classement.

## 7. Section Assistant IA

### Objectif

Permettre à l’utilisateur de préparer et lancer l’analyse IA sans afficher les détails techniques.

### Structure cible

```text
Assistant IA                                      Texte OK

Profil IA
[ gemma4:12b no-think                         v ]

Ollama OK · modèle chargé · texte OK       Dernière analyse : 4,2 s

[ Charger le modèle IA ] [ Analyser avec IA locale ]
```

### Données visibles en mode simple

Afficher :
- profil IA sélectionné ;
- statut court Ollama ;
- statut court modèle ;
- statut court texte ;
- temps de chargement ou d’analyse si disponible ;
- bouton `Charger le modèle IA` ;
- bouton `Analyser avec IA locale`.

### Données interdites en mode simple

Ne pas afficher directement :
- URL Ollama ;
- chemin de config ;
- timeout ;
- keep alive ;
- chemin Tesseract ;
- logs longs ;
- JSON brut ;
- erreurs techniques détaillées.

Ces informations doivent aller dans `Avancé / diagnostic`.

### États possibles

```text
Ollama non testé
Ollama OK · modèle non chargé · texte non extrait
Ollama OK · modèle chargé · texte OK
Chargement modèle… 1,4 s
Extraction texte… 0,6 s
Analyse IA… 4,2 s
Analyse prête · 4,8 s
Erreur Ollama
Modèle absent
OCR nécessaire
```

## 8. Section Proposition de tri

### Objectif

C’est la carte principale de décision.

Elle doit répondre immédiatement à :

```text
Quel nom sera utilisé ?
Dans quel dossier ira le document ?
Est-ce prêt à classer ?
```

### Structure cible

```text
Proposition de tri

Nom final
2026_lea_certificat-scolarite.pdf

Dossier final
Scolarite

[ Date forte ] [ Type fort ] [ Dossier moyen ]

[ Valider et classer ] [ Vérifier avant classement ]
```

### Règles

- Le nom final doit être très lisible.
- Le dossier final doit être affiché en chemin relatif, pas en chemin Windows complet.
- Si le nom est absent : `Nom final non généré`.
- Si le dossier est absent : `Aucun dossier final`.
- Si le dossier est à créer : badge `à créer`.
- Si le dossier existe : badge `existe`.
- Si fallback : badge `fallback`.
- Les badges qualité ne s’affichent que si une analyse existe.
- `Valider et classer` conserve son comportement réel existant.
- Ne pas brancher différemment le classement réel sans lot dédié.

### Interdits

En mode simple, cette carte ne doit pas afficher :
- chemin Windows complet ;
- détails du diagnostic IA ;
- JSON ;
- logs ;
- explication longue.

## 9. Section Affiner les champs

### Objectif

Permettre une correction rapide des paramètres de nommage.

Champs affichés :
- Date ;
- Sujet ;
- Cible ;
- Type ;
- Émetteur ;
- Détail.

### Avant analyse IA

Ne pas afficher six grandes cartes vides.

Afficher seulement :

```text
Affiner les champs
Analyse IA requise pour afficher les choix par champ.
```

### Après analyse IA

Affichage en lignes compactes, pas en grandes cartes verticales.

Structure cible :

```text
Affiner les champs                              Score global 95 %

Date       [2026 95%]       [2026-2027 88%]              ✎
Sujet      [lea 94%]        [scolarite 34%]              ✎
Cible      [lea 94%]        [élève 30%]                  ✎
Type       [certificat-scolarite 95%] [attestation 72%]  ✎
Émetteur   [college-monet 82%] [aucun 60%]               ✎
Détail     [aucun 90%]      [2026-2027 40%]              ✎
```

### Règles visuelles

- Une ligne par champ.
- Le candidat sélectionné est un badge/pill visible.
- Les alternatives sont des badges secondaires.
- Le score est intégré au badge ou affiché juste à côté.
- Le bouton modifier est une petite icône ou un lien discret.
- Aucun bouton `Modifier` pleine largeur.
- Un champ manuel reçoit un badge `manuel`.
- Un champ absent affiche `à compléter`.
- Émetteur et Détail doivent pouvoir prendre la valeur `aucun`.

### Règles fonctionnelles

- Cliquer un candidat sélectionne ce candidat.
- Modifier un champ manuellement met à jour la proposition visuelle.
- Les champs sélectionnés sont la source de vérité visuelle du nom final.
- Le nom final est recalculé depuis :
  ```text
  dateToken + target + documentType + issuer + detail
  ```
- `fileNameCandidates` ne doit pas être la source de vérité du nom final.
- Les doublons sémantiques doivent être retirés si le mécanisme existe.

## 10. Section Dossier cible

### Objectif

Permettre de choisir vite où classer le document.

Le dossier cible n’a pas besoin d’être identique aux blocs du nom. Le nom est normé ; le dossier respecte l’arborescence réelle.

Exemple :
- nom : `2023-11-02_paul_carte-identite.pdf`
- dossier : `CNI` ou `Identité`.

### Avant analyse IA

Afficher seulement :

```text
Dossier cible
Analyse IA requise pour proposer un dossier.
```

### Après analyse IA

Afficher au maximum trois cartes :

```text
Dossier cible

[✓ Scolarite]                         existe
[  Scolarite/Lea ]                    à créer
[  Divers/A-traiter-manuellement ]    fallback
```

Autre exemple :

```text
[✓ CNI]                               existe
[  Identité ]                         à créer
[  Divers ]                           fallback
```

### Règles

- Trois candidats maximum en mode simple.
- Le dossier sélectionné est très visible.
- Les badges obligatoires :
  - `existe` ;
  - `à créer` ;
  - `fallback`.
- Afficher seulement des chemins relatifs.
- Ne jamais afficher de chemin Windows complet en mode simple.
- Ne jamais créer de dossier dans ce lot.
- La création de dossier doit rester une action explicite dans un lot dédié.

### Mini-arborescence

Si les données de dossiers connus sont déjà disponibles sans nouveau risque IPC, afficher un mini-arbre compact :

```text
Arborescence
▼ Famille
  ├─ Banque
  ├─ CNI                 ← sélectionné
  ├─ Scolarité
  ├─ Véhicules
  └─ Divers
```

Si cela impose un gros changement IPC, ne pas l’ajouter dans le lot UI.

## 11. Section Diagnostic

Repliée par défaut.

Header :

```text
Diagnostic  ›
```

Une fois ouverte :
- bouton `Exporter diagnostic IA` ;
- mode complet / expurgé ;
- dernier fichier diagnostic ;
- modèle utilisé ;
- temps détaillés ;
- JSON ou détails si déjà disponibles.

Cette section ne doit pas occuper d’espace en mode simple fermé.

## 12. Section Réglages avancés

Repliée par défaut.

Header :

```text
Réglages avancés  ›
```

Contenu :
- détails Ollama ;
- test Ollama ;
- URL ;
- timeout ;
- keep alive ;
- config ;
- OCR ;
- Tesseract ;
- chemins techniques.

Cette section remplace l’affichage technique actuellement visible dans le flux principal.

## 13. Critères visuels mesurables

Le mode simple est accepté si :

- le haut du volet droit ne ressemble plus à un panneau de configuration ;
- le bloc Assistant IA tient en une carte compacte ;
- le mode simple n’affiche pas de chemin Windows complet ;
- le mode simple n’affiche pas les détails techniques Ollama ;
- avant analyse, Affiner les champs est compact ;
- après analyse, les six champs tiennent en lignes compactes ;
- les boutons Modifier ne sont pas pleine largeur ;
- les candidats sont lisibles et cliquables ;
- le dossier cible est affiché sous forme de cartes compactes ;
- Diagnostic et Réglages avancés sont fermés par défaut ;
- le volet droit scrolle nettement moins qu’avant.

## 14. Interdits explicites

En mode simple, ne pas afficher :
- JSON brut ;
- URL Ollama ;
- chemin config ;
- chemin Tesseract ;
- chemin Windows complet du dossier final ;
- logs techniques longs ;
- six cartes vides avant analyse ;
- gros boutons Modifier pleine largeur ;
- plusieurs sections concurrentes de renommage.

Ne pas modifier dans les lots UI :
- classement réel ;
- journal ;
- annulation ;
- déplacement ;
- renommage ;
- suppression ;
- création de dossier ;
- OCR automatique ;
- IA automatique au changement de document.

## 15. États à gérer

### Aucun document sélectionné

```text
Assistant IA
Sélectionnez un document à trier.
```

Sections Proposition / Champs / Dossier en état compact.

### Document sélectionné, texte non extrait

```text
Texte non extrait
Action : Analyser avec IA locale
```

Si le bouton Analyser orchestre l’extraction PDF, afficher l’étape.

### Modèle non chargé

```text
Ollama OK · modèle non chargé · texte OK
[ Charger le modèle IA ]
```

### Analyse en cours

```text
Analyse IA… 3,4 s
```

### Suggestion prête

Afficher nom final, dossier final, champs candidats, dossiers candidats.

### Suggestion incomplète

Afficher :
- nom non généré ;
- champs manquants ;
- bouton Analyse / Modifier.

### Erreur

Afficher une erreur courte en mode simple. Détails dans Diagnostic.

## 16. Tests minimum par lot UI

Chaque lot UI doit vérifier :

- pas de changement de comportement du bouton `Valider et classer` ;
- pas d’IPC ajouté sans justification ;
- pas de mutation disque ;
- mode simple par défaut ;
- avancé/diagnostic accessible ;
- tests renderer adaptés ;
- build OK.

Commandes de validation :

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Si possible :

```bash
npm run dev
```

## 17. Règle de prompt Codex

Pour les prochains prompts UI, inclure :

```text
Lis UI_RIGHT_PANEL_TARGET.md.
Ne cherche pas à améliorer légèrement l’existant : remplace la structure actuelle de cette section par la structure cible décrite dans UI_RIGHT_PANEL_TARGET.md.
```

Chaque prompt doit cibler une seule zone :
- Assistant IA ;
- Proposition de tri ;
- Affiner les champs ;
- Dossier cible ;
- Diagnostic / avancé ;
- polish final.

Ne pas demander une refonte générale dans un seul prompt.
