# UI_SIMPLE_MODE_SPEC.md — DocSorter Local

## 1. Objectif

Ce document spécifie la nouvelle interface principale de DocSorter Local.

But produit : obtenir une interface de tri documentaire simple, rapide et lisible, basée sur l’IA locale, permettant à l’utilisateur de décider vite tout en pouvant affiner chaque champ si nécessaire.

Le document doit être placé à la racine du dépôt et servir de référence aux prompts Codex.

## 2. Principe général

L’application doit proposer deux niveaux d’interface dans le même écran :

1. **Mode simple** : mode par défaut, destiné au tri quotidien.
2. **Mode avancé / diagnostic** : accès aux informations techniques, diagnostics, réglages et logs.

Le mode simple doit rester centré sur :
- le document actif ;
- le nom final proposé ;
- le dossier final proposé ;
- les candidats IA par champ ;
- la validation humaine.

Le mode avancé doit conserver les outils existants de diagnostic, sans encombrer le flux principal.

## 3. Layout global

L’écran principal conserve une disposition en trois zones :

```text
┌──────────────┬──────────────────────────────┬──────────────────────────────┐
│ File à trier │ Aperçu document              │ Assistant de tri             │
│              │ PDF / image / scan           │ Mode simple / avancé         │
└──────────────┴──────────────────────────────┴──────────────────────────────┘
```

### 3.1 Colonne gauche — File à trier

La colonne gauche affiche :
- les documents à trier ;
- le document actif ;
- les statuts courts : `texte OK`, `OCR nécessaire`, `IA analysé`, `à valider`, `erreur`.

Elle ne doit pas contenir de paramètres techniques.

### 3.2 Colonne centrale — Aperçu document

La colonne centrale doit rester l’espace principal de lecture.

Elle affiche :
- l’aperçu PDF ou image ;
- la pagination ;
- le zoom ;
- les contrôles de lecture nécessaires.

L’interface de tri ne doit jamais masquer l’aperçu du document.

### 3.3 Colonne droite — Assistant de tri

La colonne droite est le centre de décision.

Largeur cible : environ 420 à 480 px.

Elle contient, en mode simple :
1. Pilotage IA ;
2. Proposition de tri ;
3. Affiner les champs ;
4. Dossier cible ;
5. Diagnostic replié ;
6. Réglages avancés repliés.

## 4. Mode simple

Le mode simple est affiché par défaut.

Il doit être organisé ainsi :

```text
Assistant IA
Proposition de tri
Affiner les champs
Dossier cible
Diagnostic ▸
Réglages avancés ▸
```

## 5. Pilotage IA

### 5.1 Sélecteur de modèle

En haut du volet droit, afficher un sélecteur de profil IA.

Profils à prévoir :
- `gemma3:4b`
- `gemma4:12b no-think`
- `gemma4:12b thinking`

Chaque profil correspond à :
- un nom de modèle Ollama ;
- un booléen `think` ;
- un libellé UI.

### 5.2 Bouton Charger le modèle IA

Bouton visible :
```text
Charger le modèle IA
```

Comportement attendu :
1. tester la connexion Ollama ;
2. vérifier que le modèle sélectionné existe ;
3. précharger le modèle sans analyser de document ;
4. maintenir le modèle chargé pendant la durée configurée, par défaut 30 minutes ;
5. afficher l’étape en cours ;
6. afficher un chronomètre actualisé toutes les 100 ms ;
7. conserver le temps final de chargement.

Le bouton ne doit pas lancer d’analyse documentaire.

### 5.3 Bouton Analyser avec IA locale

Bouton visible :
```text
Analyser avec IA locale
```

Ce bouton est un orchestrateur.

Séquence attendue :
1. tester Ollama ;
2. vérifier le modèle sélectionné ;
3. charger le modèle s’il n’est pas prêt ;
4. extraire automatiquement le texte PDF si le document est un PDF texte et si le texte n’est pas encore extrait ;
5. si le texte reste indisponible, afficher `OCR nécessaire` sans lancer l’OCR automatiquement ;
6. appeler l’analyse IA ;
7. afficher les candidats IA ;
8. conserver le temps total d’analyse.

Étapes UI possibles :
- `Connexion Ollama`
- `Chargement modèle`
- `Extraction texte`
- `Analyse IA`
- `Terminé`
- `Erreur`

Le chronomètre doit s’actualiser par dixième de seconde.

### 5.4 Statuts

Afficher de manière compacte :
- statut Ollama ;
- statut modèle ;
- statut texte ;
- dernier temps de chargement ;
- dernier temps d’analyse ;
- modèle utilisé ;
- mode thinking actif ou non.

## 6. Proposition de tri

Cette section est la plus importante du volet droit.

Elle doit contenir :

```text
Nom final
<nom proposé>

Dossier final
<dossier proposé>

[Valider et classer]
```

Le bouton `Valider et classer` conserve son comportement existant tant qu’un lot ultérieur ne le modifie pas explicitement.

La section affiche aussi des badges de qualité :
- `Date forte`
- `Cible forte`
- `Type fort`
- `Dossier moyen`
- ou équivalents.

Si un champ obligatoire manque, afficher :
```text
Nom final non généré
Champ manquant : <champ>
```

## 7. Affiner les champs

Cette section affiche les candidats IA par champ.

Champs à afficher :
- Date ;
- Sujet ;
- Cible ;
- Type ;
- Émetteur ;
- Détail.

Chaque champ affiche :
- le candidat sélectionné ;
- jusqu’à 3 candidats ;
- un score en pourcentage ;
- une raison courte si l’espace le permet ;
- un bouton `Modifier`.

Exemple :

```text
Date
● 2026-01-01   95 %
○ 2025-12-15   61 %
[Modifier]
```

### 7.1 Interaction

- cliquer sur un candidat le sélectionne ;
- cliquer sur `Modifier` ouvre une saisie courte ;
- une valeur manuelle prend le dessus visuellement ;
- afficher un badge `manuel` sur les champs modifiés ;
- pour `Émetteur` et `Détail`, permettre explicitement `aucun`.

### 7.2 Source de vérité

Les champs sélectionnés sont la source de vérité UI.

Le nom final doit être recalculé à partir de :
```text
dateToken + target + documentType + issuer + detail
```

`fileNameCandidates` peut être affiché comme alternative, mais ne doit pas être la source principale du nom final.

## 8. Dossier cible

La section `Dossier cible` affiche jusqu’à 3 propositions.

Chaque proposition indique :
- chemin relatif ;
- score si disponible ;
- état : `existe`, `à créer`, `fallback`.

Exemple :

```text
● CNI                          existe
○ Identité                     à créer
○ Divers/A-traiter-manuellement fallback
```

### 8.1 Interaction

- cliquer sur un dossier met à jour `Dossier final` ;
- aucune création de dossier dans cette section sans confirmation ultérieure ;
- si le dossier est à créer, afficher clairement `à créer`.

### 8.2 Arborescence

Afficher une mini arborescence si les données sont déjà disponibles sans nouveau risque IPC.

Le dossier sélectionné doit être surligné.

Si l’arborescence est trop lourde pour ce lot, afficher uniquement les cartes de dossiers.

## 9. Diagnostic

La section `Diagnostic` est repliée par défaut.

Elle peut contenir :
- export diagnostic IA ;
- modèle utilisé ;
- mode complet / expurgé ;
- temps de chargement ;
- temps d’analyse ;
- JSON brut ou résumé ;
- erreurs de validation.

Elle ne doit pas apparaître comme une étape normale du tri.

Texte d’aide recommandé :
```text
Le diagnostic ne classe rien. Il génère un fichier à transmettre pour comprendre les choix.
```

## 10. Réglages avancés

La section `Réglages avancés` est repliée par défaut.

Elle contient :
- réglages Ollama ;
- réglages OCR ;
- test Ollama détaillé ;
- keep_alive ;
- informations techniques.

Les réglages avancés ne doivent pas allonger le flux principal.

## 11. Mode avancé / diagnostic

Un sélecteur ou une bascule doit permettre :

```text
[Simple] [Avancé / diagnostic]
```

En mode avancé :
- conserver l’accès aux outils de diagnostic ;
- afficher les informations techniques existantes ;
- permettre l’export diagnostic ;
- ne pas modifier les actions de classement réel.

Le mode simple reste le mode par défaut.

## 12. Règles de sécurité

L’UI ne doit pas :
- lancer d’OCR automatiquement ;
- lancer l’IA sans action utilisateur ;
- créer un dossier sans confirmation ;
- déplacer, renommer ou supprimer un document sans validation explicite ;
- exposer de chemin Windows complet dans les logs utilisateur ;
- afficher de données sensibles brutes dans les diagnostics expurgés ;
- modifier le journal ou l’annulation sans demande explicite.

## 13. Contraintes techniques Electron

Respecter l’architecture Electron existante :
- l’UI est gérée côté renderer ;
- les accès système passent par main/preload/IPC ;
- ne pas exposer directement `ipcRenderer` au renderer ;
- ne pas ajouter de canal IPC si une API existante suffit ;
- tout nouveau canal IPC doit être limité et validé.

## 14. États UI attendus

### 14.1 Aucun document sélectionné

Afficher :
```text
Sélectionnez un document à trier.
```

### 14.2 Document sélectionné, texte non extrait

Afficher :
```text
Texte non extrait.
Action recommandée : Analyser avec IA locale.
```

Le bouton `Analyser avec IA locale` pourra extraire le texte PDF si possible.

### 14.3 Texte indisponible après extraction

Afficher :
```text
Texte non disponible.
OCR nécessaire.
```

Ne pas lancer l’OCR automatiquement.

### 14.4 Modèle non chargé

Afficher :
```text
Modèle IA non chargé.
```

L’utilisateur peut cliquer sur `Charger le modèle IA` ou directement sur `Analyser avec IA locale`.

### 14.5 Analyse en cours

Afficher :
- étape courante ;
- chronomètre ;
- boutons désactivés pour éviter les doubles clics.

### 14.6 Analyse prête

Afficher :
- nom final ;
- dossier final ;
- candidats par champ ;
- candidats dossier ;
- possibilité de modifier.

### 14.7 Erreur

Afficher une erreur courte et exploitable.

Exemples :
- `Ollama indisponible`
- `Modèle absent`
- `Texte insuffisant`
- `Réponse IA invalide`

## 15. Tests à prévoir

Tests renderer :
1. le mode simple est affiché par défaut ;
2. le sélecteur de modèle est visible ;
3. `Charger le modèle IA` est visible ;
4. `Analyser avec IA locale` est visible ;
5. le chronomètre s’affiche pendant chargement/analyse ;
6. la proposition de tri affiche nom et dossier ;
7. les 6 champs d’affinage sont affichés ;
8. les candidats peuvent être sélectionnés ;
9. une modification manuelle met à jour le nom final ;
10. les dossiers candidats affichent `existe`, `à créer`, `fallback` ;
11. `Diagnostic` et `Réglages avancés` sont repliés par défaut ;
12. le mode avancé reste accessible.

Tests comportementaux :
1. `Charger le modèle IA` ne lance pas d’analyse ;
2. `Analyser avec IA locale` teste Ollama, charge le modèle si besoin, extrait le texte PDF si nécessaire, puis analyse ;
3. aucun OCR automatique ;
4. aucun déplacement/renommage/suppression/création ;
5. `Valider et classer` conserve son comportement existant tant qu’il n’est pas explicitement modifié.

## 16. Critères d’acceptation

Le lot est réussi si :
- l’interface simple ressemble au prototype validé ;
- l’utilisateur voit immédiatement le nom et le dossier proposés ;
- l’utilisateur peut affiner les champs sans ouvrir le diagnostic ;
- le document reste lisible au centre ;
- les réglages techniques sont masqués par défaut ;
- l’analyse IA suit le bon séquencement ;
- les temps sont visibles et conservés ;
- aucune mutation fichier n’est déclenchée hors validation explicite.
