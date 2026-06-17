# Nommage et Rangement - IA

Ce document explique comment DocSorter Local détermine :

- le nom proposé pour un fichier ;
- la date documentaire utilisée dans le nom ;
- la cible logique, le type documentaire, l'émetteur et le détail ;
- le sous-dossier cible suggéré ;
- ce qui change quand l'IA locale Ollama est utilisée.

Point important : l'application ne classe jamais automatiquement un document. Les règles locales, les référentiels, le moteur v2 et l'IA proposent des valeurs. L'utilisateur garde toujours la décision finale.

## Etat Actuel

DocSorter contient aujourd'hui deux niveaux de logique :

- le flux applicatif actuel, branché à l'interface, qui utilise encore les champs historiques `Date documentaire`, `Sujet`, `Type` et `Mots-clés` ;
- les briques de nommage v2, affichées dans l'interface en lecture seule, qui utilisent `dateToken`, `target`, `documentType`, `issuer` et `detail`.

Les briques v2 sont testées localement et visibles dans le bloc `Suggestion v2 expérimentale`. Elles ne remplacent pas le flux historique et ne déclenchent aucun classement réel.

## Résumé Du Flux

1. L'utilisateur sélectionne un document dans la file.
2. DocSorter prépare un brouillon de renommage depuis le nom actuel.
3. L'utilisateur peut extraire le texte PDF ou lancer l'OCR image.
4. Les règles locales peuvent proposer date, sujet, type, mots-clés et sous-dossier.
5. Les référentiels locaux peuvent détecter une cible, un type documentaire et un émetteur.
6. Le moteur de dates peut choisir une date documentaire candidate.
7. Le moteur de dossiers v2 peut proposer plusieurs profondeurs de sous-dossier.
8. L'IA locale peut proposer des champs séparés, uniquement après action explicite.
9. L'utilisateur peut appliquer certaines suggestions aux champs vides.
10. DocSorter vérifie le nom, le dossier cible et les collisions.
11. Le classement réel ne se fait qu'après validation explicite.

## Nommage Historique Branché À L'UI

Le panneau actuel `Renommage proposé` construit encore le nom depuis quatre champs :

- `Date documentaire`
- `Sujet`
- `Type`
- `Mots-clés`

Format historique :

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

Ce flux reste celui affiché dans l'application tant que le nommage v2 n'est pas branché à l'interface.

## Nommage V2 Préparé

Le générateur pur v2 produit cette convention :

```text
DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext
```

Exemples :

```text
2024-03-05_captur_facture-entretien_renault_vidange.pdf
2025_foyer_avis-imposition.pdf
2026_lea_certificat-scolarite_college-monet.pdf
```

Champs v2 :

- `dateToken` : date documentaire contrôlée ;
- `target` : cible logique du document, par exemple `captur`, `lea`, `foyer` ;
- `documentType` : type documentaire contrôlé, par exemple `facture-entretien` ;
- `issuer` : émetteur ou organisme, optionnel ;
- `detail` : précision courte, optionnelle.

Le générateur v2 est pur : il ne lit pas de fichier, ne déplace rien, ne renomme rien et ne crée aucun dossier.

## Champs Obligatoires Et Optionnels En V2

Pour générer un nom v2 valide :

- `dateToken` est obligatoire ;
- `target` est obligatoire ;
- `documentType` est obligatoire ;
- `issuer` est optionnel ;
- `detail` est optionnel.

Si `target` ou `documentType` manque, le brouillon v2 peut rester incomplet. DocSorter ne force pas un mauvais nom.

## Date Documentaire V2

La date en tête du nom doit être celle qui aide réellement à retrouver le document, pas automatiquement la date technique du scan, du PDF ou du fichier Windows.

Le domaine pur `src/dates` extrait plusieurs candidats, puis sélectionne un `dateToken`.

Formats acceptés :

```text
AAAA-MM-JJ
AAAA-MM
AAAA
AAAA-env
date-inconnue
```

Le moteur peut détecter :

- dates ISO : `2024-03-05`, `2024-03`, `2024` ;
- dates françaises : `05/03/2024`, `05-03-2024`, `5 mars 2024` ;
- périodes mensuelles : `mai 2026`, `05/2026`, `2026-05` ;
- années scolaires : `2026-2027`, `année scolaire 2026/2027` ;
- métadonnées techniques disponibles : date fichier, date PDF, EXIF, date de scan.

Les dates techniques sont des indices faibles. Elles ne remplacent pas silencieusement une date documentaire trouvée dans le texte.

## Règles De Date Par Type Documentaire

Le moteur de dates applique des règles simples :

- `avis-imposition` : privilégie l'année fiscale ou l'année de référence ;
- `releve-bancaire` : privilégie le mois ou la période couverte ;
- `facture`, `facture-entretien`, `facture-energie` : privilégie la date de facture ou d'émission ;
- `contrat`, `contrat-assurance-habitation`, `avenant` : privilégie la date d'effet, puis signature ou émission ;
- `attestation-scolarite`, `certificat-scolarite`, `bulletin-scolaire` : privilégie l'année scolaire ;
- `carnet-vaccination` : utilise une date de mise à jour visible, sinon une date de scan/EXIF avec avertissement ;
- `carte-identite`, `passeport`, `acte-naissance`, `livret-famille` : privilégie la date d'émission ou d'établissement ;
- type inconnu : utilise seulement une date claire, sinon `date-inconnue`.

Pour une année scolaire, le candidat complet peut être conservé :

```text
candidat = 2026-2027
dateToken du nom = 2026
```

Le candidat complet reste utile pour proposer un dossier détaillé comme `Scolarite/Lea/2026-2027`.

## Dates Sensibles

Une date de naissance peut aider à détecter une personne via les référentiels, mais elle ne doit jamais devenir :

- le `dateToken` du nom ;
- un segment de sous-dossier ;
- un détail ;
- une raison affichée avec la date brute.

Exemple :

```text
Texte : Né le 12/03/2014
Résultat : date-inconnue si aucune autre date documentaire n'est disponible
```

## Référentiels Locaux Contrôlés

DocSorter dispose d'un domaine pur `src/reference-data`.

Il sert à reconnaître de façon déterministe :

- une personne ;
- un véhicule ;
- un bien ou foyer ;
- un fournisseur ou organisme ;
- un type documentaire.

Ces référentiels sont distincts :

- des règles de suggestion historiques ;
- de l'IA locale ;
- du journal ;
- du cache d'analyse ;
- du classement réel.

## Stockage Des Référentiels

Les référentiels sont stockés localement hors du dépôt Git et hors du NAS.

La racine utilisée par l'application est le dossier `userData` d'Electron :

```text
app.getPath("userData")/config/reference-data/
```

Sur Windows, ce dossier dépend de l'utilisateur et du nom de l'application. Il se trouve généralement sous `%APPDATA%`. Le chemin exact n'est pas codé en dur : il est demandé à Electron au moment de l'exécution.

Arborescence attendue :

```text
config/
  reference-data/
    entities/
      people.json
      vehicles.json
      properties.json
      providers.json
    document-types.json
```

Ces fichiers sont des tableaux JSON simples, pas un gros fichier global.

Exemple :

```json
[
  {
    "id": "captur",
    "label": "Renault Captur",
    "fileAlias": "captur",
    "folderAlias": "Vehicules/Captur",
    "aliases": ["renault captur", "captur"]
  }
]
```

Au démarrage et pendant les analyses, le loader reste en lecture seule :

- il ne crée pas automatiquement le dossier `reference-data` ;
- il ne crée pas automatiquement les fichiers JSON ;
- il ne modifie jamais les référentiels ;
- il ne synchronise rien vers un serveur ;
- il ne lit pas ces données depuis le NAS.

Depuis le Lot K, l'application propose aussi une UI locale `Référentiels`.

Cette UI est séparée du workflow de classement et permet uniquement, après action explicite :

- d'ouvrir le dossier local des référentiels ;
- de créer les fichiers JSON manquants avec des tableaux vides ;
- de recharger les référentiels ;
- d'ajouter ou modifier personnes, véhicules, biens et fournisseurs en mode assistant ;
- de désactiver une entrée avec `enabled: false` plutôt que la supprimer réellement dans le workflow simple ;
- d'éditer chaque fichier en JSON direct ;
- de valider puis sauvegarder un fichier.

Elle n'écrit jamais dans la source, la cible, le NAS, le journal de classement ou le cache d'analyse. Les seules mutations disque autorisées sont la création et l'écriture des fichiers JSON sous :

```text
app.getPath("userData")/config/reference-data/
```

Pour `document-types.json`, l'UI privilégie le mode JSON direct afin d'éviter un éditeur complexe dans ce lot.

Comportement si un fichier est absent :

- `people.json`, `vehicles.json`, `properties.json`, `providers.json` absents : listes vides ;
- `document-types.json` absent : types documentaires par défaut embarqués dans `src/reference-data/defaultDocumentTypes.ts` ;
- fichier JSON invalide, structure invalide ou erreur de lecture : chargement bloqué avec erreur sobre.

Le fichier `document-types.json` utilisateur complète ou remplace les types par défaut par `id`. Si un type utilisateur possède le même `id` qu'un type embarqué, l'entrée utilisateur prend la priorité après validation.

## Format Des Entités

Les fichiers `people.json`, `vehicles.json`, `properties.json` et `providers.json` contiennent chacun un tableau d'entrées.

Champs communs pour personnes, véhicules et biens :

```json
{
  "id": "captur",
  "label": "Renault Captur",
  "fileAlias": "captur",
  "folderAlias": "Vehicules/Captur",
  "aliases": ["renault captur", "captur"],
  "enabled": true
}
```

Rôle des champs :

- `id` : identifiant stable en kebab-case ;
- `label` : libellé lisible pour l'utilisateur ;
- `fileAlias` : valeur contrôlée pouvant alimenter le nom v2 ;
- `folderAlias` : segment ou chemin relatif utilisable pour un dossier, si pertinent ;
- `aliases` : mots ou expressions recherchés dans le nom du fichier et le texte extrait ;
- `enabled` : optionnel, `false` désactive l'entrée sans la supprimer.

Les fournisseurs et organismes n'ont pas de `folderAlias`. Ils peuvent avoir des domaines :

```json
{
  "id": "bnp",
  "label": "BNP Paribas",
  "fileAlias": "bnp",
  "aliases": ["bnp", "bnp paribas"],
  "domains": ["bnpparibas.net"],
  "enabled": true
}
```

Les domaines servent uniquement d'indice de détection quand ils apparaissent dans le texte. Ils doivent être stockés sans protocole et sans chemin.

## Format Des Personnes

Les personnes peuvent ajouter une date de naissance :

```json
{
  "id": "lea",
  "label": "Léa",
  "fileAlias": "lea",
  "folderAlias": "Scolarite/Lea",
  "aliases": ["léa", "lea"],
  "birthDate": "2012-06-16",
  "useBirthDateForDetectionOnly": true
}
```

Règle stricte : `birthDate` sert uniquement d'indice de détection. Elle ne doit jamais être injectée dans :

- `fileAlias` ;
- `folderAlias` ;
- `target` ;
- `issuer` ;
- `documentType` ;
- `detail` ;
- un nom de fichier ;
- un sous-dossier.

Même si `16/06/2012` est détecté, le nom peut utiliser `lea`, jamais la date de naissance.

## Format Des Types Documentaires

Le fichier `document-types.json` contient un tableau de types documentaires.

Exemple :

```json
[
  {
    "id": "avis-imposition",
    "label": "Avis d'imposition",
    "fileAlias": "avis-imposition",
    "aliases": ["avis d'imposition", "avis imposition", "impots"],
    "domain": "fiscal",
    "defaultTargetKind": "foyer",
    "defaultDateRule": "period-year",
    "enabled": true
  }
]
```

Rôle des champs :

- `id` : identifiant stable en kebab-case ;
- `label` : libellé lisible ;
- `fileAlias` : valeur contrôlée injectée dans le bloc `documentType` du nom v2 ;
- `aliases` : expressions recherchées dans le nom et le texte ;
- `domain` : domaine métier indicatif ;
- `defaultTargetKind` : cible attendue par défaut, par exemple `person`, `vehicle`, `property` ou `foyer` ;
- `defaultDateRule` : aide le moteur de dates, par exemple `document-date`, `period-year` ou `unknown-ok` ;
- `enabled` : optionnel, `false` désactive le type.

## Validation Des Référentiels

Avant usage, chaque fichier est validé.

DocSorter refuse notamment :

- un JSON invalide ;
- une structure qui n'est pas un tableau ;
- un `id` absent ou mal formé ;
- un doublon d'`id` dans une même famille ;
- un `fileAlias` inutilisable pour le nommage v2 ;
- un `folderAlias` qui ne respecte pas les règles de sous-dossier relatif ;
- une entrée active sans alias ;
- une date de naissance hors format `AAAA-MM-JJ` ;
- un domaine avec protocole, chemin ou casse non normalisée.

Les erreurs restent sobres : elles mentionnent le fichier, la catégorie, l'index ou l'identifiant et le champ concerné. Elles ne recopient pas le contenu complet d'un document personnel.

## Exemples De Référentiels

Exemple véhicule dans `entities/vehicles.json` :

```json
[
  {
    "id": "captur",
    "label": "Renault Captur",
    "fileAlias": "captur",
    "folderAlias": "Vehicules/Captur",
    "aliases": ["renault captur", "captur"]
  }
]
```

Si le texte contient `Renault Captur`, le référentiel peut proposer :

```text
target = captur
```

Exemple personne dans `entities/people.json` :

```json
[
  {
    "id": "lea",
    "label": "Léa",
    "fileAlias": "lea",
    "folderAlias": "Scolarite/Lea",
    "aliases": ["léa", "lea"],
    "birthDate": "2012-06-16",
    "useBirthDateForDetectionOnly": true
  }
]
```

## Brouillon De Suggestion V2

Le domaine pur `src/suggestions` construit un `SuggestionDraftV2`.

Il peut utiliser :

- le nom du fichier source ;
- le texte PDF extrait ;
- le texte OCR image ;
- des métadonnées simples ;
- les candidats des référentiels ;
- l'ancien `NamingDraft` si disponible ;
- le générateur de nom v2 ;
- le moteur de dates.

Le brouillon v2 peut contenir :

```text
dateToken
target
documentType
issuer
detail
proposedName
confidence
reasons
warnings
dateSelection
```

Il ne modifie pas l'interface, ne classe pas et ne touche pas aux fichiers.

## Sous-Dossier Cible Historique

Le sous-dossier cible reste toujours relatif à la racine cible choisie par l'utilisateur.

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
- proposé par l'IA locale ;
- proposé plus tard par le moteur de dossiers v2.

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
Fiscalite/Foyer/2025
```

Exemples refusés :

```text
C:\Users\Seb\Documents
../Secret
Maison/../../Autre
A/B/C/D
```

## Dossiers Cibles V2

Le domaine pur `src/folders` propose plusieurs options de sous-dossier relatif à partir d'un `SuggestionDraftV2`.

Il produit des options de profondeur :

- `court` : domaine seul ;
- `equilibre` : domaine + cible ;
- `detaille` : domaine + cible ou période.

Exemple pour un certificat de scolarité :

```text
court      : Scolarite
equilibre  : Scolarite/Lea
detaille   : Scolarite/Lea/2026-2027
recommande : Scolarite/Lea
```

Le moteur recommande par défaut le chemin le plus court qui reste clair. Il ne propose pas automatiquement une arborescence trop profonde.

## Règles De Profondeur V2

Le niveau `equilibre` est recommandé par défaut quand la cible est connue.

Le niveau `detaille` est recommandé seulement si au moins un signal fort existe :

- le dossier détaillé existe déjà dans les dossiers connus ;
- plusieurs documents similaires sont déjà connus ;
- le type documentaire est périodique ou volumineux ;
- une préférence utilisateur explicite le demande ;
- le type impose une période utile, par exemple fiscalité ou banque.

Le niveau `detaille` n'est pas recommandé seulement parce qu'une année est disponible.

## Règles De Dossier Par Type

Exemples de règles v2 :

- fiscalité : `Fiscalite/Foyer/2025` ;
- banque : `Finances/Banque/2026` ;
- facture entretien véhicule : `Vehicules/Captur` ;
- carnet vaccination : `Sante/Paul` ;
- carte identité : `Identite-famille/Paul` ;
- certificat scolarité : `Scolarite/Lea` ;
- bulletin scolaire : `Scolarite/Lea/2026-2027` ;
- facture énergie : `Maison/Energie/2026` ;
- type inconnu : `Divers/A-traiter-manuellement`.

Les dossiers v2 sont des suggestions. Ils ne créent aucun dossier et ne déclenchent aucun classement.

## Suggestions Locales Sans IA

Après extraction texte PDF ou OCR image, DocSorter peut analyser localement :

- le nom du fichier ;
- l'extrait texte borné ;
- les règles de suggestion par défaut ;
- les règles utilisateur locales.

Les règles historiques peuvent proposer :

- date ;
- sujet ;
- type ;
- mots-clés ;
- sous-dossier cible.

Ces suggestions restent locales, sans appel réseau.

Le bouton `Appliquer aux champs vides` remplit seulement les champs encore vides. Il ne remplace jamais une valeur saisie manuellement.

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
- la proposition v2 déterministe courante ;
- les sous-dossiers relatifs connus ;
- les dossiers racines relatifs disponibles ;
- la convention de nommage v2 ;
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
  "dateToken": "AAAA-MM-JJ, AAAA-MM, AAAA, AAAA-env ou date-inconnue optionnel",
  "target": "cible normalisée optionnelle",
  "documentType": "type documentaire normalisé optionnel",
  "issuer": "émetteur normalisé optionnel",
  "detail": "détail normalisé optionnel",
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
- que `target`, `documentType`, `issuer` et `detail` doivent rester des blocs courts compatibles avec le nommage v2 ;
- qu'elle doit indiquer un avertissement si le signal est faible.

## Validation De La Réponse IA

La réponse IA est toujours validée avant affichage.

DocSorter refuse notamment :

- un JSON invalide ;
- des champs inconnus ;
- un score hors `0..100` ;
- un `dateToken` invalide ;
- un dossier cible absolu ;
- un dossier cible avec `..` ;
- un dossier cible trop profond ;
- une source différente de `ollama`.

Si la réponse est refusée, l'interface affiche une erreur sobre. Aucun champ n'est modifié.

## Comment L'IA Influence Le Nom

L'IA ne modifie pas directement le nom proposé.

Elle affiche une suggestion séparée :

- date ;
- cible ;
- type ;
- émetteur ;
- détail ;
- sous-dossier ;
- score ;
- raisons ;
- avertissements.

L'utilisateur peut ensuite cliquer sur :

```text
Appliquer aux champs vides
```

Dans ce cas, DocSorter copie les valeurs IA vers les champs de renommage qui sont encore vides.

Si une valeur présente vient déjà d'un brouillon automatique ou de la proposition v2, l'IA peut la remplacer uniquement si son score est au moins `70`.

Une saisie manuelle utilisateur n'est jamais remplacée.

Exemple :

```text
Champ Date déjà rempli : 2024-03-05
Champ Sujet vide
Champ Type vide

Suggestion IA :
dateToken = 2024-03-10
target = renault-captur
documentType = facture-entretien
issuer = renault

Résultat après application :
Date reste 2024-03-05
Sujet devient renault-captur
Type devient facture-entretien
Mots-clés devient renault
```

Les champs manuels déjà remplis ne sont pas remplacés.

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

## Conflit Entre Règles, Référentiels Et IA

Les règles locales, les référentiels et l'IA restent séparés.

En pratique :

- les règles locales restent le signal historique branché à l'UI ;
- les référentiels fournissent un signal déterministe pour le nommage v2 ;
- l'IA peut apporter une suggestion supplémentaire ;
- l'utilisateur choisit quoi appliquer ;
- les valeurs déjà saisies restent prioritaires ;
- aucune fusion automatique avancée n'est encore faite.

Si la suggestion IA diffère de la proposition v2 déterministe, DocSorter peut afficher :

```text
Diffère de la proposition V2.
```

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

Le classement réel n'est jamais déclenché par l'IA, les référentiels ou les moteurs v2.

Il nécessite :

1. un document actif ;
2. une cible sélectionnée ;
3. un nom proposé valide ;
4. une destination sans collision ;
5. une vérification avant classement ;
6. une validation explicite de l'utilisateur.

Juste avant la mutation disque, DocSorter refait les contrôles essentiels.

## Exemple V2 Sans IA

Document actif :

```text
scan_renault_captur.pdf
```

Texte extrait :

```text
Facture Renault Captur vidange du 05/03/2024
```

Référentiels détectés :

```text
target = captur
documentType = facture-entretien
issuer = renault
```

Date sélectionnée :

```text
dateToken = 2024-03-05
```

Nom v2 proposé :

```text
2024-03-05_captur_facture-entretien_renault.pdf
```

Dossiers v2 possibles :

```text
court      : Vehicules
equilibre  : Vehicules/Captur
detaille   : Vehicules/Captur/2024
recommande : Vehicules/Captur
```

Aucun fichier n'est déplacé sans validation explicite.

## Exemple Scolarité V2

Document actif :

```text
certificat_lea.pdf
```

Texte extrait :

```text
Certificat de scolarité Léa année scolaire 2026/2027
```

Résultat v2 :

```text
dateToken = 2026
target = lea
documentType = certificat-scolarite
```

Nom v2 proposé :

```text
2026_lea_certificat-scolarite.pdf
```

Dossiers v2 possibles :

```text
court      : Scolarite
equilibre  : Scolarite/Lea
detaille   : Scolarite/Lea/2026-2027
recommande : Scolarite/Lea
```

Le niveau détaillé n'est recommandé que si le dossier existe déjà, si une préférence utilisateur le demande ou si le type documentaire est une série scolaire.

## Exemple Avec IA

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
  "dateToken": "2024-03-05",
  "target": "captur",
  "documentType": "facture-entretien",
  "issuer": "renault",
  "detail": "vidange",
  "targetFolder": "Vehicules/Renault-Captur/Entretien",
  "confidence": 82,
  "reasons": ["Facture et véhicule détectés dans le texte."],
  "warnings": [],
  "source": "ollama"
}
```

Après `Appliquer aux champs vides`, si les champs étaient vides dans le flux historique :

```text
Date documentaire : 2024-03-05
Sujet : captur
Type : facture-entretien
Mots-clés : renault vidange
Sous-dossier cible : Vehicules/Renault-Captur/Entretien
```

Nom v2 proposé :

```text
2024-03-05_captur_facture-entretien_renault_vidange.pdf
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
- Aucune date de naissance injectée dans un nom ou un dossier.
- Validation finale toujours humaine.
