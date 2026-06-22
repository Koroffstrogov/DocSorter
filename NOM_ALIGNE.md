# Nom Aligne

Ce document décrit la méthode actuelle de reconnaissance de convention de nommage dans un dossier cible et les règles utilisées pour proposer un nom aligné.

Le nom aligné est une aide locale. Il ne déclenche aucun classement, aucun renommage et aucune création de dossier sans action explicite de l'utilisateur.

## Objectif

DocSorter peut analyser les noms de fichiers déjà présents dans le dossier cible sélectionné afin de détecter une convention locale.

Cette analyse sert à répondre à une question simple :

```text
Le nom proposé par l'IA respecte-t-il la façon dont ce dossier est déjà nommé ?
```

Si une convention exploitable est trouvée, DocSorter peut proposer un nom aligné sur le dossier. L'utilisateur reste libre de garder le nom IA ou de cliquer sur `Utiliser le nom aligné`.

## Modules Concernés

Le mécanisme est principalement porté par :

- `src/folder-learning/parseFolderFileName.ts`
- `src/folder-learning/knownTargetBlockRecognition.ts`
- `src/folder-learning/folderNamingProfile.ts`
- `src/folder-learning/compareNameWithFolderProfile.ts`
- `src/folder-learning/folderLearningPreferences.ts`
- `src/renderer/folderLearningSummary.ts`

Le renderer contient une version locale du résumé pour afficher rapidement l'analyse dans l'interface. Elle doit rester cohérente avec le module pur `folder-learning`.

## Reconnaissance Des Cibles Connues

Le profil de dossier peut recevoir la liste locale des cibles connues.

Cette liste ne remplace pas l'analyse des noms existants. Elle sert seulement à identifier plus clairement les blocs qui ressemblent à une cible.

Pour chaque bloc du nom, DocSorter compare la forme normalisée avec :

- `fileAlias` ;
- `displayName` normalisé ;
- `aliases`.

La comparaison est :

- insensible aux accents ;
- insensible à la casse ;
- faite en kebab-case ;
- limitée aux cibles actives.

Exemple :

```text
Bloc du nom : compte-joint
Cible connue : Compte joint / compte-joint
Résultat : bloc reconnu comme cible probable
```

Types de correspondance :

- `exact-alias` : le bloc correspond exactement a `fileAlias` ou a un alias ;
- `exact-display-name` : le bloc correspond au nom affiche normalise ;
- `controlled-prefix` : le bloc et la cible partagent un prefixe controle, par exemple `maison` et `maison-principale`.

Les prefixes trop courts ne sont pas utilises pour eviter les faux positifs. Un alias court peut seulement matcher s'il correspond exactement au bloc.

Si deux cibles connues correspondent au meme bloc, DocSorter ne force pas le schema. Le profil conserve une ambiguite et l'alignement reste en revue manuelle.

Le diagnostic de pipeline expose alors les reconnaissances et ambiguïtes de blocs cible pour comprendre pourquoi un bloc a ete traite comme `[CIBLE]`.

## Données Analysées

L'analyse porte uniquement sur les noms des fichiers présents dans le dossier cible.

Elle ne lit pas :

- le contenu des PDF ;
- le contenu OCR ;
- les métadonnées internes des fichiers ;
- les dossiers de façon récursive non demandée ;
- les autres documents de la file.

Les entrées qui ne sont pas des fichiers sont ignorées.

## Formats De Fichiers Reconnu

Seules les extensions suivantes sont prises en compte :

```text
.pdf
.jpg
.jpeg
.png
```

Le nom doit être déjà normalisé en blocs séparés par des underscores.

Les blocs internes doivent être en minuscules, sans accent, et en kebab-case :

```text
2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf
2026_lea_certificat-scolarite.pdf
2026_lea_certificat-scolarite_assr_college-monet_t1.pdf
```

Sont ignorés :

- les noms sans date initiale ;
- les noms libres ;
- les noms contenant un chemin ;
- les extensions non supportées ;
- les blocs non normalisés comme `Paul` ;
- les dates impossibles comme `2026-02-31`.

## Dates Reconnues

La date initiale peut avoir quatre précisions :

```text
AAAA-MM-JJ     precision day
AAAA-MM        precision month
AAAA           precision year
AAAA-AAAA      precision school-year
```

Pour `AAAA-AAAA`, la seconde année doit être exactement la première année + 1.

Exemple valide :

```text
2026-2027_lea_certificat-scolarite.pdf
```

Exemple rejeté :

```text
2026-2028_lea_certificat-scolarite.pdf
```

## Patterns Reconnus

Le parser reconnaît plusieurs ordres de blocs.

```text
DATE_DOCUMENT
DATE_DOCUMENT_EMETTEUR
DATE_DOCUMENT_CIBLE
DATE_DOCUMENT_CIBLE_EMETTEUR
DATE_DOCUMENT_CIBLE_EMETTEUR_DETAIL
DATE_CIBLE_DOCUMENT
DATE_CIBLE_DOCUMENT_EMETTEUR
DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL
DATE_CIBLE_DOCUMENT_SUBJECT
DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR
DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR_DETAIL
```

Le format principal produit par DocSorter est :

```text
DATE_CIBLE_DOCUMENT[_SUJET][_EMETTEUR][_DETAIL].ext
```

Le bloc `SUJET` est optionnel. Il est placé après le type documentaire.

## Lecture Semantique Par Defaut

Quand un nom est parsé, DocSorter tente d'en déduire les champs :

- `dateToken`
- `target`
- `documentType`
- `subject`
- `issuer`
- `detail`

Pour les noms simples :

```text
2026_releve-bancaire.pdf
```

DocSorter lit :

```text
documentType = releve-bancaire
target = vide
```

Pour :

```text
2026_lea_certificat-scolarite.pdf
```

DocSorter lit :

```text
target = lea
documentType = certificat-scolarite
```

Pour :

```text
2026_lea_certificat-scolarite_assr_college-monet_t1.pdf
```

DocSorter lit :

```text
target = lea
documentType = certificat-scolarite
subject = assr
issuer = college-monet
detail = t1
```

## Construction Du Profil De Dossier

Une fois les noms parsés, DocSorter construit un profil avec :

- nombre de fichiers analysés ;
- nombre de fichiers reconnus ;
- pattern dominant ;
- nombre de blocs dominant ;
- blocs dominants ;
- précision de date dominante ;
- cible dominante ;
- type documentaire dominant ;
- émetteur dominant ;
- usage du détail ;
- exemples ;
- raisons ;
- avertissements.

Les valeurs dominantes utilisent un seuil de 60 %.

```text
DOMINANT_RATIO = 0.6
```

Un signal est considéré fort si sa cohérence atteint 80 %.

```text
STRONG_COHERENCE_RATIO = 0.8
```

## Statuts Du Profil

Le profil peut avoir quatre statuts :

```text
none
weak
medium
strong
```

Règles actuelles :

- aucun nom reconnu : `none` ;
- 1 a 3 noms reconnus : `weak` ;
- cohérence inférieure à 50 % : `weak` ;
- 8 noms ou plus avec cohérence >= 85 % : `strong` ;
- 8 noms ou plus avec cohérence suffisante mais non forte : `medium` ;
- 4 a 7 noms avec cohérence >= 70 % : `medium` ;
- sinon : `weak`.

Un seul nom reconnu peut donc produire un profil faible exploitable. Dans ce cas, le nom aligné peut être proposé, mais il reste une proposition à valider manuellement.

## Usage Du Detail

L'usage du bloc `detail` est classé ainsi :

```text
never       aucun nom reconnu n'utilise detail
often       au moins 60 % des noms reconnus utilisent detail
sometimes   usage irrégulier
```

Si le dossier n'utilise jamais `detail`, DocSorter peut proposer de supprimer le détail du nom aligné.

Si l'usage est irrégulier, un avertissement est ajouté.

## Analyse Du Schema

Le profil donne des blocs dominants, mais il faut encore savoir ce que chaque bloc représente.

DocSorter compare les blocs dominants aux champs IA courants :

- `target`
- `documentType`
- `subject`
- `issuer`
- `detail`

Le schema est choisi parmi les patterns connus ayant le même nombre de blocs.

Un bloc est compatible si :

- il est égal au champ IA normalisé ;
- ou il commence par ce champ suivi de `-` ;
- ou le champ IA commence par ce bloc suivi de `-`.

Exemple :

```text
bloc dossier = bnp-paribas
champ IA = bnp
```

Cette comparaison est considérée compatible parce que `bnp-paribas` commence par `bnp-`.

## Schema Pret, Ambigu Ou Bloque

Le schema peut être :

```text
ready
ambiguous
blocked
```

Il est `ready` si un ordre de blocs ressort clairement.

Il est `ambiguous` si plusieurs schemas obtiennent le même score.

Il est `blocked` si la correspondance entre les blocs du dossier et les champs IA est insuffisante.

Pour les schemas de plusieurs blocs, au moins deux champs doivent correspondre.

## Compatibilite Du Type Documentaire

Avant de proposer un nom aligné, DocSorter vérifie que le type documentaire dominant du dossier correspond au type IA.

Si le type dominant est différent, l'alignement est mis en revue manuelle et aucun nom aligné fiable n'est imposé.

Exemple :

```text
type IA = releve-bancaire
type dominant dossier = facture-energie
```

Dans ce cas, le dossier ne sert pas à renommer automatiquement le document.

## Regles D'Alignement

Quand le schema est prêt et compatible, DocSorter construit une entrée alignée.

Les adaptations possibles sont :

- aligner la précision de date sur le dossier ;
- aligner la cible sur la cible dominante si elle est fiable ;
- aligner le sujet si le schema local utilise `subject` ;
- supprimer le sujet si le schema local ne l'utilise pas ;
- aligner l'émetteur si le schema local l'utilise ;
- supprimer l'émetteur si le schema local ne l'utilise pas ;
- supprimer le détail si le schema local ne l'utilise pas ou si `detailUsage = never`.

DocSorter n'invente jamais une précision supérieure.

Exemple :

```text
date IA = 2026
precision dossier = day
```

DocSorter ne peut pas inventer le jour. Il ajoute un avertissement.

## Alignement De Date

La précision peut être réduite, jamais augmentée.

Exemples :

```text
2026-05-18 + profil month -> 2026-05
2026-05-18 + profil year  -> 2026
2026-05    + profil year  -> 2026
```

Les dates scolaires `AAAA-AAAA` sont conservées comme précision `school-year`.

## Generation Du Nom Aligne

Le nom aligné est généré avec :

- la date alignée ;
- les blocs du schema détecté ;
- l'extension normalisée.

Exemple avec schema :

```text
DATE_CIBLE_DOCUMENT_SUBJECT_EMETTEUR
```

Champs :

```text
dateToken = 2026
target = lea
documentType = certificat-scolarite
subject = assr
issuer = college-monet
```

Nom aligné :

```text
2026_lea_certificat-scolarite_assr_college-monet.pdf
```

Si un bloc requis par le schema est vide, le nom aligné n'est pas généré.

## Recommandation

La comparaison retourne une recommandation :

```text
keep-ai
prefer-folder-profile
manual-review
```

`keep-ai` signifie que le nom IA est déjà compatible ou qu'aucun profil exploitable n'existe.

`manual-review` signifie qu'un nom aligné peut être proposé mais demande validation manuelle.

`prefer-folder-profile` signifie que le profil du dossier est suffisamment fort ou confirmé pour recommander le nom aligné.

Même dans ce cas, l'application n'applique pas le nom aligné automatiquement.

## Preferences Locales

Après des classements confirmés, DocSorter peut enregistrer une préférence locale de dossier.

Elle contient notamment :

- dossier relatif ;
- schema préféré ;
- précision de date préférée ;
- cible préférée ;
- type documentaire préféré ;
- émetteur préféré ;
- usage du détail ;
- nombre de confirmations ;
- date de dernière confirmation.

Les préférences renforcent la recommandation si elles restent cohérentes avec le dossier.

Si une préférence contredit les noms présents, la recommandation reste en revue manuelle.

## Pipeline Diagnostic

Le pipeline de nom aligné expose les étapes suivantes :

```text
content-ai-analysis
folder-candidate
folder-name-scan
folder-schema-analysis
aligned-name-proposal
```

Chaque étape peut fournir :

- statut ;
- entrées bornées ;
- variables utiles ;
- sortie principale ;
- avertissements ;
- raison bloquante.

Ce pipeline sert au diagnostic et à l'explication de la proposition.

## Limites Volontaires

Le nom aligné ne fait pas :

- d'analyse du contenu documentaire ;
- d'appel IA ;
- d'OCR ;
- d'apprentissage complexe ;
- de classement automatique ;
- de création automatique de dossier ;
- de mutation disque.

Il travaille uniquement sur les noms de fichiers existants et sur les champs IA déjà sélectionnés.

## Exemples

### Dossier Avec Releves Bancaires

Noms existants :

```text
2026-03_compte-joint_releve-bancaire_bnp-paribas.pdf
2026-04_compte-joint_releve-bancaire_bnp-paribas.pdf
```

Champs IA :

```text
dateToken = 2026-05
target = foyer
documentType = releve-bancaire
issuer = bnp-paribas
```

Nom aligné proposé :

```text
2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf
```

Raison :

```text
Cible alignée sur la cible dominante du dossier.
```

### Dossier Scolarite Avec Sujet

Nom existant :

```text
2025_lea_certificat-scolarite_assr_college-monet.pdf
```

Champs IA :

```text
dateToken = 2026
target = lea
documentType = certificat-scolarite
subject = assr
issuer = college-monet
```

Nom aligné proposé :

```text
2026_lea_certificat-scolarite_assr_college-monet.pdf
```

Même avec un seul nom reconnu, le profil est faible mais exploitable.

### Dossier Sans Detail

Noms existants :

```text
2026-01_maison-principale_facture-energie_edf.pdf
2026-02_maison-principale_facture-energie_edf.pdf
```

Champs IA :

```text
dateToken = 2026-03
target = maison-principale
documentType = facture-energie
issuer = edf
detail = mars
```

Nom aligné proposé :

```text
2026-03_maison-principale_facture-energie_edf.pdf
```

Raison :

```text
Détail supprimé car les noms existants du dossier n'utilisent pas ce bloc.
```

## Garanties

- Le nom aligné est toujours une proposition.
- L'utilisateur doit cliquer sur `Utiliser le nom aligné` pour l'appliquer.
- Le classement réel reste soumis aux validations existantes.
- Les collisions restent contrôlées avant classement.
- Le journal et l'annulation restent gérés par le flux de classement.
- Aucun fichier utilisateur n'est modifié par l'analyse de convention.
