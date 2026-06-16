# Nommage et Rangement - IA

Ce document explique comment DocSorter Local détermine :

- le nom proposé pour un fichier ;
- le sous-dossier cible suggéré ;
- ce qui change quand l'IA locale Ollama est utilisée.

Point important : l'application ne classe jamais automatiquement un document. Les règles locales et l'IA proposent des valeurs. L'utilisateur garde toujours la décision finale.

## Résumé Du Flux

1. L'utilisateur sélectionne un document dans la file.
2. DocSorter prépare un brouillon de renommage à partir du nom actuel.
3. L'utilisateur peut extraire le texte PDF ou lancer l'OCR image.
4. Les règles locales peuvent proposer date, sujet, type, mots-clés et sous-dossier.
5. L'IA locale peut proposer les mêmes champs, séparément des règles.
6. L'utilisateur peut appliquer les suggestions uniquement aux champs vides.
7. DocSorter calcule le nom final proposé.
8. DocSorter vérifie le dossier cible, le sous-dossier et les collisions.
9. Le classement réel ne se fait qu'après validation explicite.

## Nom De Fichier Proposé

Le nom final suit cette convention :

```text
AAAA-MM-JJ_Sujet_Type_MotsCles.ext
```

Une année seule est acceptée si la date complète n'est pas connue :

```text
AAAA_Sujet_Type_MotsCles.ext
```

Exemple :

```text
2024-03-05_Renault-Captur_Facture_Entretien-Vidange.pdf
```

Le nom est construit depuis quatre champs du panneau `Renommage proposé` :

- `Date documentaire`
- `Sujet`
- `Type`
- `Mots-clés`

L'extension du fichier d'origine est conservée en minuscule.

## Champs Obligatoires Et Recommandés

Pour générer un nom valide :

- la date documentaire est obligatoire ;
- le sujet est obligatoire ;
- le type est recommandé mais non bloquant ;
- les mots-clés sont optionnels.

Si la date ou le sujet manque, DocSorter affiche un message et ne produit pas de nom final fiable.

## Normalisation Du Nom

Avant de construire le nom, DocSorter normalise les champs :

- accents retirés ;
- espaces remplacés par des tirets dans chaque bloc ;
- caractères Windows interdits supprimés ou remplacés ;
- séparateurs multiples compactés ;
- points ou espaces finaux retirés ;
- noms réservés Windows évités ;
- longueur maximale du nom bornée à 180 caractères.

Exemple :

```text
Sujet saisi : Renault Captur / révision
Sujet normalisé : Renault-Captur-revision
```

Les grands blocs sont ensuite séparés par des underscores :

```text
2024-03-05_Renault-Captur-revision_Facture_Entretien.pdf
```

## Brouillon Initial

Quand un document est sélectionné, DocSorter crée un brouillon initial depuis son nom actuel.

Il essaie de détecter :

- une date complète au format `AAAA-MM-JJ` ;
- ou une année `AAAA`.

Le reste du nom sert de base prudente pour le sujet.

Exemple :

```text
Nom actuel : 2024-03-05_facture_renault_captur.pdf
Date détectée : 2024-03-05
Sujet initial : facture-renault-captur
```

Ce brouillon reste modifiable par l'utilisateur.

## Suggestions Locales Sans IA

Après extraction texte PDF ou OCR image, DocSorter peut analyser localement :

- le nom du fichier ;
- l'extrait texte borné ;
- les règles de suggestion par défaut ;
- les règles utilisateur locales.

Les règles peuvent proposer :

- date ;
- sujet ;
- type ;
- mots-clés ;
- sous-dossier cible.

Ces suggestions restent locales, sans appel réseau.

Le bouton `Appliquer aux champs vides` remplit seulement les champs encore vides. Il ne remplace jamais une valeur saisie manuellement.

## Référentiels Locaux Contrôlés

DocSorter prépare aussi des référentiels locaux simples pour le nommage v2.

Ils servent à reconnaître de façon déterministe :

- une cible de classement logique : personne, véhicule, foyer ou bien ;
- un type documentaire contrôlé ;
- un émetteur ou organisme ;
- plus tard, certains détails.

Ces référentiels sont distincts :

- des règles de suggestion ;
- de l'IA locale ;
- du journal ;
- du cache d'analyse.

Ils sont lus localement, sans réseau et sans apprentissage, depuis un emplacement prévu sous :

```text
app.getPath("userData")/config/reference-data/
```

Fichiers prévus :

```text
entities/people.json
entities/vehicles.json
entities/properties.json
entities/providers.json
document-types.json
```

Chaque entrée expose un `fileAlias` contrôlé. C'est cet alias qui pourra alimenter le futur nommage v2.

Exemple :

```json
{
  "id": "captur",
  "label": "Renault Captur",
  "fileAlias": "captur",
  "folderAlias": "Vehicules/Captur",
  "aliases": ["renault captur", "captur"]
}
```

Si le texte contient `Renault Captur`, le référentiel peut proposer :

```text
target = captur
```

Pour les personnes, une date de naissance peut servir uniquement d'indice de détection. Elle ne doit jamais devenir un morceau du nom de fichier, du dossier, de l'émetteur ou du détail.

Exemple :

```json
{
  "id": "lea",
  "label": "Léa",
  "fileAlias": "lea",
  "aliases": ["Léa"],
  "birthDate": "2012-06-16",
  "useBirthDateForDetectionOnly": true
}
```

Même si `16/06/2012` est détecté dans un document, le nom peut utiliser `lea`, jamais la date de naissance.

À ce stade, cette brique est préparatoire : elle ne modifie pas encore l'interface et ne déclenche aucun classement.

## Sous-Dossier Cible

Le sous-dossier cible est toujours relatif à la racine cible choisie par l'utilisateur.

Exemple :

```text
Racine cible : Z:\DocumentsClasses
Sous-dossier : Vehicules/Renault-Captur/Entretien
Destination finale : Z:\DocumentsClasses\Vehicules\Renault-Captur\Entretien
```

Le sous-dossier peut être :

- vide, pour classer à la racine cible ;
- saisi manuellement ;
- sélectionné dans la liste des sous-dossiers existants ;
- proposé par une règle locale ;
- proposé par l'IA locale.

## Validation Du Sous-Dossier

DocSorter refuse un sous-dossier si :

- il est absolu ;
- il contient une lettre de lecteur comme `C:\` ;
- il commence par `/` ou `\` ;
- il contient `..` ;
- il dépasse 3 niveaux ;
- un segment contient des caractères Windows interdits ;
- un segment est un nom réservé Windows.

Exemples acceptés :

```text
Vehicules/Renault-Captur/Entretien
Maison/Assurance
Impots/2024
```

Exemples refusés :

```text
C:\Users\Seb\Documents
../Secret
Maison/../../Autre
A/B/C/D
```

## Quand L'IA Locale Est Utilisée

L'IA locale est utilisée uniquement après une action explicite :

```text
Analyser avec IA locale
```

Elle n'est pas lancée :

- au démarrage ;
- au changement de document ;
- au scan de la source ;
- à l'extraction PDF ;
- à l'OCR image ;
- en lot sur toute la file.

L'utilisateur doit d'abord extraire le texte PDF ou lancer l'OCR image. DocSorter n'envoie pas le PDF ou l'image brute à Ollama.

## Données Envoyées À L'IA

DocSorter construit une entrée bornée pour le document actif.

Elle peut contenir :

- le nom de fichier sans chemin complet ;
- l'extension ;
- un extrait texte PDF ou OCR, limité à 6000 caractères ;
- les suggestions issues des règles locales ;
- les sous-dossiers relatifs connus ;
- les dossiers racines relatifs disponibles ;
- la convention de nommage ;
- une date ou année détectée.

Elle ne contient pas :

- chemin Windows complet ;
- journal de classement ;
- cache complet ;
- autres documents de la file ;
- contenu intégral du document ;
- fichier PDF ou image brut ;
- accès au NAS autre que le document déjà vérifié côté main process.

## Prompt IA

Le prompt demande à Ollama de répondre uniquement avec un JSON valide.

Le JSON attendu peut contenir :

```json
{
  "date": "AAAA-MM-JJ ou AAAA optionnel",
  "documentType": "type normalisé optionnel",
  "subject": "sujet normalisé optionnel",
  "keywords": ["maximum 5 mots-clés"],
  "targetFolder": "dossier relatif optionnel",
  "confidence": 80,
  "reasons": ["raisons courtes"],
  "warnings": ["avertissements courts"],
  "source": "ollama"
}
```

Le prompt rappelle à l'IA :

- qu'elle propose seulement ;
- que l'utilisateur garde la décision finale ;
- que `targetFolder` doit rester relatif ;
- qu'elle ne doit pas inclure de chemin Windows complet ;
- qu'elle doit indiquer un avertissement si le signal est faible.

## Validation De La Réponse IA

La réponse IA est toujours validée avant affichage.

DocSorter refuse notamment :

- un JSON invalide ;
- des champs inconnus ;
- un score hors `0..100` ;
- plus de 5 mots-clés ;
- une date invalide ;
- un dossier cible absolu ;
- un dossier cible avec `..` ;
- un dossier cible trop profond ;
- une source différente de `ollama`.

Si la réponse est refusée, l'interface affiche une erreur sobre. Aucun champ n'est modifié.

## Comment L'IA Influence Le Nom

L'IA ne modifie pas directement le nom proposé.

Elle affiche une suggestion séparée :

- date ;
- type ;
- sujet ;
- mots-clés ;
- sous-dossier ;
- score ;
- raisons ;
- avertissements.

L'utilisateur peut ensuite cliquer sur :

```text
Appliquer aux champs vides
```

Dans ce cas, DocSorter copie uniquement les valeurs IA vers les champs de renommage qui sont encore vides.

Exemple :

```text
Champ Date déjà rempli : 2024-03-05
Champ Sujet vide
Champ Type vide

Suggestion IA :
date = 2024-03-10
subject = Renault-Captur
documentType = facture

Résultat après application :
Date reste 2024-03-05
Sujet devient Renault-Captur
Type devient facture
```

Les champs déjà remplis ne sont pas remplacés.

## Comment L'IA Influence Le Sous-Dossier

L'IA peut proposer un `targetFolder`.

Ce dossier :

- est affiché dans le panneau IA ;
- est validé par le contrat IA ;
- n'est pas appliqué automatiquement ;
- n'est appliqué que si le champ sous-dossier cible est vide ;
- ne crée jamais de dossier automatiquement.

Si le dossier IA est appliqué, DocSorter relance les contrôles existants :

- sous-dossier relatif valide ;
- dossier existant ou dossier à créer explicitement ;
- cible accessible ;
- collision de nom final.

Si le dossier n'existe pas, l'interface peut proposer `Créer ce dossier`, mais la création demande une confirmation explicite.

## Conflit Entre Règles Et IA

Les règles locales et l'IA restent séparées.

Si la suggestion IA diffère des règles locales, DocSorter affiche :

```text
Diffère des règles locales.
```

Il n'y a pas encore de fusion automatique.

En pratique :

- les règles locales restent le signal déterministe ;
- l'IA peut apporter une suggestion supplémentaire ;
- l'utilisateur choisit quoi appliquer ;
- les valeurs déjà saisies restent prioritaires.

## Contrôle De Collision

Après chaque modification utile des champs ou du sous-dossier, DocSorter recalcule :

- le nom proposé ;
- le chemin final prévu ;
- la disponibilité du nom dans la cible.

Si le nom existe déjà, DocSorter propose une alternative suffixée :

```text
document.pdf
document_2.pdf
document_3.pdf
```

Le suffixe n'est qu'une proposition visuelle tant que l'utilisateur ne valide pas le classement.

## Classement Réel

Le classement réel n'est jamais déclenché par l'IA.

Il nécessite :

1. un document actif ;
2. une cible sélectionnée ;
3. un nom proposé valide ;
4. une destination sans collision ;
5. une vérification avant classement ;
6. une validation explicite de l'utilisateur.

Juste avant la mutation disque, DocSorter refait les contrôles essentiels.

## Exemple Complet Avec IA

Document actif :

```text
scan_2024.pdf
```

Texte extrait :

```text
Facture garage Renault Captur du 05/03/2024 vidange
```

Suggestion IA :

```json
{
  "date": "2024-03-05",
  "documentType": "facture",
  "subject": "Renault-Captur",
  "keywords": ["vidange"],
  "targetFolder": "Vehicules/Renault-Captur/Entretien",
  "confidence": 82,
  "reasons": ["Facture et véhicule détectés dans le texte."],
  "warnings": [],
  "source": "ollama"
}
```

Après `Appliquer aux champs vides`, si les champs étaient vides :

```text
Date documentaire : 2024-03-05
Sujet : Renault-Captur
Type : facture
Mots-clés : vidange
Sous-dossier cible : Vehicules/Renault-Captur/Entretien
```

Nom proposé :

```text
2024-03-05_Renault-Captur_facture_vidange.pdf
```

Le fichier n'est déplacé qu'après validation explicite.

## Garanties

- Aucun upload serveur.
- Aucun appel externe : Ollama doit rester local.
- Aucun document brut envoyé à l'IA.
- Aucun classement automatique.
- Aucune création automatique de dossier.
- Aucune suppression automatique.
- Aucun remplacement automatique des champs déjà saisis.
- Aucun log de contenu documentaire sensible.
- Validation finale toujours humaine.
