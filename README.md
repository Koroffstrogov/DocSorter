# DocSorter Local

Application desktop locale pour trier, prévisualiser, renommer et déplacer des documents personnels depuis Windows.

## Statut

Lot 3.5 : source, cible, file d'attente réelle, prévisualisation locale PDF/image, prévisualisation du renommage normalisé et contrôle de collision cible en lecture seule.

## Commandes

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Ce qui fonctionne

- application Electron locale avec `contextIsolation: true` et `nodeIntegration: false` ;
- choix d'un dossier source pendant la session ;
- choix d'un dossier cible pendant la session ;
- scan non récursif du dossier source ;
- rafraîchissement manuel du dossier source déjà sélectionné ;
- file d'attente réelle pour `.pdf`, `.jpg`, `.jpeg` et `.png` ;
- exclusion des sous-dossiers, fichiers non supportés et fichiers temporaires Office `~$...` ;
- sélection d'un document actif ;
- affichage des métadonnées de base en lecture seule ;
- prévisualisation locale des images JPG/JPEG/PNG ;
- prévisualisation locale des PDF via canvas ;
- zoom borné entre 50 % et 300 % ;
- navigation page précédente/suivante pour PDF multipages ;
- rotation visuelle des images ;
- marquage visuel `Indisponible` si un fichier disparaît avant sa prévisualisation ;
- conservation du dossier cible pendant les rafraîchissements ;
- panneau `Renommage proposé` en prévisualisation uniquement ;
- proposition de nom recalculée depuis les champs Date documentaire, Sujet, Type et Mots-clés ;
- détection prudente d'une date dans le nom de fichier existant ;
- validation visuelle des champs nécessaires avant futur classement.
- contrôle en lecture seule de la disponibilité du nom proposé dans le dossier cible sélectionné ;
- proposition d'un suffixe `_2` à `_99` si le nom existe déjà dans la cible ;
- application visuelle du suffixe proposé sans renommage ni déplacement.

## Convention de nommage

Format prévisualisé :

```text
AAAA-MM-JJ_Sujet_Type_MotsCles.ext
```

Une année seule est acceptée si la date documentaire complète n'est pas connue :

```text
AAAA_Sujet_Type_MotsCles.ext
```

Règles principales :

- underscores entre les grands blocs ;
- tirets dans les mots d'un même bloc ;
- accents et caractères Windows interdits normalisés ;
- extension conservée en minuscule ;
- date documentaire et sujet requis pour générer un nom final ;
- aucun fichier n'est renommé dans le Lot 3.

## Dépendances

- `pdfjs-dist` : utilisé pour rendre localement les PDF dans un canvas. Cette dépendance est limitée au Lot 2 et ne fait pas d'OCR, d'extraction texte, d'upload ou d'analyse distante.

## Ce qui ne fonctionne pas encore

- pas de renommage réel ;
- pas de déplacement ;
- pas de suppression ;
- pas de configuration persistée ;
- pas de cache ni historique ;
- pas de watcher automatique du dossier source ;
- pas de validation ni déplacement ;
- pas de tri par métadonnées ni recherche dans la file ;
- pas d'OCR, IA, doublons probables, packaging avancé ou DOCX.

## Validations manuelles

- l'application démarre avec `npm run dev` ;
- aucun faux document n'est affiché au démarrage ;
- le bouton `Choisir source` permet de sélectionner un dossier ;
- le bouton `Rafraîchir` est désactivé tant qu'aucune source n'est sélectionnée ;
- les PDF/JPG/JPEG/PNG du dossier apparaissent dans la file d'attente ;
- un nouveau PDF ou PNG ajouté au dossier apparaît après `Rafraîchir` ;
- un fichier supprimé ou déplacé disparaît de la file après `Rafraîchir` ;
- les fichiers non supportés et les sous-dossiers n'apparaissent pas ;
- le bouton `Choisir cible` affiche le chemin cible sélectionné ;
- une image sélectionnée s'affiche réellement ;
- les contrôles zoom image fonctionnent ;
- la rotation image est seulement visuelle ;
- un PDF sélectionné affiche sa première page ;
- les boutons page précédente/suivante fonctionnent sur un PDF multipage ;
- les contrôles zoom PDF fonctionnent ;
- si un fichier est déplacé ou supprimé après le scan, une erreur propre s'affiche et le document peut être marqué `Indisponible` ;
- les champs de renommage apparaissent quand un document est sélectionné ;
- modifier date, sujet, type ou mots-clés met à jour le nom proposé ;
- les accents et caractères interdits sont normalisés dans la proposition ;
- date ou sujet manquant affiche un message de validation ;
- sans cible sélectionnée, le contrôle cible indique qu'aucune cible n'est disponible ;
- avec une cible sélectionnée, un nom absent indique `Nom disponible` ;
- si le nom proposé existe déjà dans la cible, une alternative suffixée est affichée ;
- le bouton `Appliquer le suffixe` modifie seulement la proposition affichée ;
- changer de document réinitialise proprement la proposition ;
- aucun fichier n'est modifié, renommé, déplacé ou supprimé.

## Principes

- aucun upload serveur ;
- aucun tracking ;
- aucune suppression automatique ;
- pas de renommage ni déplacement sans validation explicite ;
- logs sobres pour limiter l'exposition de documents sensibles.
