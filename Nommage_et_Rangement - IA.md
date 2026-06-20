# Nommage et Rangement - IA

Ce document décrit l'état réel du code DocSorter Local pour le nommage, le dossier cible et les diagnostics IA.

Objectif : aider à diagnostiquer les choix de prompt, les réponses Ollama et la proposition finale réellement utilisée par l'application.

Point important : DocSorter ne classe jamais automatiquement un document après une analyse IA. L'utilisateur garde la validation finale.

## Etat Actuel En Une Page

DocSorter fonctionne aujourd'hui en mode IA locale seule pour les propositions visibles dans l'interface.

Le flux actif est :

1. l'utilisateur choisit un document ;
2. il extrait le texte PDF ou lance l'OCR image si nécessaire ;
3. il clique explicitement sur `Analyser avec IA locale` ;
4. Ollama retourne une réponse JSON multi-candidats ;
5. DocSorter valide, normalise et nettoie cette réponse ;
6. l'utilisateur choisit ou corrige les candidats IA ;
7. DocSorter recalcule localement le nom final ;
8. le sous-dossier IA sélectionné est synchronisé avec le sous-dossier cible réel ;
9. le contrôle de collision est relancé ;
10. le classement réel utilise le nom IA canonique validé, après action explicite de l'utilisateur.

Les anciens moteurs déterministes peuvent encore exister dans le dépôt pour historique, tests ou compatibilité, mais ils ne sont plus la source principale des propositions visibles.

Cela concerne notamment :

- les anciennes suggestions locales ;
- les règles utilisateur historiques ;
- les référentiels locaux ;
- le brouillon `SuggestionDraftV2` ;
- les propositions de dossiers v2 déterministes.

## Flux IA Locale

L'IA locale est utilisée uniquement après clic sur :

```text
Analyser avec IA locale
```

Elle n'est pas lancée :

- au démarrage ;
- au changement de document ;
- au scan de la source ;
- à l'extraction PDF ;
- à l'OCR image ;
- en lot sur toute la file ;
- pendant le classement réel.

Ollama doit rester local. Les URL non locales sont refusées par la configuration IA.

Le PDF ou l'image brute ne sont pas envoyés à Ollama. DocSorter envoie seulement un extrait texte borné.

## Données Envoyées A Ollama

Le prompt est construit depuis une entrée bornée.

Données possibles :

- `filename` : nom du fichier sans chemin complet ;
- `extension` ;
- `extractedTextExcerpt` : extrait texte PDF natif ;
- `ocrTextExcerpt` : extrait OCR image ;
- `availableRootFolders` : racines relatives disponibles ;
- `knownRelativeFolders` : dossiers relatifs connus ;
- `namingConvention` : `DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext` ;
- `detectedDate` ;
- `detectedYear`.

Sont exclus :

- chemin Windows complet ;
- journal de classement ;
- cache complet ;
- autres documents de la file ;
- contenu intégral du document ;
- fichier PDF ou image brut ;
- prompt complet dans les logs standards ;
- réponse brute non validée dans les logs standards.

Les extraits texte sont bornés avant appel IA.

## Prompt Et JSON Attendu

Le prompt demande une réponse JSON stricte, sans Markdown ni commentaire.

Forme attendue :

```json
{
  "fields": {
    "dateToken": {
      "selected": "2026-05",
      "candidates": [
        { "value": "2026-05", "score": 80, "reason": "période mensuelle détectée", "role": "selected" }
      ]
    },
    "subject": {
      "selected": "",
      "candidates": []
    },
    "target": {
      "selected": "foyer",
      "candidates": [
        { "value": "foyer", "score": 85, "reason": "document du foyer", "role": "selected" }
      ]
    },
    "targetKind": {
      "selected": "household",
      "candidates": [
        { "value": "household", "score": 80, "reason": "nature de la cible", "role": "selected" }
      ]
    },
    "documentType": {
      "selected": "releve-bancaire",
      "candidates": [
        { "value": "releve-bancaire", "score": 90, "reason": "libellé détecté", "role": "selected" }
      ]
    },
    "issuer": {
      "selected": "bnp-paribas",
      "candidates": [
        { "value": "BNP Paribas", "score": 75, "reason": "émetteur détecté", "role": "selected" }
      ]
    },
    "detail": {
      "selected": "",
      "candidates": []
    }
  },
  "folderCandidates": [
    { "value": "Finances/Banque", "score": 80, "reason": "dossier connu pertinent", "exists": true }
  ],
  "fileNameCandidates": [
    { "value": "2026-05_foyer_releve-bancaire_bnp-paribas.pdf", "score": 80, "reason": "convention respectée" }
  ],
  "confidence": 82,
  "warnings": [],
  "source": "ollama"
}
```

Les champs de `fields` sont obligatoires dans la structure, mais leur `selected` peut être vide si le champ n'est pas utile ou pas fiable.

## Champs IA Et Role Exact

### `dateToken`

Date ou période documentaire utilisée dans le nom final.

Formats acceptés dans le code courant :

```text
AAAA-MM-JJ
AAAA-MM
AAAA
```

Exemples :

```text
2024-03-15
2026-05
2025
```

`dateToken` est obligatoire pour générer un nom final valide.

### `subject`

Libellé optionnel pour l'utilisateur.

`subject` n'est pas utilisé dans la convention de nom final actuelle.

Règles importantes :

- il peut rester vide ;
- il ne doit pas répéter `target` ;
- il ne doit pas répéter `documentType` ;
- il ne doit pas répéter `issuer` ou `detail` ;
- pour un relevé bancaire, `documentType = releve-bancaire` et `subject` peut rester vide.

Si `subject` est vide ou rejeté, l'UI doit le présenter comme non utilisé, pas comme champ obligatoire manquant.

### `target`

Cible logique du document.

Exemples :

```text
foyer
paul
lea
captur
maison-principale
```

`target` est obligatoire pour générer un nom final valide.

`target` ne doit pas être :

- le type documentaire ;
- une nature générique comme `personne`, `vehicle`, `document`, `property` ;
- le basename du fichier source ;
- un chemin ;
- un numéro sensible.

### `targetKind`

Nature optionnelle de la cible.

Valeurs acceptées :

```text
person
household
vehicle
property
other
```

`targetKind` aide le diagnostic et le prompt, mais n'entre pas dans le nom final.

### `documentType`

Type documentaire normalisé.

Exemples :

```text
facture
facture-entretien
releve-bancaire
avis-imposition
certificat-scolarite
carte-identite
```

`documentType` est obligatoire pour générer un nom final valide.

### `issuer`

Émetteur ou organisme, optionnel.

Exemples :

```text
renault
bnp-paribas
maif
etat
college-monet
```

`issuer` peut être ignoré dans le nom s'il est redondant avec `target` ou `documentType`.

### `detail`

Détail court, optionnel.

Exemples :

```text
vidange
trimestre-1
attestation
```

`detail` est ignoré s'il répète :

- la cible ;
- le type documentaire ;
- l'émetteur ;
- une période déjà portée par `dateToken`.

## Construction Du Nom Final

Le nom final réellement affiché et classé est recalculé localement depuis les champs IA sélectionnés.

Convention :

```text
DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext
```

Champs obligatoires :

- `dateToken` ;
- `target` ;
- `documentType`.

Champs optionnels :

- `issuer` ;
- `detail`.

Exemple :

```text
2026-05_foyer_releve-bancaire_bnp-paribas.pdf
```

`fileNameCandidates` ne décide pas directement du nom classé.

Il sert à :

- diagnostiquer ce que le modèle pensait être un bon nom ;
- comparer avec le nom recalculé localement ;
- repérer une dérive de prompt.

Si `fileNameCandidates` diffère du nom final affiché, il faut diagnostiquer les champs `fields`, pas forcer le nom proposé par le modèle.

## Dates Supportees Dans Le Code Actuel

Le code accepte actuellement :

```text
AAAA-MM-JJ
AAAA-MM
AAAA
```

Les périodes mensuelles restent en `AAAA-MM` dans le nom final.

Exemple :

```text
2026-05_foyer_releve-bancaire_bnp-paribas.pdf
```

Le code actuel ne convertit pas `AAAA-MM` en `AAAA-MM-01` pour la prévisualisation finale.

Pour certains types mensuels, si le modèle retourne une date complète au premier jour du mois, par exemple :

```text
2026-05-01
```

DocSorter peut la ramener à :

```text
2026-05
```

Types concernés notamment :

- relevé bancaire ;
- relevé épargne ;
- facture énergie ;
- facture électricité ;
- facture gaz ;
- facture eau ;
- quittance ;
- loyer.

Pour les contrats, assurances, cartes d'identité ou passeports, une date précise peut être attendue.

## Construction Du Dossier Final

L'IA retourne des candidats dans `folderCandidates`.

Chaque candidat peut indiquer :

- `value` : dossier relatif ;
- `score` ;
- `reason` ;
- `exists` ;
- `requiresCreation` ;
- `role`.

Exemple :

```json
[
  { "value": "Vehicules", "score": 80, "reason": "dossier connu", "exists": true },
  { "value": "Vehicules/Captur", "score": 75, "reason": "dossier plus précis", "requiresCreation": true }
]
```

L'utilisateur choisit un dossier candidat dans l'UI.

Le dossier sélectionné est synchronisé avec le champ de sous-dossier cible réel. Il est ensuite contrôlé par le même flux que le classement.

Un dossier à créer ne déclenche jamais de création automatique. L'utilisateur doit utiliser l'action explicite `Créer ce dossier`, avec confirmation.

## Validation Du Dossier Cible

Un dossier cible IA est refusé s'il :

- est absolu ;
- contient une lettre de lecteur comme `C:\` ;
- commence par `/` ou `\` ;
- contient `..` ;
- dépasse la profondeur autorisée ;
- contient un segment Windows invalide ;
- contient un nom réservé Windows.

Exemples acceptés :

```text
Vehicules/Captur
Finances/Banque
Fiscalite/Foyer/2025
Identite-famille/Paul
```

Exemples refusés :

```text
C:\Users\Seb\Documents
../Secret
Maison/../../Autre
```

## Validation Souple Des Candidats IA

Depuis IA-4B, un candidat invalide ne fait plus échouer toute l'analyse.

Pour chaque candidat `{ value, score, reason }`, DocSorter normalise avant validation.

Normalisation des champs de nommage :

- trim ;
- minuscules ;
- accents retirés ;
- espaces transformés en tirets ;
- ponctuation compactée ;
- caractères incompatibles retirés.

Exemples :

```text
État         -> etat
Compte joint -> compte-joint
BNP Paribas  -> bnp-paribas
Collège Monet -> college-monet
```

La valeur normalisée est celle utilisée pour le nom final.

## Candidats Rejetes Sans Echec Global

Un candidat est rejeté localement si :

- la valeur devient vide après normalisation ;
- la valeur ressemble à un chemin absolu ;
- la valeur contient `..` ;
- la valeur contient une lettre de lecteur Windows ;
- la valeur ressemble à un numéro sensible ;
- la valeur est une date brute hors champ `dateToken` ;
- `target` est égal à `documentType` ;
- `target` est générique, par exemple `personne`, `vehicle`, `document`, `property` ;
- le dossier cible est dangereux.

Si un candidat non sélectionné est rejeté, l'analyse continue.

Si le candidat sélectionné est rejeté, DocSorter choisit le meilleur candidat valide restant.

Si aucun candidat valide ne reste, le champ devient incomplet et un warning est ajouté.

Message utilisateur :

```text
Certains candidats IA ont été ignorés. Analyse conservée.
```

La réponse IA reste rejetée globalement seulement si la structure est inexploitable, par exemple :

- JSON invalide ;
- objet racine absent ;
- champ inconnu dans la structure ;
- score global hors bornes ;
- `source` différent de `ollama` ;
- `fields` mal formé ;
- `candidates` non tableau ;
- `score` ou `reason` de candidat structurellement invalide.

## `responseJson.rejectedCandidates`

Les candidats rejetés sont conservés dans :

```text
responseJson.rejectedCandidates
```

Chaque entrée peut contenir :

```json
{
  "field": "fields.issuer.candidates",
  "index": 0,
  "rawValue": "C:\\secret\\etat",
  "normalizedValue": "c-secret-etat",
  "reason": "Candidat IA invalide : les chemins locaux sont refusés."
}
```

Rôle :

- diagnostiquer pourquoi un candidat n'apparaît pas dans l'UI ;
- comprendre pourquoi un `selected` a changé ;
- affiner le prompt sans casser le flux complet ;
- vérifier que les données sensibles ne sont pas utilisées dans le nom.

## Diagnostic IA

L'UI expose un bouton :

```text
Exporter diagnostic IA
```

Le diagnostic est écrit localement dans le dossier `diagnostics` de `userData`.

Le mode dépend du nom du document :

- fichiers dont le nom commence exactement par `TXX-`, par exemple `T01-...`, `T07-...` : diagnostic complet ;
- autres fichiers : diagnostic expurgé.

En mode complet, le diagnostic peut contenir :

- le texte extrait ;
- l'entrée IA bornée ;
- la suggestion validée ;
- les candidats ;
- les candidats rejetés avec `rawValue` et `normalizedValue` ;
- les warnings ;
- les raisons.

En mode expurgé, les candidats rejetés ne conservent que :

```json
{
  "field": "fields.issuer.candidates",
  "index": 0,
  "reason": "Candidat IA invalide : les chemins locaux sont refusés."
}
```

Les valeurs brutes et normalisées sont retirées pour éviter d'exposer une donnée personnelle.

Le diagnostic ne doit pas être interprété comme une instruction de classement automatique.

## Classement Reel Et Garde-Fous

Le classement réel utilise le nom canonique de classement :

```text
getEffectiveClassificationFilename()
```

Règle :

1. si la prévisualisation IA est valide, elle fournit le nom classé ;
2. sinon l'ancien nom proposé historique peut servir de fallback technique.

Le contrôle collision, `Vérifier avant classement` et `Valider et classer` utilisent le même nom canonique.

Le sous-dossier IA sélectionné est synchronisé avec le sous-dossier cible réel.

Avant mutation disque, le main process conserve les garde-fous :

- document présent dans la dernière file scannée ;
- source encore présente ;
- racine cible sélectionnée ;
- dossier cible existant et accessible ;
- sous-dossier relatif valide ;
- refus des chemins absolus ;
- refus de `..` ;
- validation du nom Windows ;
- collision contrôlée ;
- aucun écrasement ;
- journalisation ;
- annulation de la dernière action.

L'IA ne contourne pas ces contrôles.

## Exemples De Diagnostic

### Releve Bancaire

Texte :

```text
Relevé bancaire BNP Paribas du compte joint pour mai 2026.
```

Réponse attendue :

```text
dateToken = 2026-05
target = foyer
documentType = releve-bancaire
issuer = bnp-paribas
subject = non utilisé ou compte-joint
```

Nom final :

```text
2026-05_foyer_releve-bancaire_bnp-paribas.pdf
```

Si `subject = releve-bancaire`, il doit être ignoré comme redondant avec `documentType`.

### Carte Identite

Texte :

```text
Carte nationale d'identité de Paul. Autorité de délivrance : État.
```

Réponse attendue :

```text
dateToken = date de délivrance si disponible
target = paul
documentType = carte-identite
issuer = etat
```

La date de naissance est exclue du `dateToken`.

### Facture Vehicule

Texte :

```text
Facture Renault Captur vidange du 15/03/2024.
```

Réponse attendue :

```text
dateToken = 2024-03-15
target = captur
documentType = facture
issuer = renault
detail = vidange
```

Nom final possible :

```text
2024-03-15_captur_facture_renault_vidange.pdf
```

## Axes D'Affinage Du Prompt

Utiliser cette section quand une sortie IA semble mauvaise.

### Confusion `subject` / `target`

Symptômes :

- `subject` contient une cible utile ;
- `target` est vide ;
- le nom final ne peut pas être généré.

Affinage :

```text
subject est optionnel et informatif. target est la cible de nommage obligatoire.
```

### Type documentaire mis dans la cible

Symptômes :

```text
target = releve-bancaire
documentType = releve-bancaire
```

Affinage :

```text
target ne doit jamais être égal à documentType.
```

### Dossier trop précis ou inventé

Comparer :

- `folderCandidates` ;
- `knownRelativeFolders` ;
- `requiresCreation` ;
- `exists`.

Affinage :

```text
Préférer un dossier connu pertinent. Si aucun dossier connu ne convient, proposer un dossier à créer puis un fallback.
```

### Trop de détail dans `issuer` ou `detail`

Regarder :

- messages de redondance ;
- nom final recalculé ;
- `rejectedCandidates` ;
- warnings.

Affinage :

```text
issuer est l'organisme. detail est une précision courte. Aucun des deux ne doit répéter target, documentType ou la période déjà portée par dateToken.
```

### Erreur sur les dates

Vérifier :

- `dateToken` ;
- type documentaire ;
- warnings de précision ;
- présence d'une date d'effet, d'émission, de délivrance ou de période.

Affinage :

```text
Pour les documents mensuels, utiliser AAAA-MM. Pour les documents d'identité, utiliser la date de délivrance et exclure la date de naissance.
```

### Analyse conservee Avec Candidats Rejetes

Si le message suivant apparaît :

```text
Certains candidats IA ont été ignorés. Analyse conservée.
```

Inspecter :

```text
responseJson.rejectedCandidates
```

Ne pas modifier le prompt sans vérifier :

- champ concerné ;
- valeur brute en diagnostic complet ;
- valeur normalisée ;
- raison du rejet ;
- candidat finalement sélectionné.

## Anciennes Briques Deterministes

Le dépôt peut encore contenir des modules liés à :

- règles de suggestion ;
- référentiels locaux ;
- suggestions v2 ;
- dossiers v2 ;
- moteur de dates déterministe.

Dans l'état actuel de l'UI, ces briques ne sont pas le moteur principal de proposition affichée.

Elles ne doivent pas être utilisées pour expliquer un résultat IA sans vérifier d'abord :

- `responseJson.fields` ;
- `responseJson.folderCandidates` ;
- `responseJson.fileNameCandidates` ;
- `responseJson.rejectedCandidates` ;
- la prévisualisation IA recalculée localement.

## Garanties

- Aucun upload serveur.
- Aucun appel distant autre qu'Ollama local.
- Aucun document brut envoyé à l'IA.
- Aucun classement automatique après analyse IA.
- Aucune création automatique de dossier.
- Aucune suppression automatique.
- Aucun remplacement automatique de saisie manuelle sans action utilisateur.
- Aucun chemin Windows complet dans le prompt.
- Aucun prompt complet dans les logs standards.
- Diagnostic complet réservé aux fichiers de test `TXX-...`.
- Validation finale toujours humaine.
